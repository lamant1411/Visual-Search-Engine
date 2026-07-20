"""CPU concurrency settings shared by CLIP, EasyOCR, and item workers."""

from dataclasses import dataclass
import os
from typing import Any, Mapping, MutableMapping, Optional


DEFAULT_MAX_CPU_THREADS = 4
_MATH_THREAD_ENV_VARS = (
    "OMP_NUM_THREADS",
    "MKL_NUM_THREADS",
    "OPENBLAS_NUM_THREADS",
    "NUMEXPR_NUM_THREADS",
)


@dataclass(frozen=True)
class CpuRuntimeSettings:
    available_cpus: int
    cpu_budget: int
    requested_item_workers: int
    item_workers: int
    torch_threads: int
    torch_interop_threads: int


def _available_cpu_count() -> int:
    """Prefer the process CPU affinity when the platform exposes it."""
    try:
        return max(1, len(os.sched_getaffinity(0)))
    except (AttributeError, NotImplementedError, OSError):
        return max(1, os.cpu_count() or 1)


def _positive_int(environ: Mapping[str, str], name: str, default: int) -> int:
    raw_value = environ.get(name)
    if raw_value is None or not raw_value.strip():
        return default
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a positive integer, got {raw_value!r}.") from exc
    if value < 1:
        raise ValueError(f"{name} must be >= 1, got {value}.")
    return value


def load_cpu_runtime_settings(
    environ: Optional[Mapping[str, str]] = None,
    available_cpus: Optional[int] = None,
) -> CpuRuntimeSettings:
    """Resolve a bounded CPU budget and split it across item workers."""
    values = os.environ if environ is None else environ
    detected_cpus = max(1, available_cpus or _available_cpu_count())

    # Reserve one logical CPU for API/DB work. Above four inference threads,
    # memory bandwidth commonly dominates this CPU-only model pipeline.
    default_budget = min(DEFAULT_MAX_CPU_THREADS, max(1, detected_cpus - 1))
    cpu_budget = min(
        detected_cpus,
        _positive_int(values, "AI_CPU_THREADS", default_budget),
    )
    requested_workers = _positive_int(values, "MAX_INDEX_WORKERS", 1)
    item_workers = min(requested_workers, cpu_budget)
    torch_threads = max(1, cpu_budget // item_workers)
    torch_interop_threads = _positive_int(values, "TORCH_NUM_INTEROP_THREADS", 1)

    return CpuRuntimeSettings(
        available_cpus=detected_cpus,
        cpu_budget=cpu_budget,
        requested_item_workers=requested_workers,
        item_workers=item_workers,
        torch_threads=torch_threads,
        torch_interop_threads=torch_interop_threads,
    )


def apply_thread_environment(
    settings: CpuRuntimeSettings,
    environ: Optional[MutableMapping[str, str]] = None,
) -> None:
    """Set native-library defaults before importing torch/numpy-backed models."""
    values = os.environ if environ is None else environ
    thread_count = str(settings.torch_threads)
    for name in _MATH_THREAD_ENV_VARS:
        values.setdefault(name, thread_count)
    values.setdefault("TOKENIZERS_PARALLELISM", "false")


def configure_torch_runtime(
    torch_module: Any,
    settings: Optional[CpuRuntimeSettings] = None,
) -> None:
    """Apply PyTorch intra-op and inter-op limits before the first inference."""
    resolved = CPU_SETTINGS if settings is None else settings
    torch_module.set_num_threads(resolved.torch_threads)
    try:
        torch_module.set_num_interop_threads(resolved.torch_interop_threads)
    except RuntimeError:
        # PyTorch only allows changing inter-op threads before parallel work
        # starts. Development reloads should remain harmless.
        pass


CPU_SETTINGS = load_cpu_runtime_settings()
apply_thread_environment(CPU_SETTINGS)
