#!/usr/bin/env python3
"""Measure reviewer agreement and prepare blind disagreement adjudication.

The primary manifest remains unchanged. The script compares only image/query
pairs selected in the second-review sample, reports exact and binary agreement,
Cohen's kappa, quadratic-weighted kappa, and writes a blind manifest containing
only disagreements. An optional third adjudication file can be used to create a
consensus manifest without re-indexing any image.
"""

from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import json
import math
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


DEFAULT_PRIMARY = Path(__file__).resolve().parent / "ground-truth.reviewed.json"
DEFAULT_SECONDARY = Path(__file__).resolve().parent / "reliability" / "second-review.reviewed.json"


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object.")
    return value


def reviewer_names(manifest: Mapping[str, Any]) -> list[str]:
    review = manifest.get("label_review")
    if not isinstance(review, Mapping):
        return []
    names = review.get("reviewers")
    if not isinstance(names, list):
        return []
    return [str(name).strip() for name in names if str(name).strip()]


def grade_map(query: Mapping[str, Any]) -> dict[int, int]:
    raw = query.get("relevance_grades")
    if not isinstance(raw, Mapping):
        return {}
    output: dict[int, int] = {}
    for image_id, grade in raw.items():
        try:
            normalized_id = int(image_id)
            normalized_grade = int(grade)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"{query.get('id', '<unknown>')}: invalid grade {image_id}={grade}."
            ) from exc
        if normalized_grade not in {0, 1, 2}:
            raise ValueError(
                f"{query.get('id', '<unknown>')}: grade for image {normalized_id} must be 0, 1 or 2."
            )
        output[normalized_id] = normalized_grade
    return output


def cohen_kappa(first: Sequence[int], second: Sequence[int], labels: Sequence[int]) -> float | None:
    if len(first) != len(second):
        raise ValueError("Reviewer grade arrays must have equal length.")
    if not first:
        return None
    count = len(first)
    observed = sum(left == right for left, right in zip(first, second)) / count
    first_rates = {label: first.count(label) / count for label in labels}
    second_rates = {label: second.count(label) / count for label in labels}
    expected = sum(first_rates[label] * second_rates[label] for label in labels)
    if math.isclose(expected, 1.0):
        return 1.0 if math.isclose(observed, 1.0) else 0.0
    return (observed - expected) / (1.0 - expected)


def quadratic_weighted_kappa(
    first: Sequence[int], second: Sequence[int], labels: Sequence[int]
) -> float | None:
    if len(first) != len(second):
        raise ValueError("Reviewer grade arrays must have equal length.")
    if not first:
        return None
    count = len(first)
    label_count = len(labels)
    positions = {label: index for index, label in enumerate(labels)}
    first_counts = {label: first.count(label) for label in labels}
    second_counts = {label: second.count(label) for label in labels}
    observed_disagreement = 0.0
    expected_disagreement = 0.0
    denominator = max(1, label_count - 1) ** 2
    for left_label in labels:
        for right_label in labels:
            weight = ((positions[left_label] - positions[right_label]) ** 2) / denominator
            observed_count = sum(
                left == left_label and right == right_label
                for left, right in zip(first, second)
            )
            expected_count = first_counts[left_label] * second_counts[right_label] / count
            observed_disagreement += weight * observed_count
            expected_disagreement += weight * expected_count
    if math.isclose(expected_disagreement, 0.0):
        return 1.0 if math.isclose(observed_disagreement, 0.0) else 0.0
    return 1.0 - observed_disagreement / expected_disagreement


def wilson_interval(successes: int, count: int, z: float = 1.959963984540054) -> dict[str, float | int | None]:
    if count == 0:
        return {"confidence_level": 0.95, "lower": None, "upper": None, "count": 0}
    rate = successes / count
    z2 = z * z
    center = (rate + z2 / (2 * count)) / (1 + z2 / count)
    margin = z * math.sqrt(rate * (1 - rate) / count + z2 / (4 * count * count)) / (
        1 + z2 / count
    )
    return {
        "confidence_level": 0.95,
        "lower": max(0.0, center - margin),
        "upper": min(1.0, center + margin),
        "count": count,
    }


