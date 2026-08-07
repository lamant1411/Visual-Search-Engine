#!/usr/bin/env python3
"""Create a blind, stratified sample for an independent second reviewer.

The script intentionally copies no relevance labels or reviewer identity from
the primary manifest. Sampling happens independently inside every query, so all
search modes and all query types remain represented.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import random
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence


DEFAULT_INPUT = Path(__file__).resolve().parent / "ground-truth.reviewed.json"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "reliability" / "second-review.sample.json"


def manifest_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _candidate_ids(query: Mapping[str, Any]) -> list[int]:
    raw = query.get("candidate_image_ids")
    if not isinstance(raw, list) or not raw:
        raise ValueError(f"{query.get('id', '<unknown>')}: candidate_image_ids is empty.")
    try:
        candidates = [int(value) for value in raw]
    except (TypeError, ValueError) as exc:
        raise ValueError(
            f"{query.get('id', '<unknown>')}: candidate_image_ids must contain integers."
        ) from exc
    if len(candidates) != len(set(candidates)):
        raise ValueError(f"{query.get('id', '<unknown>')}: duplicate candidate image IDs.")
    return candidates


def _explicit_grades(query: Mapping[str, Any]) -> dict[int, int]:
    raw = query.get("relevance_grades")
    if not isinstance(raw, dict):
        raise ValueError(
            f"{query.get('id', '<unknown>')}: a reviewed relevance_grades mapping is required."
        )
    grades: dict[int, int] = {}
    for image_id, grade in raw.items():
        try:
            normalized_id = int(image_id)
            normalized_grade = int(grade)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"{query.get('id', '<unknown>')}: invalid relevance grade {image_id}={grade}."
            ) from exc
        if normalized_grade not in {0, 1, 2}:
            raise ValueError(
                f"{query.get('id', '<unknown>')}: grade for image {normalized_id} must be 0, 1 or 2."
            )
        grades[normalized_id] = normalized_grade
    return grades


def build_blind_sample(
    primary: Mapping[str, Any],
    *,
    source_sha256: str,
    source_name: str,
    sample_ratio: float = 0.30,
    minimum_per_query: int = 10,
    seed: int = 2026,
) -> dict[str, Any]:
    if not 0 < sample_ratio <= 1:
        raise ValueError("sample_ratio must be greater than 0 and no greater than 1.")
    if minimum_per_query < 1:
        raise ValueError("minimum_per_query must be at least 1.")
    queries = primary.get("queries")
    if not isinstance(queries, list) or not queries:
        raise ValueError("The primary manifest has no queries.")

    sampled_queries: list[dict[str, Any]] = []
    source_count = 0
    selected_count = 0
    mode_counts: dict[str, int] = {}
    for source_query in queries:
        if not isinstance(source_query, dict):
            raise ValueError("Every query must be an object.")
        query_id = str(source_query.get("id", "")).strip()
        if not query_id:
            raise ValueError("Every query must have an id.")
        candidates = _candidate_ids(source_query)
        grades = _explicit_grades(source_query)
        missing = sorted(set(candidates) - set(grades))
        if missing:
            raise ValueError(
                f"{query_id}: {len(missing)} candidates do not have explicit primary grades."
            )

        sample_size = min(
            len(candidates),
            max(minimum_per_query, int(math.ceil(len(candidates) * sample_ratio))),
        )
        shuffled = list(candidates)
        random.Random(f"{seed}:{query_id}").shuffle(shuffled)
        selected = shuffled[:sample_size]

        query = {
            key: copy.deepcopy(source_query[key])
            for key in ("id", "mode", "query", "image_id", "image_path", "exclude_image_id")
            if key in source_query
        }
        query.update(
            {
                "notes": "Independent blind second-review sample.",
                "candidate_image_ids": selected,
                "judged_image_ids": [],
                "relevant_image_ids": [],
                "relevance_grades": {},
                "label_status": "draft",
            }
        )
        sampled_queries.append(query)
        source_count += len(candidates)
        selected_count += sample_size
        mode = str(source_query.get("mode", "unknown"))
        mode_counts[mode] = mode_counts.get(mode, 0) + sample_size

    output = {
        key: copy.deepcopy(primary[key])
        for key in (
            "schema_version",
            "target_query_count",
            "top_k",
            "result_limit",
        )
        if key in primary
    }
    output.update(
        {
            "evaluation_name": f"{primary.get('evaluation_name', 'Visual Search evaluation')} - blind second review",
            "queries": sampled_queries,
            "manual_checks": [],
            "reliability_review": {
                "review_round": 2,
                "blind": True,
                "sampling_method": "uniform_without_replacement_within_each_query",
                "sample_ratio": sample_ratio,
                "minimum_per_query": minimum_per_query,
                "seed": seed,
                "source_manifest_name": source_name,
                "source_manifest_sha256": source_sha256,
                "source_judgement_count": source_count,
                "selected_judgement_count": selected_count,
                "selected_by_mode": dict(sorted(mode_counts.items())),
            },
        }
    )
    return output


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--sample-ratio", type=float, default=0.30)
    parser.add_argument("--minimum-per-query", type=int, default=10)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    source = args.input.resolve()
    output = args.output.resolve()
    if not source.is_file():
        print(f"Primary reviewed manifest not found: {source}", file=sys.stderr)
        return 1
    if output.exists() and not args.force:
        print(f"Output already exists: {output}. Pass --force to replace it.", file=sys.stderr)
        return 1
    try:
        primary = json.loads(source.read_text(encoding="utf-8"))
        sample = build_blind_sample(
            primary,
            source_sha256=manifest_sha256(source),
            source_name=source.name,
            sample_ratio=args.sample_ratio,
            minimum_per_query=args.minimum_per_query,
            seed=args.seed,
        )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(sample, ensure_ascii=False, indent=2), encoding="utf-8")
    metadata = sample["reliability_review"]
    print(
        f"Selected {metadata['selected_judgement_count']} of "
        f"{metadata['source_judgement_count']} judgements across {len(sample['queries'])} queries."
    )
    print(f"Per mode: {metadata['selected_by_mode']}")
    print(f"Wrote blind second-review manifest: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
