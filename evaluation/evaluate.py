#!/usr/bin/env python3
"""Evaluate the Visual Search Engine against the final-project requirements.

The script intentionally uses only the Python standard library so it can run
from the host without adding packages to the application containers.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import mimetypes
import os
import platform
import random
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


PROJECT_QUERY_COUNT = 50
VALID_MODES = {"semantic", "ocr", "image"}
VALID_MANUAL_STATUSES = {"pass", "fail", "not_tested"}
VALID_LABEL_STATUSES = {"draft", "reviewed"}
DEFAULT_THRESHOLDS = {
    "semantic_latency_seconds": 2.0,
    "ocr_latency_seconds": 2.0,
    "image_latency_seconds": 3.0,
    "index_seconds_per_image": 5.0,
    "min_indexed_images": 50_000,
    "min_index_batch_images": 50,
}
BOOTSTRAP_CONFIDENCE_LEVEL = 0.95
BOOTSTRAP_RESAMPLES = 10_000


class EvaluationError(RuntimeError):
    """Raised when evaluation cannot continue safely."""


class ApiError(EvaluationError):
    """Raised for an HTTP or API contract error."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return not self.errors


class ApiClient:
    """Small authenticated client for the backend's existing API contract."""

    def __init__(self, base_url: str, *, timeout_seconds: float = 30.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.token: str | None = None

    def login(self, email: str, password: str) -> None:
        payload = self._request_json(
            "POST",
            "/auth/login",
            json_body={"email": email, "password": password},
            authenticated=False,
        )
        token = payload.get("access_token")
        if not isinstance(token, str) or not token:
            raise ApiError("Login response does not contain access_token.")
        self.token = token

    def search_text(self, mode: str, query: str, *, limit: int) -> dict[str, Any]:
        if mode not in {"semantic", "ocr"}:
            raise ValueError("Text search mode must be semantic or ocr.")
        endpoint = "/search/text" if mode == "semantic" else "/search/ocr"
        return self._request_json(
            "GET",
            endpoint,
            query={"q": query, "page": 1, "limit": limit},
        )

    def search_image(
        self,
        *,
        limit: int,
        image_id: int | None = None,
        image_path: Path | None = None,
    ) -> dict[str, Any]:
        if image_path is not None:
            content_type = mimetypes.guess_type(image_path.name)[0] or "application/octet-stream"
            body, multipart_type = _encode_multipart(
                fields={"page": "1", "limit": str(limit)},
                file_field="file",
                file_path=image_path,
                content_type=content_type,
            )
            return self._request_json(
                "POST",
                "/search/image",
                body=body,
                headers={"Content-Type": multipart_type},
            )

        if image_id is None:
            raise ValueError("Image search requires image_path or image_id.")
        body = urllib.parse.urlencode(
            {"image_id": image_id, "page": 1, "limit": limit}
        ).encode("utf-8")
        return self._request_json(
            "POST",
            "/search/image",
            body=body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    def dashboard(self) -> dict[str, Any]:
        return self._request_json("GET", "/admin/dashboard")

    def list_batches(self) -> dict[str, Any]:
        return self._request_json("GET", "/admin/index/batches")

    def batch_status(self, batch_id: str) -> dict[str, Any]:
        quoted = urllib.parse.quote(batch_id, safe="")
        return self._request_json("GET", f"/admin/index/status/{quoted}")

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, Any] | None = None,
        json_body: Mapping[str, Any] | None = None,
        body: bytes | None = None,
        headers: Mapping[str, str] | None = None,
        authenticated: bool = True,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        if query:
            url = f"{url}?{urllib.parse.urlencode(query)}"

        request_headers = {"Accept": "application/json"}
        request_headers.update(headers or {})
        if authenticated:
            if not self.token:
                raise ApiError("Missing access token. Login or pass EVAL_ACCESS_TOKEN.")
            request_headers["Authorization"] = f"Bearer {self.token}"
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            request_headers["Content-Type"] = "application/json"

        request = urllib.request.Request(
            url,
            data=body,
            headers=request_headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8", errors="replace")
            detail = _extract_api_error(raw)
            raise ApiError(
                f"{method} {path} returned HTTP {exc.code}: {detail}",
                status_code=exc.code,
            ) from exc
        except urllib.error.URLError as exc:
            raise ApiError(f"Cannot reach backend at {url}: {exc.reason}") from exc

        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ApiError(f"{method} {path} did not return valid JSON.") from exc
        if not isinstance(payload, dict):
            raise ApiError(f"{method} {path} returned an unexpected JSON value.")
        return payload


def _encode_multipart(
    *,
    fields: Mapping[str, str],
    file_field: str,
    file_path: Path,
    content_type: str,
) -> tuple[bytes, str]:
    boundary = f"----VisualSearchEvaluation{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("ascii"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("ascii"),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    chunks.extend(
        [
            f"--{boundary}\r\n".encode("ascii"),
            (
                f'Content-Disposition: form-data; name="{file_field}"; '
                f'filename="{file_path.name}"\r\n'
            ).encode("utf-8"),
            f"Content-Type: {content_type}\r\n\r\n".encode("ascii"),
            file_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode("ascii"),
        ]
    )
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def _extract_api_error(raw: str) -> str:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return raw.strip()[:500] or "empty response"
    if isinstance(payload, dict):
        return str(payload.get("message") or payload.get("detail") or payload)[:500]
    return str(payload)[:500]


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise EvaluationError(f"Manifest not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise EvaluationError(f"Manifest is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise EvaluationError("Manifest root must be a JSON object.")
    return payload


def validate_manifest(manifest: Mapping[str, Any], manifest_dir: Path) -> ValidationResult:
    result = ValidationResult()
    queries = manifest.get("queries")
    if not isinstance(queries, list):
        result.errors.append("queries must be a list.")
        return result

    target_count = manifest.get("target_query_count", PROJECT_QUERY_COUNT)
    if target_count != PROJECT_QUERY_COUNT:
        result.errors.append(
            f"target_query_count must be {PROJECT_QUERY_COUNT} for the project evaluation."
        )
    if len(queries) != PROJECT_QUERY_COUNT:
        result.errors.append(
            f"Exactly {PROJECT_QUERY_COUNT} queries are required; found {len(queries)}."
        )

    identifiers: set[str] = set()
    mode_counts = {mode: 0 for mode in VALID_MODES}
    for index, query in enumerate(queries, start=1):
        label = f"queries[{index - 1}]"
        if not isinstance(query, dict):
            result.errors.append(f"{label} must be an object.")
            continue
        query_id = query.get("id")
        if not isinstance(query_id, str) or not query_id.strip():
            result.errors.append(f"{label}.id is required.")
        elif query_id in identifiers:
            result.errors.append(f"Duplicate query id: {query_id}.")
        else:
            identifiers.add(query_id)
            label = query_id

        mode = query.get("mode")
        if mode not in VALID_MODES:
            result.errors.append(f"{label}: mode must be semantic, ocr, or image.")
            continue
        mode_counts[mode] += 1

        relevant_ids = query.get("relevant_image_ids")
        if not isinstance(relevant_ids, list) or not relevant_ids:
            result.errors.append(f"{label}: relevant_image_ids must contain manual labels.")
        elif any(not isinstance(value, int) or isinstance(value, bool) for value in relevant_ids):
            result.errors.append(f"{label}: every relevant_image_id must be an integer.")
        else:
            if len(set(relevant_ids)) != len(relevant_ids):
                result.warnings.append(f"{label}: duplicate relevant image ids will be ignored.")
            top_k = _positive_int(manifest.get("top_k"), 10)
            if len(set(relevant_ids)) < top_k:
                result.warnings.append(
                    f"{label}: only {len(set(relevant_ids))} relevant images were labelled; "
                    f"Precision@{top_k} cannot reach 1.0."
                )

        for ids_field in ("judged_image_ids", "candidate_image_ids"):
            values = query.get(ids_field)
            if values is None:
                continue
            if not isinstance(values, list):
                result.errors.append(f"{label}: {ids_field} must be a list of integers.")
            elif any(not isinstance(value, int) or isinstance(value, bool) for value in values):
                result.errors.append(f"{label}: every value in {ids_field} must be an integer.")
            elif len(set(values)) != len(values):
                result.warnings.append(f"{label}: duplicate values in {ids_field} will be ignored.")

        label_status = query.get("label_status")
        if label_status is None:
            result.warnings.append(
                f"{label}: label_status is missing; this query cannot pass the reviewed ground-truth gate."
            )
        elif label_status not in VALID_LABEL_STATUSES:
            result.errors.append(f"{label}: label_status must be draft or reviewed.")
        elif label_status == "draft":
            result.warnings.append(
                f"{label}: labels are still draft; quality metrics will be marked provisional."
            )
        else:
            judged_ids = query.get("judged_image_ids")
            if not isinstance(judged_ids, list) or not judged_ids:
                result.errors.append(
                    f"{label}: reviewed labels require non-empty judged_image_ids."
                )
            elif isinstance(relevant_ids, list) and not set(relevant_ids).issubset(judged_ids):
                result.errors.append(
                    f"{label}: every relevant_image_id must also occur in judged_image_ids."
                )

        relevance_grades = query.get("relevance_grades")
        if relevance_grades is not None:
            if not isinstance(relevance_grades, dict):
                result.errors.append(f"{label}: relevance_grades must be an object.")
            else:
                for image_id, grade in relevance_grades.items():
                    try:
                        parsed_id = int(image_id)
                    except (TypeError, ValueError):
                        result.errors.append(
                            f"{label}: relevance_grades keys must be image IDs."
                        )
                        break
                    if str(parsed_id) != str(image_id) or not isinstance(grade, int) or isinstance(grade, bool) or grade not in {0, 1, 2, 3}:
                        result.errors.append(
                            f"{label}: relevance grades must be integers from 0 to 3."
                        )
                        break

        if mode in {"semantic", "ocr"}:
            text_query = query.get("query")
            if not isinstance(text_query, str) or not text_query.strip() or "TODO" in text_query.upper():
                result.errors.append(f"{label}: query text must be filled in.")
        else:
            has_image_id = isinstance(query.get("image_id"), int) and not isinstance(
                query.get("image_id"), bool
            )
            image_path_value = query.get("image_path")
            has_image_path = isinstance(image_path_value, str) and bool(image_path_value.strip())
            if has_image_id == has_image_path:
                result.errors.append(
                    f"{label}: set exactly one of image_id or image_path."
                )
            elif has_image_path:
                image_path = _resolve_manifest_path(manifest_dir, image_path_value)
                if not image_path.is_file():
                    result.errors.append(f"{label}: image_path does not exist: {image_path}")

    for mode, count in mode_counts.items():
        if count == 0:
            result.errors.append(f"At least one {mode} query is required.")

    top_k = _positive_int(manifest.get("top_k"), 10)
    result_limit = _positive_int(manifest.get("result_limit"), 20)
    if top_k != 10:
        result.errors.append("top_k must be 10 because the project requires Precision@10.")
    if result_limit < 20:
        result.errors.append("result_limit must be at least 20 to verify the Top-20 contract.")
    if top_k > result_limit:
        result.errors.append("top_k cannot be greater than result_limit.")

    thresholds = manifest.get("thresholds", {})
    if thresholds is not None and not isinstance(thresholds, dict):
        result.errors.append("thresholds must be an object.")
    elif isinstance(thresholds, dict):
        for key, value in thresholds.items():
            if key not in DEFAULT_THRESHOLDS:
                result.warnings.append(f"Unknown threshold is ignored: {key}.")
            elif not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
                result.errors.append(f"thresholds.{key} must be a positive number.")

    quality_thresholds = manifest.get("min_mean_precision_at_10", {})
    if not isinstance(quality_thresholds, dict):
        result.errors.append("min_mean_precision_at_10 must be an object.")
    else:
        for mode, value in quality_thresholds.items():
            if mode not in VALID_MODES:
                result.errors.append(
                    f"min_mean_precision_at_10 contains unsupported mode: {mode}."
                )
            elif (
                not isinstance(value, (int, float))
                or isinstance(value, bool)
                or not 0 <= value <= 1
            ):
                result.errors.append(
                    f"min_mean_precision_at_10.{mode} must be between 0 and 1."
                )

    reviewed_queries = [
        query for query in queries if isinstance(query, dict) and query.get("label_status") == "reviewed"
    ]
    if reviewed_queries:
        label_review = manifest.get("label_review")
        if not isinstance(label_review, dict):
            result.errors.append(
                "label_review is required when any query has label_status=reviewed."
            )
        else:
            reviewers = label_review.get("reviewers")
            if not isinstance(reviewers, list) or not reviewers or any(
                not isinstance(value, str) or not value.strip() for value in reviewers
            ):
                result.errors.append("label_review.reviewers must contain reviewer names.")
            if not str(label_review.get("reviewed_at", "")).strip():
                result.errors.append("label_review.reviewed_at is required.")
            if not str(label_review.get("protocol", "")).strip():
                result.errors.append("label_review.protocol is required.")

    manual_checks = manifest.get("manual_checks", [])
    if not isinstance(manual_checks, list) or not manual_checks:
        result.errors.append("manual_checks must contain the final UI/deployment checklist.")
    else:
        for index, check in enumerate(manual_checks):
            if not isinstance(check, dict):
                result.errors.append(f"manual_checks[{index}] must be an object.")
                continue
            if check.get("status") not in VALID_MANUAL_STATUSES:
                result.errors.append(
                    f"manual_checks[{index}].status must be pass, fail, or not_tested."
                )
            if check.get("status") == "pass" and not str(check.get("evidence", "")).strip():
                result.errors.append(
                    f"manual_checks[{index}].evidence is required when status is pass."
                )
    return result


def precision_at_k(
    result_ids: Sequence[int], relevant_ids: Iterable[int], k: int = 10
) -> float:
    if k <= 0:
        raise ValueError("k must be positive.")
    relevant = set(relevant_ids)
    hits = sum(1 for image_id in result_ids[:k] if image_id in relevant)
    return hits / k


def recall_at_k(
    result_ids: Sequence[int], relevant_ids: Iterable[int], k: int = 10
) -> float:
    relevant = set(relevant_ids)
    if not relevant:
        return 0.0
    hits = sum(1 for image_id in result_ids[:k] if image_id in relevant)
    return hits / len(relevant)


def hit_at_k(result_ids: Sequence[int], relevant_ids: Iterable[int], k: int = 10) -> float:
    relevant = set(relevant_ids)
    return 1.0 if any(image_id in relevant for image_id in result_ids[:k]) else 0.0


def reciprocal_rank(result_ids: Sequence[int], relevant_ids: Iterable[int]) -> float:
    relevant = set(relevant_ids)
    for rank, image_id in enumerate(result_ids, start=1):
        if image_id in relevant:
            return 1.0 / rank
    return 0.0


def judged_coverage_at_k(
    result_ids: Sequence[int], judged_ids: Iterable[int], k: int = 10
) -> float:
    if k <= 0:
        raise ValueError("k must be positive.")
    judged = set(judged_ids)
    evaluated = list(result_ids[:k])
    if not evaluated:
        return 1.0
    return sum(1 for image_id in evaluated if image_id in judged) / len(evaluated)


def ndcg_at_k(
    result_ids: Sequence[int],
    relevant_ids: Iterable[int],
    k: int = 10,
    relevance_grades: Mapping[int, int] | None = None,
) -> float:
    if k <= 0:
        raise ValueError("k must be positive.")
    relevant = set(relevant_ids)
    grades = dict(relevance_grades or {})

    def grade(image_id: int) -> int:
        return int(grades.get(image_id, 1 if image_id in relevant else 0))

    def discounted_gain(values: Sequence[int]) -> float:
        total = 0.0
        for rank, value in enumerate(values, start=1):
            total += ((2**value) - 1) / math.log2(rank + 1)
        return total

    actual = [grade(image_id) for image_id in result_ids[:k]]
    ideal_candidates = [grade(image_id) for image_id in set(relevant) | set(grades)]
    ideal = sorted(ideal_candidates, reverse=True)[:k]
    ideal_gain = discounted_gain(ideal)
    return discounted_gain(actual) / ideal_gain if ideal_gain > 0 else 0.0


def percentile(values: Sequence[float], percent: float) -> float | None:
    if not values:
        return None
    if not 0 <= percent <= 100:
        raise ValueError("percent must be between 0 and 100.")
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * percent / 100
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def bootstrap_mean_confidence_interval(
    values: Sequence[float],
    *,
    confidence_level: float = BOOTSTRAP_CONFIDENCE_LEVEL,
    resamples: int = BOOTSTRAP_RESAMPLES,
    seed: int = 2026,
) -> dict[str, Any]:
    """Return a deterministic percentile-bootstrap interval over query means.

    Queries, rather than repeated requests, are resampled. This avoids treating
    repeated latency runs of the same information need as independent quality
    observations.
    """
    if not 0 < confidence_level < 1:
        raise ValueError("confidence_level must be between 0 and 1.")
    if resamples < 1:
        raise ValueError("resamples must be at least 1.")
    normalized = [float(value) for value in values]
    if not normalized:
        return {
            "confidence_level": confidence_level,
            "method": "query_level_percentile_bootstrap",
            "resamples": resamples,
            "sample_size": 0,
            "mean": None,
            "lower": None,
            "upper": None,
        }
    if len(normalized) == 1:
        sample_means = [normalized[0]]
    else:
        generator = random.Random(seed)
        sample_size = len(normalized)
        sample_means = [
            statistics.fmean(generator.choice(normalized) for _ in range(sample_size))
            for _ in range(resamples)
        ]
    tail = (1.0 - confidence_level) / 2.0
    return {
        "confidence_level": confidence_level,
        "method": "query_level_percentile_bootstrap",
        "resamples": resamples,
        "sample_size": len(normalized),
        "mean": statistics.fmean(normalized),
        "lower": percentile(sample_means, tail * 100),
        "upper": percentile(sample_means, (1.0 - tail) * 100),
    }


def summarize_latencies(values: Sequence[float], threshold: float) -> dict[str, Any]:
    if not values:
        return {
            "count": 0,
            "mean_seconds": None,
            "p50_seconds": None,
            "p95_seconds": None,
            "max_seconds": None,
            "threshold_seconds": threshold,
            "under_threshold_count": 0,
            "under_threshold_rate": 0.0,
            "all_under_threshold": False,
        }
    return {
        "count": len(values),
        "mean_seconds": statistics.fmean(values),
        "p50_seconds": percentile(values, 50),
        "p95_seconds": percentile(values, 95),
        "max_seconds": max(values),
        "threshold_seconds": threshold,
        "under_threshold_count": sum(value < threshold for value in values),
        "under_threshold_rate": sum(value < threshold for value in values) / len(values),
        "all_under_threshold": all(value < threshold for value in values),
    }


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _duration_seconds(start_value: Any, end_value: Any) -> float | None:
    start = _parse_datetime(start_value)
    end = _parse_datetime(end_value)
    if start is None or end is None or end < start:
        return None
    return (end - start).total_seconds()


def compute_batch_metrics(
    status: Mapping[str, Any],
    threshold: float,
    minimum_batch_images: int = 50,
) -> dict[str, Any]:
    semantic_seconds = _duration_seconds(
        status.get("semantic_started_at"), status.get("semantic_completed_at")
    )
    ocr_seconds = _duration_seconds(
        status.get("ocr_started_at"), status.get("ocr_completed_at")
    )
    semantic_start = _parse_datetime(status.get("semantic_started_at"))
    ocr_start = _parse_datetime(status.get("ocr_started_at"))
    semantic_end = _parse_datetime(status.get("semantic_completed_at"))
    ocr_end = _parse_datetime(status.get("ocr_completed_at"))

    total_seconds: float | None = None
    if semantic_start and ocr_start and semantic_end and ocr_end:
        total_seconds = (max(semantic_end, ocr_end) - min(semantic_start, ocr_start)).total_seconds()

    semantic_count = _non_negative_int(status.get("processed_images"))
    ocr_count = _non_negative_int(status.get("ocr_processed_images"))
    successful_images = min(semantic_count, ocr_count)
    seconds_per_image = (
        total_seconds / successful_images
        if total_seconds is not None and successful_images > 0
        else None
    )
    semantic_seconds_per_image = (
        semantic_seconds / semantic_count
        if semantic_seconds is not None and semantic_count > 0
        else None
    )
    ocr_seconds_per_image = (
        ocr_seconds / ocr_count
        if ocr_seconds is not None and ocr_count > 0
        else None
    )
    return {
        "batch_id": status.get("batch_id"),
        "status": status.get("status"),
        "total_images": _non_negative_int(status.get("total_images")),
        "successful_images": successful_images,
        "semantic_failed_images": _non_negative_int(status.get("failed_images")),
        "ocr_failed_images": _non_negative_int(status.get("ocr_failed_images")),
        "semantic_seconds": semantic_seconds,
        "ocr_seconds": ocr_seconds,
        "total_index_seconds": total_seconds,
        "semantic_seconds_per_image": semantic_seconds_per_image,
        "ocr_seconds_per_image": ocr_seconds_per_image,
        "seconds_per_image": seconds_per_image,
        "threshold_seconds_per_image": threshold,
        "minimum_batch_images": minimum_batch_images,
        "representative_batch_size_pass": successful_images >= minimum_batch_images,
        "pass": bool(
            status.get("status") == "completed"
            and successful_images >= minimum_batch_images
            and seconds_per_image is not None
            and seconds_per_image < threshold
            and _non_negative_int(status.get("failed_images")) == 0
            and _non_negative_int(status.get("ocr_failed_images")) == 0
        ),
    }


def run_query(
    client: ApiClient,
    query: Mapping[str, Any],
    *,
    manifest_dir: Path,
    top_k: int,
    result_limit: int,
    thresholds: Mapping[str, float],
) -> dict[str, Any]:
    mode = str(query["mode"])
    started = time.perf_counter()
    error: str | None = None
    payload: dict[str, Any] | None = None
    try:
        if mode in {"semantic", "ocr"}:
            payload = client.search_text(mode, str(query["query"]), limit=result_limit)
        else:
            image_path = None
            if query.get("image_path"):
                image_path = _resolve_manifest_path(manifest_dir, str(query["image_path"]))
            image_id = query.get("image_id")
            requested_limit = result_limit + 1 if query.get("exclude_image_id") else result_limit
            payload = client.search_image(
                limit=requested_limit,
                image_id=image_id if isinstance(image_id, int) else None,
                image_path=image_path,
            )
    except (ApiError, OSError, ValueError) as exc:
        error = str(exc)
    latency = time.perf_counter() - started

    items = payload.get("items", []) if payload else []
    if not isinstance(items, list):
        error = error or "Search response items is not a list."
        items = []
    result_ids = [item.get("id") for item in items if isinstance(item, dict)]
    result_ids = [value for value in result_ids if isinstance(value, int)]
    exclude_image_id = query.get("exclude_image_id")
    if isinstance(exclude_image_id, int):
        result_ids = [value for value in result_ids if value != exclude_image_id]
    result_ids = result_ids[:result_limit]

    relevant_ids = list(dict.fromkeys(query.get("relevant_image_ids", [])))
    judged_ids = list(dict.fromkeys(query.get("judged_image_ids", [])))
    raw_grades = query.get("relevance_grades") or {}
    relevance_grades = {
        int(image_id): int(grade)
        for image_id, grade in raw_grades.items()
        if str(image_id).lstrip("-").isdigit() and isinstance(grade, int)
    }
    provisional_precision = precision_at_k(result_ids, relevant_ids, top_k)
    provisional_recall = recall_at_k(result_ids, relevant_ids, top_k)
    provisional_rr = reciprocal_rank(result_ids[:top_k], relevant_ids)
    provisional_ndcg = ndcg_at_k(
        result_ids,
        relevant_ids,
        top_k,
        relevance_grades=relevance_grades,
    )
    provisional_hit = hit_at_k(result_ids, relevant_ids, top_k)
    judged_coverage = judged_coverage_at_k(result_ids, judged_ids, top_k)
    labels_reviewed = query.get("label_status") == "reviewed"
    quality_metrics_ready = labels_reviewed and judged_coverage == 1.0
    total = payload.get("total", 0) if payload else 0
    total = total if isinstance(total, int) else 0
    top20_contract_pass = error is None and len(result_ids) == min(result_limit, max(total, 0))
    latency_threshold = float(thresholds[f"{mode}_latency_seconds"])
    return {
        "id": query.get("id"),
        "mode": mode,
        "query": query.get("query"),
        "image_path": query.get("image_path"),
        "image_id": query.get("image_id"),
        "latency_seconds": latency,
        "latency_threshold_seconds": latency_threshold,
        "latency_pass": error is None and latency < latency_threshold,
        "precision_at_10": provisional_precision if quality_metrics_ready else None,
        "recall_at_10": provisional_recall if quality_metrics_ready else None,
        "reciprocal_rank": provisional_rr if quality_metrics_ready else None,
        "ndcg_at_10": provisional_ndcg if quality_metrics_ready else None,
        "hit_at_10": provisional_hit if quality_metrics_ready else None,
        "provisional_precision_at_10": provisional_precision,
        "provisional_recall_at_10": provisional_recall,
        "provisional_reciprocal_rank": provisional_rr,
        "provisional_ndcg_at_10": provisional_ndcg,
        "provisional_hit_at_10": provisional_hit,
        "label_status": query.get("label_status", "missing"),
        "labels_reviewed": labels_reviewed,
        "judged_image_ids": judged_ids,
        "judged_at_10_count": sum(
            1 for image_id in result_ids[:top_k] if image_id in set(judged_ids)
        ),
        "judged_coverage_at_10": judged_coverage,
        "quality_metrics_ready": quality_metrics_ready,
        "relevant_image_ids": relevant_ids,
        "result_ids": result_ids,
        "returned_count": len(result_ids),
        "api_total": total,
        "top20_contract_pass": top20_contract_pass,
        "error": error,
        "notes": query.get("notes", ""),
    }


def _mean_or_none(values: Iterable[float | None]) -> float | None:
    present = [float(value) for value in values if value is not None]
    return statistics.fmean(present) if present else None


def aggregate_query_attempts(attempts: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    if not attempts:
        raise ValueError("At least one query attempt is required.")
    aggregate = dict(attempts[0])
    successful = [attempt for attempt in attempts if attempt.get("error") is None]
    latencies = [float(attempt["latency_seconds"]) for attempt in successful]
    errors = list(dict.fromkeys(str(attempt["error"]) for attempt in attempts if attempt.get("error")))
    first_success = successful[0] if successful else attempts[0]
    aggregate.update(
        {
            "attempt_count": len(attempts),
            "successful_attempt_count": len(successful),
            "latency_samples_seconds": latencies,
            "latency_seconds": percentile(latencies, 50) if latencies else float(attempts[0]["latency_seconds"]),
            "latency_p95_seconds": percentile(latencies, 95),
            "latency_max_seconds": max(latencies) if latencies else None,
            "latency_pass": bool(successful)
            and len(successful) == len(attempts)
            and all(bool(attempt.get("latency_pass")) for attempt in attempts),
            "precision_at_10": _mean_or_none(attempt.get("precision_at_10") for attempt in successful),
            "recall_at_10": _mean_or_none(attempt.get("recall_at_10") for attempt in successful),
            "reciprocal_rank": _mean_or_none(attempt.get("reciprocal_rank") for attempt in successful),
            "ndcg_at_10": _mean_or_none(attempt.get("ndcg_at_10") for attempt in successful),
            "hit_at_10": _mean_or_none(attempt.get("hit_at_10") for attempt in successful),
            "provisional_precision_at_10": _mean_or_none(
                attempt.get("provisional_precision_at_10") for attempt in successful
            ),
            "provisional_recall_at_10": _mean_or_none(
                attempt.get("provisional_recall_at_10") for attempt in successful
            ),
            "provisional_reciprocal_rank": _mean_or_none(
                attempt.get("provisional_reciprocal_rank") for attempt in successful
            ),
            "provisional_ndcg_at_10": _mean_or_none(
                attempt.get("provisional_ndcg_at_10") for attempt in successful
            ),
            "provisional_hit_at_10": _mean_or_none(
                attempt.get("provisional_hit_at_10") for attempt in successful
            ),
            "judged_coverage_at_10": min(
                (float(attempt.get("judged_coverage_at_10", 0.0)) for attempt in successful),
                default=0.0,
            ),
            "mean_judged_coverage_at_10": _mean_or_none(
                attempt.get("judged_coverage_at_10") for attempt in successful
            ),
            "quality_metrics_ready": bool(successful)
            and all(bool(attempt.get("quality_metrics_ready")) for attempt in successful),
            "top20_contract_pass": bool(successful)
            and len(successful) == len(attempts)
            and all(bool(attempt.get("top20_contract_pass")) for attempt in attempts),
            "result_ids": list(first_success.get("result_ids", [])),
            "returned_count": int(first_success.get("returned_count", 0)),
            "api_total": int(first_success.get("api_total", 0)),
            "error": "; ".join(errors) if errors else None,
        }
    )
    return aggregate


def build_evaluation(
    client: ApiClient,
    manifest: Mapping[str, Any],
    *,
    manifest_dir: Path,
    batch_ids: Sequence[str],
    shuffle: bool,
    seed: int,
    runs: int = 1,
    warmup_runs: int = 0,
) -> dict[str, Any]:
    if runs < 1:
        raise ValueError("runs must be at least 1.")
    if warmup_runs < 0:
        raise ValueError("warmup_runs cannot be negative.")
    run_started = time.perf_counter()
    thresholds: dict[str, float] = {
        key: float(value) for key, value in DEFAULT_THRESHOLDS.items()
    }
    thresholds.update(
        {
            key: float(value)
            for key, value in (manifest.get("thresholds") or {}).items()
            if key in DEFAULT_THRESHOLDS
        }
    )
    top_k = _positive_int(manifest.get("top_k"), 10)
    result_limit = _positive_int(manifest.get("result_limit"), 20)
    source_queries = list(manifest["queries"])
    if warmup_runs:
        warmup_queries = [
            next(query for query in source_queries if query["mode"] == mode)
            for mode in ("semantic", "ocr", "image")
        ]
        for warmup in range(1, warmup_runs + 1):
            print(f"Warm-up {warmup}/{warmup_runs}: semantic, OCR and image", flush=True)
            for query in warmup_queries:
                run_query(
                    client,
                    query,
                    manifest_dir=manifest_dir,
                    top_k=top_k,
                    result_limit=result_limit,
                    thresholds=thresholds,
                )

    attempts_by_id: dict[str, list[dict[str, Any]]] = {
        str(query["id"]): [] for query in source_queries
    }
    for run_number in range(1, runs + 1):
        queries = list(source_queries)
        if shuffle:
            random.Random(seed + run_number - 1).shuffle(queries)
        for position, query in enumerate(queries, start=1):
            print(
                f"[run {run_number}/{runs} {position:02d}/{len(queries)}] "
                f"{query['mode']}: {query['id']}",
                flush=True,
            )
            attempt = run_query(
                client,
                query,
                manifest_dir=manifest_dir,
                top_k=top_k,
                result_limit=result_limit,
                thresholds=thresholds,
            )
            attempt["run_number"] = run_number
            attempts_by_id[str(query["id"])].append(attempt)

    query_results = [
        aggregate_query_attempts(attempts_by_id[str(query["id"])])
        for query in source_queries
    ]

    dashboard_error: str | None = None
    try:
        dashboard = client.dashboard()
    except ApiError as exc:
        dashboard = {}
        dashboard_error = str(exc)
    indexed_images = _non_negative_int(dashboard.get("indexed_images"))
    dataset_indexed_images = _non_negative_int(dashboard.get("dataset_indexed_images"))
    dataset_count_available = "dataset_indexed_images" in dashboard
    counted_indexed_images = dataset_indexed_images if dataset_count_available else indexed_images
    dataset_result = {
        "total_images": _non_negative_int(dashboard.get("total_images")),
        "indexed_images": indexed_images,
        "dataset_indexed_images": dataset_indexed_images if dataset_count_available else None,
        "upload_indexed_images": (
            _non_negative_int(dashboard.get("upload_indexed_images"))
            if "upload_indexed_images" in dashboard
            else None
        ),
        "count_source": "dataset_only" if dataset_count_available else "all_sources_fallback",
        "pending_images": _non_negative_int(dashboard.get("pending_images")),
        "failed_images": _non_negative_int(dashboard.get("failed_images")),
        "minimum_indexed_images": int(thresholds["min_indexed_images"]),
        "pass": dashboard_error is None
        and dataset_count_available
        and counted_indexed_images >= thresholds["min_indexed_images"],
        "error": dashboard_error
        or (None if dataset_count_available else "Backend did not expose dataset-only indexed count; all-source fallback was used."),
    }

    resolved_batch_ids = list(dict.fromkeys(batch_ids))
    batch_resolution_error: str | None = None
    if not resolved_batch_ids:
        try:
            batches_payload = client.list_batches()
            batches = batches_payload.get("items", [])
            latest_completed = next(
                (
                    batch
                    for batch in batches
                    if isinstance(batch, dict)
                    and batch.get("status") == "completed"
                    and _non_negative_int(batch.get("total_images"))
                    >= int(thresholds["min_index_batch_images"])
                ),
                None,
            )
            if latest_completed and latest_completed.get("batch_id"):
                resolved_batch_ids.append(str(latest_completed["batch_id"]))
            else:
                batch_resolution_error = (
                    "No completed indexing batch with at least "
                    f"{int(thresholds['min_index_batch_images'])} images was found."
                )
        except ApiError as exc:
            batch_resolution_error = str(exc)

    indexing_batches: list[dict[str, Any]] = []
    indexing_errors: list[str] = []
    for batch_id in resolved_batch_ids:
        try:
            status = client.batch_status(batch_id)
            indexing_batches.append(
                compute_batch_metrics(
                    status,
                    thresholds["index_seconds_per_image"],
                    int(thresholds["min_index_batch_images"]),
                )
            )
        except ApiError as exc:
            indexing_errors.append(str(exc))
    if batch_resolution_error:
        indexing_errors.append(batch_resolution_error)

    modes: dict[str, dict[str, Any]] = {}
    for mode_index, mode in enumerate(sorted(VALID_MODES)):
        mode_results = [result for result in query_results if result["mode"] == mode]
        successful = [result for result in mode_results if result["error"] is None]
        latencies = [
            latency
            for result in successful
            for latency in result.get("latency_samples_seconds", [])
        ]
        quality_ready = [result for result in successful if result["quality_metrics_ready"]]
        precision_values = [result["precision_at_10"] for result in quality_ready]
        recall_values = [result["recall_at_10"] for result in quality_ready]
        rr_values = [result["reciprocal_rank"] for result in quality_ready]
        ndcg_values = [result["ndcg_at_10"] for result in quality_ready]
        hit_values = [result["hit_at_10"] for result in quality_ready]
        quality_values = {
            "mean_precision_at_10": precision_values,
            "mean_recall_at_10": recall_values,
            "mean_reciprocal_rank": rr_values,
            "mean_ndcg_at_10": ndcg_values,
            "mean_hit_at_10": hit_values,
        }
        confidence_intervals = {
            metric_name: bootstrap_mean_confidence_interval(
                values,
                seed=seed + mode_index * 100 + metric_index,
            )
            for metric_index, (metric_name, values) in enumerate(quality_values.items())
        }
        provisional_precision_values = [
            result["provisional_precision_at_10"] for result in successful
        ]
        provisional_ndcg_values = [result["provisional_ndcg_at_10"] for result in successful]
        provisional_hit_values = [result["provisional_hit_at_10"] for result in successful]
        modes[mode] = {
            "query_count": len(mode_results),
            "successful_query_count": len(successful),
            "failed_query_count": len(mode_results) - len(successful),
            "quality_ready_query_count": len(quality_ready),
            "mean_precision_at_10": statistics.fmean(precision_values)
            if precision_values
            else None,
            "mean_recall_at_10": statistics.fmean(recall_values) if recall_values else None,
            "mean_reciprocal_rank": statistics.fmean(rr_values) if rr_values else None,
            "mean_ndcg_at_10": statistics.fmean(ndcg_values) if ndcg_values else None,
            "mean_hit_at_10": statistics.fmean(hit_values) if hit_values else None,
            "confidence_intervals_95": confidence_intervals,
            "provisional_mean_precision_at_10": statistics.fmean(provisional_precision_values)
            if provisional_precision_values
            else None,
            "provisional_mean_ndcg_at_10": statistics.fmean(provisional_ndcg_values)
            if provisional_ndcg_values
            else None,
            "provisional_mean_hit_at_10": statistics.fmean(provisional_hit_values)
            if provisional_hit_values
            else None,
            "mean_judged_coverage_at_10": statistics.fmean(
                result["mean_judged_coverage_at_10"] for result in successful
            ) if successful else None,
            "all_top10_judged": bool(successful)
            and all(result["quality_metrics_ready"] for result in successful),
            "top20_contract_pass": bool(mode_results)
            and all(result["top20_contract_pass"] for result in mode_results),
            "latency": summarize_latencies(
                latencies, thresholds[f"{mode}_latency_seconds"]
            ),
        }

    overall_quality_ready = [
        result
        for result in query_results
        if result["error"] is None and result["quality_metrics_ready"]
    ]
    overall_quality_values = {
        "mean_precision_at_10": [result["precision_at_10"] for result in overall_quality_ready],
        "mean_recall_at_10": [result["recall_at_10"] for result in overall_quality_ready],
        "mean_reciprocal_rank": [
            result["reciprocal_rank"] for result in overall_quality_ready
        ],
        "mean_ndcg_at_10": [result["ndcg_at_10"] for result in overall_quality_ready],
        "mean_hit_at_10": [result["hit_at_10"] for result in overall_quality_ready],
    }
    overall_quality = {
        "query_count": len(query_results),
        "quality_ready_query_count": len(overall_quality_ready),
        **{
            metric_name: statistics.fmean(values) if values else None
            for metric_name, values in overall_quality_values.items()
        },
        "confidence_intervals_95": {
            metric_name: bootstrap_mean_confidence_interval(
                values,
                seed=seed + 1000 + metric_index,
            )
            for metric_index, (metric_name, values) in enumerate(
                overall_quality_values.items()
            )
        },
    }

    quality_gate: dict[str, Any] = {"configured": False, "pass": None, "by_mode": {}}
    configured_quality = manifest.get("min_mean_precision_at_10")
    if isinstance(configured_quality, dict) and configured_quality:
        quality_gate["configured"] = True
        quality_passes: list[bool] = []
        for mode, target in configured_quality.items():
            if mode not in VALID_MODES or not isinstance(target, (int, float)):
                continue
            measured = modes[mode]["mean_precision_at_10"]
            mode_pass = measured is not None and measured >= float(target)
            quality_gate["by_mode"][mode] = {
                "minimum": float(target),
                "measured": measured,
                "pass": mode_pass,
            }
            quality_passes.append(mode_pass)
        quality_gate["pass"] = bool(quality_passes) and all(quality_passes)

    manual_checks = list(manifest.get("manual_checks", []))
    manual_pass = bool(manual_checks) and all(
        check.get("status") == "pass" for check in manual_checks
    )
    search_count_pass = len(query_results) == PROJECT_QUERY_COUNT
    search_modes_pass = all(
        modes[mode]["query_count"] > 0
        and modes[mode]["failed_query_count"] == 0
        and modes[mode]["top20_contract_pass"]
        for mode in VALID_MODES
    )
    latency_pass = all(modes[mode]["latency"]["all_under_threshold"] for mode in VALID_MODES)
    indexing_pass = bool(indexing_batches) and not indexing_errors and all(
        batch["pass"] for batch in indexing_batches
    )
    quality_pass = quality_gate["pass"] if quality_gate["configured"] else True
    ground_truth_pass = len(query_results) == PROJECT_QUERY_COUNT and all(
        result["quality_metrics_ready"] for result in query_results
    )
    gates = {
        "exactly_50_queries": search_count_pass,
        "three_search_modes_and_top20": search_modes_pass,
        "reviewed_ground_truth_and_full_top10_judging": ground_truth_pass,
        "all_search_requests_under_latency_limit": latency_pass,
        "indexed_dataset_at_least_50000": dataset_result["pass"],
        "indexing_under_5_seconds_per_image": indexing_pass,
        "manual_acceptance_checks": manual_pass,
        "optional_quality_threshold": quality_pass,
    }
    return {
        "schema_version": 2,
        "evaluation_name": manifest.get("evaluation_name", "Visual Search final evaluation"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "evaluation_duration_seconds": time.perf_counter() - run_started,
        "overall_pass": all(gates.values()),
        "gates": gates,
        "environment": collect_environment(client.base_url),
        "configuration": {
            "top_k": top_k,
            "result_limit": result_limit,
            "thresholds": thresholds,
            "shuffle": shuffle,
            "seed": seed,
            "runs": runs,
            "warmup_runs": warmup_runs,
            "quality_confidence_interval": {
                "confidence_level": BOOTSTRAP_CONFIDENCE_LEVEL,
                "method": "query_level_percentile_bootstrap",
                "resamples": BOOTSTRAP_RESAMPLES,
            },
        },
        "search": {
            "query_count": len(query_results),
            "modes": modes,
            "overall_quality": overall_quality,
            "quality_gate": quality_gate,
            "queries": query_results,
        },
        "dataset": dataset_result,
        "indexing": {
            "batches": indexing_batches,
            "errors": indexing_errors,
            "pass": indexing_pass,
        },
        "manual_checks": manual_checks,
    }


def write_outputs(report: Mapping[str, Any], output_dir: Path) -> tuple[Path, Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "evaluation-report.json"
    csv_path = output_dir / "query-results.csv"
    markdown_path = output_dir / "evaluation-report.md"
    json_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    _write_query_csv(report, csv_path)
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    return json_path, csv_path, markdown_path


def _write_query_csv(report: Mapping[str, Any], path: Path) -> None:
    fieldnames = [
        "id",
        "mode",
        "query",
        "image_path",
        "image_id",
        "attempt_count",
        "latency_seconds",
        "latency_p95_seconds",
        "latency_max_seconds",
        "latency_pass",
        "precision_at_10",
        "recall_at_10",
        "reciprocal_rank",
        "ndcg_at_10",
        "hit_at_10",
        "provisional_precision_at_10",
        "provisional_ndcg_at_10",
        "provisional_hit_at_10",
        "label_status",
        "judged_coverage_at_10",
        "quality_metrics_ready",
        "returned_count",
        "top20_contract_pass",
        "error",
        "result_ids",
        "relevant_image_ids",
        "judged_image_ids",
        "notes",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for query in report["search"]["queries"]:
            row = {key: query.get(key) for key in fieldnames}
            row["result_ids"] = ";".join(map(str, query.get("result_ids", [])))
            row["relevant_image_ids"] = ";".join(
                map(str, query.get("relevant_image_ids", []))
            )
            row["judged_image_ids"] = ";".join(
                map(str, query.get("judged_image_ids", []))
            )
            writer.writerow(row)


def render_markdown(report: Mapping[str, Any]) -> str:
    status = "PASS" if report["overall_pass"] else "NOT PASS / INCOMPLETE"
    lines = [
        f"# {report['evaluation_name']}",
        "",
        f"- Generated (UTC): `{report['generated_at']}`",
        f"- Evaluation duration: {_fmt_seconds(report.get('evaluation_duration_seconds'))}",
        f"- Overall: **{status}**",
        "",
        "## Requirement gates",
        "",
        "| Requirement | Result |",
        "|---|---:|",
    ]
    for name, passed in report["gates"].items():
        lines.append(f"| {_humanize(name)} | {'PASS' if passed else 'FAIL'} |")

    environment = report.get("environment", {})
    lines.extend(
        [
            "",
            "## Reproducibility",
            "",
            f"- Git commit: `{environment.get('git_commit') or 'unavailable'}`",
            f"- Python: `{environment.get('python_version') or 'unavailable'}`",
            f"- Platform: `{environment.get('platform') or 'unavailable'}`",
            f"- Logical CPUs visible to evaluator: `{environment.get('logical_cpu_count')}`",
            f"- Backend API: `{environment.get('base_url') or 'unavailable'}`",
            f"- Measured runs / discarded warm-ups: `{report['configuration'].get('runs', 1)}` / "
            f"`{report['configuration'].get('warmup_runs', 0)}`",
        ]
    )

    reliability = report.get("ground_truth_reliability")
    if isinstance(reliability, Mapping):
        overall_reliability = reliability.get("overall", {})
        disagreements = int(overall_reliability.get("disagreement_count", 0) or 0)
        adjudication = reliability.get("adjudication", {})
        adjudication_complete = bool(
            isinstance(adjudication, Mapping) and adjudication.get("complete")
        )
        reliability_status = (
            "INDEPENDENT REVIEW AND ADJUDICATION COMPLETE"
            if adjudication_complete or not disagreements
            else "INDEPENDENT REVIEW COMPLETE; ADJUDICATION PENDING"
        )
        lines.extend(
            [
                "",
                "## Ground-truth reliability",
                "",
                f"- Status: **{reliability_status}**",
                f"- Primary reviewer(s): {', '.join(reliability.get('primary_reviewers', [])) or 'N/A'}",
                f"- Secondary reviewer(s): {', '.join(reliability.get('secondary_reviewers', [])) or 'N/A'}",
                f"- Independent reviewers: **{'YES' if reliability.get('independent_reviewers') else 'NO'}**",
                f"- Completed second-review sample: **{reliability.get('compared_judgements', 0)} / {reliability.get('expected_sample_judgements', 0)}**",
                "",
                "| Scope | Exact agreement | 95% CI | Cohen kappa | Weighted kappa | Binary agreement | Binary kappa | Disagreements |",
                "|---|---:|---:|---:|---:|---:|---:|---:|",
            ]
        )
        reliability_scopes = [("overall", overall_reliability)] + [
            (mode, reliability.get("by_mode", {}).get(mode, {}))
            for mode in ("semantic", "ocr", "image")
        ]
        for scope_name, metrics in reliability_scopes:
            interval = metrics.get("exact_agreement_95_ci", {})
            lines.append(
                f"| {scope_name} | {_fmt_number(metrics.get('exact_agreement'), 3)} | "
                f"{_fmt_confidence_interval(interval)} | "
                f"{_fmt_number(metrics.get('cohen_kappa'), 3)} | "
                f"{_fmt_number(metrics.get('quadratic_weighted_kappa'), 3)} | "
                f"{_fmt_number(metrics.get('binary_relevance_agreement'), 3)} | "
                f"{_fmt_number(metrics.get('binary_cohen_kappa'), 3)} | "
                f"{int(metrics.get('disagreement_count', 0) or 0)} |"
            )
        if disagreements and adjudication_complete:
            lines.extend(
                [
                    "",
                    f"All {disagreements} initial disagreements were resolved by blind "
                    f"adjudicator(s): {', '.join(adjudication.get('reviewers', [])) or 'N/A'}. "
                    "Official search metrics below use the resulting consensus manifest.",
                ]
            )
        elif disagreements:
            lines.extend(
                [
                    "",
                    f"The {disagreements} disagreements are not silently overwritten. "
                    "Official search metrics below still use the primary reviewed manifest "
                    "until blind adjudication produces a consensus manifest.",
                ]
            )

    lines.extend(
        [
            "",
            "## Search quality and response time",
            "",
            "| Mode | Queries | Quality ready | Judged@10 | Mean P@10 | Mean nDCG@10 | Hit@10 | MRR | Mean latency | P95 | Max | Under limit | Limit | Result |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for mode in ("semantic", "ocr", "image"):
        metrics = report["search"]["modes"][mode]
        latency = metrics["latency"]
        mode_pass = (
            metrics["failed_query_count"] == 0
            and metrics["top20_contract_pass"]
            and metrics["all_top10_judged"]
            and latency["all_under_threshold"]
        )
        lines.append(
            "| {mode} | {count} | {ready} | {coverage} | {precision} | {ndcg} | {hit} | {mrr} | {mean} | {p95} | "
            "{maximum} | {under_limit} | {limit} | {result} |".format(
                mode=mode,
                count=metrics["query_count"],
                ready=metrics["quality_ready_query_count"],
                coverage=_fmt_number(metrics["mean_judged_coverage_at_10"], 3),
                precision=_fmt_number(metrics["mean_precision_at_10"], 3),
                ndcg=_fmt_number(metrics["mean_ndcg_at_10"], 3),
                hit=_fmt_number(metrics["mean_hit_at_10"], 3),
                mrr=_fmt_number(metrics["mean_reciprocal_rank"], 3),
                mean=_fmt_seconds(latency["mean_seconds"]),
                p95=_fmt_seconds(latency["p95_seconds"]),
                maximum=_fmt_seconds(latency["max_seconds"]),
                under_limit=f"{latency['under_threshold_rate']:.1%}",
                limit=_fmt_seconds(latency["threshold_seconds"]),
                result="PASS" if mode_pass else "FAIL",
            )
        )

    lines.extend(
        [
            "",
            "### Query-level 95% confidence intervals",
            "",
            "| Scope | P@10 | Recall@10 | nDCG@10 | MRR | Hit@10 |",
            "|---|---:|---:|---:|---:|---:|",
        ]
    )
    quality_scopes = [
        (mode, report["search"]["modes"][mode])
        for mode in ("semantic", "ocr", "image")
    ] + [("overall", report["search"]["overall_quality"])]
    for scope_name, quality in quality_scopes:
        intervals = quality["confidence_intervals_95"]
        lines.append(
            f"| {scope_name} | {_fmt_confidence_interval(intervals['mean_precision_at_10'])} | "
            f"{_fmt_confidence_interval(intervals['mean_recall_at_10'])} | "
            f"{_fmt_confidence_interval(intervals['mean_ndcg_at_10'])} | "
            f"{_fmt_confidence_interval(intervals['mean_reciprocal_rank'])} | "
            f"{_fmt_confidence_interval(intervals['mean_hit_at_10'])} |"
        )
    lines.extend(
        [
            "",
            f"Intervals use {report['configuration']['quality_confidence_interval']['resamples']:,} "
            "percentile-bootstrap resamples over queries. Repeated API runs are aggregated before resampling.",
        ]
    )

    if any(
        report["search"]["modes"][mode]["quality_ready_query_count"]
        < report["search"]["modes"][mode]["query_count"]
        for mode in ("semantic", "ocr", "image")
    ):
        lines.extend(
            [
                "",
                "### Draft-only diagnostics (not valid for the final report)",
                "",
                "| Mode | Provisional P@10 | Provisional nDCG@10 | Provisional Hit@10 |",
                "|---|---:|---:|---:|",
            ]
        )
        for mode in ("semantic", "ocr", "image"):
            metrics = report["search"]["modes"][mode]
            lines.append(
                f"| {mode} | {_fmt_number(metrics['provisional_mean_precision_at_10'], 3)} | "
                f"{_fmt_number(metrics['provisional_mean_ndcg_at_10'], 3)} | "
                f"{_fmt_number(metrics['provisional_mean_hit_at_10'], 3)} |"
            )

    dataset = report["dataset"]
    lines.extend(
        [
            "",
            "## Dataset",
            "",
            f"- Indexed dataset images: **{(dataset.get('dataset_indexed_images') or 0):,}** / required "
            f"**{dataset['minimum_indexed_images']:,}** — "
            f"**{'PASS' if dataset['pass'] else 'FAIL'}**",
            f"- Indexed uploads: {(dataset.get('upload_indexed_images') or 0):,}",
            f"- Indexed images across all sources: {dataset['indexed_images']:,}",
            f"- Total / pending / failed: {dataset['total_images']:,} / "
            f"{dataset['pending_images']:,} / {dataset['failed_images']:,}",
        ]
    )
    if dataset.get("error"):
        lines.append(f"- Error: `{dataset['error']}`")

    lines.extend(
        [
            "",
            "## Indexing performance",
            "",
            "| Batch | Images | Min sample | Total | CLIP/image | OCR/image | Total/image | Limit | Result |",
            "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
        ]
    )
    for batch in report["indexing"]["batches"]:
        lines.append(
            "| {batch_id} | {images} | {minimum} | {total} | {clip} | {ocr} | {per_image} | "
            "{limit} | {result} |".format(
                batch_id=batch["batch_id"],
                images=batch["successful_images"],
                minimum=batch["minimum_batch_images"],
                total=_fmt_seconds(batch["total_index_seconds"]),
                clip=_fmt_seconds(batch["semantic_seconds_per_image"]),
                ocr=_fmt_seconds(batch["ocr_seconds_per_image"]),
                per_image=_fmt_seconds(batch["seconds_per_image"]),
                limit=_fmt_seconds(batch["threshold_seconds_per_image"]),
                result="PASS" if batch["pass"] else "FAIL",
            )
        )
    if not report["indexing"]["batches"]:
        lines.append("| N/A | 0 | 50 | N/A | N/A | N/A | N/A | 5.000s | FAIL |")
    for error in report["indexing"]["errors"]:
        lines.append(f"\n- Indexing evidence error: `{error}`")

    lines.extend(
        [
            "",
            "## Manual acceptance checklist",
            "",
            "| Check | Status | Evidence |",
            "|---|---:|---|",
        ]
    )
    for check in report["manual_checks"]:
        lines.append(
            f"| {_escape_markdown(str(check.get('description') or check.get('id')))} | "
            f"{str(check.get('status', 'not_tested')).upper()} | "
            f"{_escape_markdown(str(check.get('evidence', '')))} |"
        )

    failures = [query for query in report["search"]["queries"] if query["error"]]
    lines.extend(["", "## Query failures", ""])
    if failures:
        for query in failures:
            lines.append(f"- `{query['id']}`: {query['error']}")
    else:
        lines.append("No HTTP or API query failures.")

    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "Precision@10 is reported from manually labelled relevant image IDs. "
            "Final quality metrics are emitted only when labels are reviewed and every "
            "returned Top-10 image has an explicit judgement. nDCG@10 supports optional "
            "graded relevance from 0 to 3. "
            "The project brief does not define a minimum P@10, so quality is measured "
            "but is only used as a pass/fail gate when `min_mean_precision_at_10` is set "
            "in the manifest. Latency compliance is strict: every evaluated request must "
            "be below its mode-specific limit.",
            "",
        ]
    )
    return "\n".join(lines)


def _resolve_manifest_path(manifest_dir: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else (manifest_dir / path).resolve()


def collect_environment(base_url: str) -> dict[str, Any]:
    repository_root = Path(__file__).resolve().parent.parent
    git_commit: str | None = None
    try:
        completed = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repository_root),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=5,
        )
        git_commit = completed.stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        pass
    return {
        "git_commit": git_commit,
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "logical_cpu_count": os.cpu_count(),
        "base_url": base_url,
    }


def _positive_int(value: Any, default: int) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else default


def _non_negative_int(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def _fmt_number(value: Any, digits: int) -> str:
    return "N/A" if value is None else f"{float(value):.{digits}f}"


def _fmt_confidence_interval(interval: Mapping[str, Any]) -> str:
    lower = interval.get("lower")
    upper = interval.get("upper")
    if lower is None or upper is None:
        return "N/A"
    return f"[{float(lower):.3f}, {float(upper):.3f}]"


def _fmt_seconds(value: Any) -> str:
    return "N/A" if value is None else f"{float(value):.3f}s"


def _humanize(value: str) -> str:
    return value.replace("_", " ").capitalize()


def _escape_markdown(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ")


def _load_env_file(path: Path) -> None:
    if not path.is_file():
        raise EvaluationError(f"Environment file not found: {path}")
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _default_output_dir() -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return Path(__file__).resolve().parent / "results" / stamp


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate 3 search modes, P@10, latency, dataset size, and indexing throughput."
    )
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--base-url", default=os.getenv("EVAL_BASE_URL", "http://localhost:8000/api/v1"))
    parser.add_argument("--email", default=os.getenv("EVAL_EMAIL"))
    parser.add_argument("--password", default=os.getenv("EVAL_PASSWORD"))
    parser.add_argument("--token", default=os.getenv("EVAL_ACCESS_TOKEN"))
    parser.add_argument("--env-file", type=Path)
    parser.add_argument("--batch-id", action="append", default=[])
    parser.add_argument(
        "--agreement-report",
        type=Path,
        help="Optional reviewer-agreement.json evidence embedded in the final report.",
    )
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--shuffle", action="store_true")
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument(
        "--runs",
        type=int,
        default=3,
        help="Repeat the complete 50-query suite and aggregate latency/quality (default: 3).",
    )
    parser.add_argument(
        "--warmup-runs",
        type=int,
        default=1,
        help="Discarded warm-up rounds, one request per search mode (default: 1).",
    )
    parser.add_argument("--validate-only", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.env_file:
            _load_env_file(args.env_file.resolve())
            args.email = args.email or os.getenv("EVAL_EMAIL") or os.getenv("SEED_ADMIN_EMAIL")
            args.password = (
                args.password
                or os.getenv("EVAL_PASSWORD")
                or os.getenv("SEED_ADMIN_PASSWORD")
            )
            args.token = args.token or os.getenv("EVAL_ACCESS_TOKEN")

        manifest_path = args.manifest.resolve()
        manifest = load_manifest(manifest_path)
        validation = validate_manifest(manifest, manifest_path.parent)
        for warning in validation.warnings:
            print(f"WARNING: {warning}", file=sys.stderr)
        if not validation.valid:
            for error in validation.errors:
                print(f"ERROR: {error}", file=sys.stderr)
            print(
                f"Manifest validation failed with {len(validation.errors)} error(s).",
                file=sys.stderr,
            )
            return 2
        if args.validate_only:
            print(
                f"Manifest is valid: {len(manifest['queries'])} queries across all 3 modes."
            )
            return 0

        client = ApiClient(args.base_url, timeout_seconds=args.timeout)
        if args.token:
            client.token = args.token
        elif args.email and args.password:
            client.login(args.email, args.password)
        else:
            raise EvaluationError(
                "Authentication is required. Set EVAL_ACCESS_TOKEN or EVAL_EMAIL and "
                "EVAL_PASSWORD (an admin account is required for dataset/index metrics)."
            )

        manifest_batch_ids = manifest.get("indexing_batch_ids", [])
        if not isinstance(manifest_batch_ids, list):
            raise EvaluationError("indexing_batch_ids must be a list.")
        report = build_evaluation(
            client,
            manifest,
            manifest_dir=manifest_path.parent,
            batch_ids=[*manifest_batch_ids, *args.batch_id],
            shuffle=args.shuffle,
            seed=args.seed,
            runs=args.runs,
            warmup_runs=args.warmup_runs,
        )
        if args.agreement_report:
            agreement_path = args.agreement_report.resolve()
            agreement_report = load_manifest(agreement_path)
            if not isinstance(agreement_report.get("overall"), dict):
                raise EvaluationError(
                    "Agreement report must contain an overall metrics object."
                )
            report["ground_truth_reliability"] = agreement_report
            report["configuration"]["agreement_report"] = str(agreement_path)
        output_dir = args.output_dir.resolve() if args.output_dir else _default_output_dir()
        json_path, csv_path, markdown_path = write_outputs(report, output_dir)
        print(f"JSON report: {json_path}")
        print(f"CSV details: {csv_path}")
        print(f"Markdown report: {markdown_path}")
        print(f"Overall: {'PASS' if report['overall_pass'] else 'NOT PASS / INCOMPLETE'}")
        return 0 if report["overall_pass"] else 2
    except (EvaluationError, OSError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
