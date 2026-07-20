import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import cpu_runtime


class CpuRuntimeSettingsTests(unittest.TestCase):
    def test_defaults_reserve_cpu_and_cap_budget(self):
        settings = cpu_runtime.load_cpu_runtime_settings({}, available_cpus=8)

        self.assertEqual(settings.cpu_budget, 4)
        self.assertEqual(settings.item_workers, 1)
        self.assertEqual(settings.torch_threads, 4)
        self.assertEqual(settings.torch_interop_threads, 1)

    def test_budget_is_split_across_workers(self):
        settings = cpu_runtime.load_cpu_runtime_settings(
            {"AI_CPU_THREADS": "6", "MAX_INDEX_WORKERS": "3"},
            available_cpus=8,
        )

        self.assertEqual(settings.cpu_budget, 6)
        self.assertEqual(settings.item_workers, 3)
        self.assertEqual(settings.torch_threads, 2)

    def test_workers_are_capped_by_cpu_budget(self):
        settings = cpu_runtime.load_cpu_runtime_settings(
            {"AI_CPU_THREADS": "2", "MAX_INDEX_WORKERS": "8"},
            available_cpus=16,
        )

        self.assertEqual(settings.requested_item_workers, 8)
        self.assertEqual(settings.item_workers, 2)
        self.assertEqual(settings.torch_threads, 1)

    def test_native_thread_defaults_preserve_explicit_environment(self):
        settings = cpu_runtime.load_cpu_runtime_settings(
            {"AI_CPU_THREADS": "2"},
            available_cpus=8,
        )
        environ = {"OMP_NUM_THREADS": "1"}

        cpu_runtime.apply_thread_environment(settings, environ)

        self.assertEqual(environ["OMP_NUM_THREADS"], "1")
        self.assertEqual(environ["MKL_NUM_THREADS"], "2")
        self.assertEqual(environ["TOKENIZERS_PARALLELISM"], "false")

    def test_configure_torch_runtime(self):
        settings = cpu_runtime.load_cpu_runtime_settings(
            {
                "AI_CPU_THREADS": "4",
                "MAX_INDEX_WORKERS": "2",
                "TORCH_NUM_INTEROP_THREADS": "1",
            },
            available_cpus=8,
        )
        torch_module = MagicMock()

        cpu_runtime.configure_torch_runtime(torch_module, settings)

        torch_module.set_num_threads.assert_called_once_with(2)
        torch_module.set_num_interop_threads.assert_called_once_with(1)

    def test_invalid_values_fail_fast(self):
        with self.assertRaisesRegex(ValueError, "AI_CPU_THREADS"):
            cpu_runtime.load_cpu_runtime_settings(
                {"AI_CPU_THREADS": "0"},
                available_cpus=8,
            )


if __name__ == "__main__":
    unittest.main()