def summarize_records(records: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    first = [int(record["primary_grade"]) for record in records]
    second = [int(record["secondary_grade"]) for record in records]
    exact = sum(left == right for left, right in zip(first, second))
    binary_first = [int(value > 0) for value in first]
    binary_second = [int(value > 0) for value in second]
    binary_exact = sum(left == right for left, right in zip(binary_first, binary_second))
    confusion = {
        str(left): {str(right): 0 for right in (0, 1, 2)} for left in (0, 1, 2)
    }
    for left, right in zip(first, second):
        confusion[str(left)][str(right)] += 1
    return {
        "judgement_count": len(records),
        "exact_agreement": exact / len(records) if records else None,
        "exact_agreement_95_ci": wilson_interval(exact, len(records)),
        "binary_relevance_agreement": binary_exact / len(records) if records else None,
        "cohen_kappa": cohen_kappa(first, second, (0, 1, 2)),
        "quadratic_weighted_kappa": quadratic_weighted_kappa(first, second, (0, 1, 2)),
        "binary_cohen_kappa": cohen_kappa(binary_first, binary_second, (0, 1)),
        "disagreement_count": len(records) - exact,
        "confusion_matrix_primary_rows_secondary_columns": confusion,
    }


def compare_manifests(
    primary: Mapping[str, Any], secondary: Mapping[str, Any], *, primary_sha256: str
) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    metadata = secondary.get("reliability_review")
    if isinstance(metadata, Mapping):
        expected_hash = str(metadata.get("source_manifest_sha256", ""))
        if expected_hash and expected_hash != primary_sha256:
            raise ValueError(
                "The second-review sample was created from a different primary manifest "
                f"(expected SHA-256 {expected_hash}, got {primary_sha256})."
            )
    else:
        warnings.append("Secondary manifest has no reliability_review provenance metadata.")

    primary_queries = {
        str(query.get("id")): query
        for query in primary.get("queries", [])
        if isinstance(query, Mapping)
    }
    records: list[dict[str, Any]] = []
    expected_count = 0
    missing_count = 0
    for secondary_query in secondary.get("queries", []):
        if not isinstance(secondary_query, Mapping):
            continue
        query_id = str(secondary_query.get("id", ""))
        primary_query = primary_queries.get(query_id)
        if primary_query is None:
            raise ValueError(f"Secondary query {query_id!r} does not exist in the primary manifest.")
        if secondary_query.get("mode") != primary_query.get("mode"):
            raise ValueError(f"{query_id}: search mode differs between manifests.")
        candidates = secondary_query.get("candidate_image_ids")
        if not isinstance(candidates, list):
            raise ValueError(f"{query_id}: secondary candidate_image_ids must be a list.")
        primary_grades = grade_map(primary_query)
        secondary_grades = grade_map(secondary_query)
        for raw_image_id in candidates:
            image_id = int(raw_image_id)
            expected_count += 1
            if image_id not in primary_grades:
                raise ValueError(f"{query_id}: image {image_id} has no primary grade.")
            if image_id not in secondary_grades:
                missing_count += 1
                continue
            records.append(
                {
                    "query_id": query_id,
                    "mode": str(primary_query.get("mode")),
                    "query": primary_query.get("query"),
                    "image_id": image_id,
                    "primary_grade": primary_grades[image_id],
                    "secondary_grade": secondary_grades[image_id],
                }
            )

    primary_reviewers = reviewer_names(primary)
    secondary_reviewers = reviewer_names(secondary)
    independent = bool(primary_reviewers and secondary_reviewers) and not bool(
        set(primary_reviewers) & set(secondary_reviewers)
    )
    if not secondary_reviewers:
        warnings.append("The second-review export does not identify its reviewer.")
    elif not independent:
        warnings.append("Primary and secondary reviewer names overlap; the review is not independent.")
    if missing_count:
        warnings.append(f"Second review is incomplete: {missing_count} sampled judgements are missing.")

    by_mode: dict[str, dict[str, Any]] = {}
    for mode in ("semantic", "ocr", "image"):
        by_mode[mode] = summarize_records([record for record in records if record["mode"] == mode])
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "primary_reviewers": primary_reviewers,
        "secondary_reviewers": secondary_reviewers,
        "independent_reviewers": independent,
        "expected_sample_judgements": expected_count,
        "compared_judgements": len(records),
        "missing_secondary_judgements": missing_count,
        "second_review_complete": missing_count == 0 and expected_count > 0,
        "warnings": warnings,
        "overall": summarize_records(records),
        "by_mode": by_mode,
    }
    return report, records, warnings


