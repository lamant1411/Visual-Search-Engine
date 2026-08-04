"""Small thread-safe dynamic batcher for synchronous inference callers."""

from dataclasses import dataclass, field
import queue
from threading import Event, Lock, Thread
from time import monotonic
from typing import Callable, Generic, Optional, Sequence, TypeVar, cast


InputT = TypeVar("InputT")
OutputT = TypeVar("OutputT")
_STOP = object()


@dataclass
class _BatchRequest(Generic[InputT, OutputT]):
    value: InputT
    completed: Event = field(default_factory=Event)
    result: Optional[OutputT] = None
    error: Optional[Exception] = None


class DynamicBatcher(Generic[InputT, OutputT]):
    """Combine concurrent synchronous calls into a bounded inference batch."""

    def __init__(
        self,
        process_batch: Callable[[Sequence[InputT]], Sequence[OutputT]],
        *,
        max_batch_size: int,
        max_wait_seconds: float,
        name: str,
    ) -> None:
        if max_batch_size < 1:
            raise ValueError("max_batch_size must be >= 1.")
        if max_wait_seconds < 0:
            raise ValueError("max_wait_seconds must be >= 0.")

        self._process_batch = process_batch
        self._max_batch_size = max_batch_size
        self._max_wait_seconds = max_wait_seconds
        self._queue: queue.Queue[object] = queue.Queue()
        self._state_lock = Lock()
        self._closed = False
        self._worker = Thread(target=self._run, name=name, daemon=True)
        self._worker.start()

    def submit(self, value: InputT) -> OutputT:
        request: _BatchRequest[InputT, OutputT] = _BatchRequest(value=value)
        with self._state_lock:
            if self._closed:
                raise RuntimeError("DynamicBatcher is closed.")
            self._queue.put(request)

        request.completed.wait()
        if request.error is not None:
            raise request.error
        return cast(OutputT, request.result)

    def close(self, timeout: float = 2.0) -> None:
        with self._state_lock:
            if self._closed:
                return
            self._closed = True
            self._queue.put(_STOP)
        self._worker.join(timeout=timeout)

    def _run(self) -> None:
        while True:
            queued = self._queue.get()
            if queued is _STOP:
                self._queue.task_done()
                return

            first = cast(_BatchRequest[InputT, OutputT], queued)
            requests = [first]
            deadline = monotonic() + self._max_wait_seconds
            stop_after_batch = False

            while len(requests) < self._max_batch_size:
                remaining = deadline - monotonic()
                if remaining <= 0:
                    break
                try:
                    queued = self._queue.get(timeout=remaining)
                except queue.Empty:
                    break
                if queued is _STOP:
                    self._queue.task_done()
                    with self._state_lock:
                        self._closed = True
                    stop_after_batch = True
                    break
                requests.append(cast(_BatchRequest[InputT, OutputT], queued))

            self._complete_batch(requests)
            if stop_after_batch:
                return

    def _complete_batch(
        self,
        requests: Sequence[_BatchRequest[InputT, OutputT]],
    ) -> None:
        try:
            results = list(self._process_batch([request.value for request in requests]))
            if len(results) != len(requests):
                raise RuntimeError(
                    "Batch processor returned "
                    f"{len(results)} results for {len(requests)} requests."
                )
            for request, result in zip(requests, results):
                request.result = result
        except Exception as exc:
            for request in requests:
                request.error = exc
        finally:
            for request in requests:
                request.completed.set()
                self._queue.task_done()
