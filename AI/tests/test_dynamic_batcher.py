import sys
import unittest
from pathlib import Path
from threading import Barrier, Lock, Thread
from time import perf_counter


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from dynamic_batcher import DynamicBatcher


class DynamicBatcherTests(unittest.TestCase):
    def test_combines_concurrent_requests(self):
        processed_batches = []
        batches_lock = Lock()

        def process(values):
            with batches_lock:
                processed_batches.append(list(values))
            return [value * 10 for value in values]

        batcher = DynamicBatcher(
            process,
            max_batch_size=2,
            max_wait_seconds=0.1,
            name="test-combine-batcher",
        )
        barrier = Barrier(3)
        results = [None, None]

        def submit(index, value):
            barrier.wait()
            results[index] = batcher.submit(value)

        threads = [
            Thread(target=submit, args=(0, 1)),
            Thread(target=submit, args=(1, 2)),
        ]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=1)
        batcher.close()

        self.assertEqual(results, [10, 20])
        self.assertEqual(len(processed_batches), 1)
        self.assertEqual(sorted(processed_batches[0]), [1, 2])

    def test_flushes_single_request_after_deadline(self):
        batcher = DynamicBatcher(
            lambda values: [value + 1 for value in values],
            max_batch_size=2,
            max_wait_seconds=0.01,
            name="test-deadline-batcher",
        )

        started_at = perf_counter()
        result = batcher.submit(4)
        elapsed = perf_counter() - started_at
        batcher.close()

        self.assertEqual(result, 5)
        self.assertGreaterEqual(elapsed, 0.005)
        self.assertLess(elapsed, 0.5)

    def test_propagates_batch_failure(self):
        def fail(_values):
            raise ValueError("inference failed")

        batcher = DynamicBatcher(
            fail,
            max_batch_size=2,
            max_wait_seconds=0,
            name="test-error-batcher",
        )

        with self.assertRaisesRegex(ValueError, "inference failed"):
            batcher.submit(1)
        batcher.close()

    def test_rejects_wrong_result_count(self):
        batcher = DynamicBatcher(
            lambda _values: [],
            max_batch_size=2,
            max_wait_seconds=0,
            name="test-count-batcher",
        )

        with self.assertRaisesRegex(RuntimeError, "0 results for 1 requests"):
            batcher.submit(1)
        batcher.close()


if __name__ == "__main__":
    unittest.main()