def build_adjudication_manifest(
    primary: Mapping[str, Any],
    disagreements: Sequence[Mapping[str, Any]],
    *,
    primary_sha256: str,
    secondary_sha256: str,
) -> dict[str, Any]:
    ids_by_query: dict[str, list[int]] = defaultdict(list)
    for record in disagreements:
        ids_by_query[str(record["query_id"])].append(int(record["image_id"]))
    output_queries: list[dict[str, Any]] = []
    for source_query in primary.get("queries", []):
        if not isinstance(source_query, Mapping):
            continue
        query_id = str(source_query.get("id", ""))
        image_ids = ids_by_query.get(query_id)
        if not image_ids:
            continue
        query = {
            key: copy.deepcopy(source_query[key])
            for key in ("id", "mode", "query", "image_id", "image_path", "exclude_image_id")
            if key in source_query
        }
        query.update(
            {
                "notes": "Blind adjudication: review only reviewer disagreements.",
                "candidate_image_ids": image_ids,
                "judged_image_ids": [],
                "relevant_image_ids": [],
                "relevance_grades": {},
                "label_status": "draft",
            }
        )
        output_queries.append(query)
    return {
        "schema_version": 1,
        "evaluation_name": "Visual Search ground-truth disagreement adjudication",
        "queries": output_queries,
        "manual_checks": [],
        "reliability_review": {
            "review_round": "adjudication",
            "blind": True,
            "sampling_method": "all_primary_secondary_disagreements",
            "source_manifest_sha256": primary_sha256,
            "secondary_manifest_sha256": secondary_sha256,
            "selected_judgement_count": len(disagreements),
        },
    }


def merge_consensus(
    primary: Mapping[str, Any],
    secondary: Mapping[str, Any],
    adjudication: Mapping[str, Any],
    records: Sequence[Mapping[str, Any]],
    agreement_report: Mapping[str, Any],
) -> dict[str, Any]:
    adjudication_queries = {
        str(query.get("id")): grade_map(query)
        for query in adjudication.get("queries", [])
        if isinstance(query, Mapping)
    }
    resolved: dict[tuple[str, int], int] = {}
    for record in records:
        query_id = str(record["query_id"])
        image_id = int(record["image_id"])
        primary_grade = int(record["primary_grade"])
        secondary_grade = int(record["secondary_grade"])
        if primary_grade == secondary_grade:
            resolved[(query_id, image_id)] = primary_grade
            continue
        adjudication_grade = adjudication_queries.get(query_id, {}).get(image_id)
        if adjudication_grade is None:
            raise ValueError(
                f"Adjudication is missing disagreement {query_id}, image {image_id}."
            )
        resolved[(query_id, image_id)] = adjudication_grade

    output = copy.deepcopy(primary)
    for query in output.get("queries", []):
        query_id = str(query.get("id", ""))
        grades = grade_map(query)
        for (resolved_query, image_id), grade in resolved.items():
            if resolved_query == query_id:
                grades[image_id] = grade
        query["relevance_grades"] = {str(image_id): grades[image_id] for image_id in sorted(grades)}
        query["judged_image_ids"] = sorted(grades)
        query["relevant_image_ids"] = sorted(
            image_id for image_id, grade in grades.items() if grade > 0
        )
        query["label_status"] = "reviewed"

    names: list[str] = []
    for manifest in (primary, secondary, adjudication):
        for name in reviewer_names(manifest):
            if name not in names:
                names.append(name)
    old_review = output.get("label_review")
    protocol = str(old_review.get("protocol", "")) if isinstance(old_review, Mapping) else ""
    output["label_review"] = {
        "reviewers": names,
        "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "protocol": (protocol + " Independent sampled second review; disagreements resolved by blind adjudication.").strip(),
        "candidate_pool": (
            old_review.get("candidate_pool", "") if isinstance(old_review, Mapping) else ""
        ),
    }
    output["reliability_evidence"] = {
        "independent_reviewers": agreement_report.get("independent_reviewers"),
        "sample_judgement_count": agreement_report.get("compared_judgements"),
        "exact_agreement": agreement_report.get("overall", {}).get("exact_agreement"),
        "cohen_kappa": agreement_report.get("overall", {}).get("cohen_kappa"),
        "quadratic_weighted_kappa": agreement_report.get("overall", {}).get(
            "quadratic_weighted_kappa"
        ),
        "binary_cohen_kappa": agreement_report.get("overall", {}).get("binary_cohen_kappa"),
        "disagreements_adjudicated": agreement_report.get("overall", {}).get(
            "disagreement_count"
        ),
        "adjudication_complete": bool(
            agreement_report.get("adjudication", {}).get("complete")
        ),
        "adjudicators": list(
            agreement_report.get("adjudication", {}).get("reviewers", [])
        ),
    }
    return output


def _fmt(value: Any) -> str:
    return "N/A" if value is None else f"{float(value):.3f}"


def render_markdown(report: Mapping[str, Any]) -> str:
    lines = [
        "# Ground-truth reviewer reliability",
        "",
        f"- Generated (UTC): `{report['generated_at']}`",
        f"- Primary reviewer(s): {', '.join(report['primary_reviewers']) or 'N/A'}",
        f"- Secondary reviewer(s): {', '.join(report['secondary_reviewers']) or 'N/A'}",
        f"- Independent reviewer identities: **{'YES' if report['independent_reviewers'] else 'NO'}**",
        f"- Compared: **{report['compared_judgements']} / {report['expected_sample_judgements']}** sampled judgements",
        "",
        "## Agreement",
        "",
        "| Scope | N | Exact agreement | 95% CI | Cohen kappa | Weighted kappa | Binary agreement | Binary kappa | Disagreements |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    scopes = [("overall", report["overall"])] + [
        (mode, report["by_mode"][mode]) for mode in ("semantic", "ocr", "image")
    ]
    for name, metrics in scopes:
        interval = metrics["exact_agreement_95_ci"]
        ci = f"[{_fmt(interval['lower'])}, {_fmt(interval['upper'])}]"
        lines.append(
            f"| {name} | {metrics['judgement_count']} | {_fmt(metrics['exact_agreement'])} | {ci} | "
            f"{_fmt(metrics['cohen_kappa'])} | {_fmt(metrics['quadratic_weighted_kappa'])} | "
            f"{_fmt(metrics['binary_relevance_agreement'])} | {_fmt(metrics['binary_cohen_kappa'])} | "
            f"{metrics['disagreement_count']} |"
        )
    lines.extend(
        [
            "",
            "Quadratic-weighted kappa gives a smaller penalty to a 1-vs-2 disagreement than to a 0-vs-2 disagreement. Binary kappa evaluates only relevant (grades 1/2) versus not relevant (grade 0).",
        ]
    )
    if report["warnings"]:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {warning}" for warning in report["warnings"])
    adjudication = report.get("adjudication")
    if isinstance(adjudication, Mapping) and adjudication.get("complete"):
        lines.extend(
            [
                "",
                "## Adjudication",
                "",
                f"- Reviewer(s): {', '.join(adjudication.get('reviewers', [])) or 'N/A'}",
                f"- Resolved disagreements: **{adjudication.get('resolved_disagreement_count', 0)}**",
                "- Unresolved disagreements: **0**",
                "- Consensus manifest: generated successfully.",
            ]
        )
    return "\n".join(lines) + "\n"


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--primary", type=Path, default=DEFAULT_PRIMARY)
    parser.add_argument("--secondary", type=Path, default=DEFAULT_SECONDARY)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--adjudication", type=Path)
    parser.add_argument("--merged-output", type=Path)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    primary_path = args.primary.resolve()
    secondary_path = args.secondary.resolve()
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = (
        args.output_dir.resolve()
        if args.output_dir
        else Path(__file__).resolve().parent / "reliability" / f"agreement-{timestamp}"
    )
    try:
        primary = load_json(primary_path)
        secondary = load_json(secondary_path)
        primary_hash = file_sha256(primary_path)
        secondary_hash = file_sha256(secondary_path)
        report, records, _ = compare_manifests(
            primary, secondary, primary_sha256=primary_hash
        )
        disagreements = [
            record
            for record in records
            if record["primary_grade"] != record["secondary_grade"]
        ]
        adjudication_manifest = build_adjudication_manifest(
            primary,
            disagreements,
            primary_sha256=primary_hash,
            secondary_sha256=secondary_hash,
        )
        consensus = None
        if args.adjudication:
            adjudication = load_json(args.adjudication.resolve())
            report["adjudication"] = {
                "complete": True,
                "reviewers": reviewer_names(adjudication),
                "resolved_disagreement_count": len(disagreements),
                "unresolved_disagreement_count": 0,
                "reviewed_at": (
                    adjudication.get("label_review", {}).get("reviewed_at")
                    if isinstance(adjudication.get("label_review"), Mapping)
                    else None
                ),
            }
            consensus = merge_consensus(
                primary, secondary, adjudication, records, report
            )
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "reviewer-agreement.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output_dir / "reviewer-agreement.md").write_text(
        render_markdown(report), encoding="utf-8"
    )
    with (output_dir / "reviewer-disagreements.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=(
                "query_id",
                "mode",
                "query",
                "image_id",
                "primary_grade",
                "secondary_grade",
            ),
        )
        writer.writeheader()
        writer.writerows(disagreements)
    (output_dir / "adjudication.sample.json").write_text(
        json.dumps(adjudication_manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if consensus is not None:
        merged_output = (
            args.merged_output.resolve()
            if args.merged_output
            else output_dir / "ground-truth.consensus.json"
        )
        merged_output.parent.mkdir(parents=True, exist_ok=True)
        merged_output.write_text(
            json.dumps(consensus, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Wrote consensus ground truth: {merged_output}")

    overall = report["overall"]
    print(
        f"Compared {report['compared_judgements']} judgements: "
        f"agreement={_fmt(overall['exact_agreement'])}, "
        f"weighted kappa={_fmt(overall['quadratic_weighted_kappa'])}, "
        f"disagreements={overall['disagreement_count']}."
    )
    print(f"Wrote reliability evidence: {output_dir}")
    return 0 if report["second_review_complete"] and report["independent_reviewers"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
