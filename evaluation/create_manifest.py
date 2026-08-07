#!/usr/bin/env python3
"""Create a 50-query ground-truth manifest ready for manual labelling."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


SEMANTIC_QUERIES = [
    "một người chơi với thú cưng",
    "người đi bộ trong rừng",
    "ô tô màu đỏ trên đường",
    "bãi biển lúc hoàng hôn",
    "trẻ em chơi ngoài trời",
    "một con mèo đang ngồi",
    "đồ ăn được bày trên bàn",
    "núi phủ tuyết",
    "thành phố vào ban đêm",
    "người đang đi xe đạp",
    "a dog running on grass",
    "people working in an office",
    "airplane flying in the sky",
    "a close-up portrait of a person",
    "flowers in a garden",
    "a boat on a lake",
    "sports players on a field",
    "an old building with windows",
    "wild animals in nature",
    "a cup of coffee on a table",
]

OCR_QUERIES = [
    "STOP",
    "Nhím",
    "coffee",
    "hotel",
    "school",
    "restaurant",
    "open",
    "exit",
    "warning",
    "sale",
    "Việt Nam",
    "đường",
    "cấm",
    "pharmacy",
    "market",
]


def build_manifest() -> dict:
    queries = []
    for index, query in enumerate(SEMANTIC_QUERIES, start=1):
        queries.append(
            {
                "id": f"semantic-{index:02d}",
                "mode": "semantic",
                "query": query,
                "relevant_image_ids": [],
                "candidate_image_ids": [],
                "judged_image_ids": [],
                "label_status": "draft",
                "notes": "Label relevant IDs after reviewing the indexed dataset.",
            }
        )
    for index, query in enumerate(OCR_QUERIES, start=1):
        queries.append(
            {
                "id": f"ocr-{index:02d}",
                "mode": "ocr",
                "query": query,
                "relevant_image_ids": [],
                "candidate_image_ids": [],
                "judged_image_ids": [],
                "label_status": "draft",
                "notes": "Replace the text if it does not occur in the evaluation dataset.",
            }
        )
    for index in range(1, 16):
        queries.append(
            {
                "id": f"image-{index:02d}",
                "mode": "image",
                "image_path": f"query-images/image-{index:02d}.jpg",
                "exclude_image_id": None,
                "relevant_image_ids": [],
                "candidate_image_ids": [],
                "judged_image_ids": [],
                "label_status": "draft",
                "notes": "Copy a query image here and label similar image IDs.",
            }
        )

    return {
        "schema_version": 1,
        "evaluation_name": "Visual Search Engine - Final Project Evaluation",
        "target_query_count": 50,
        "top_k": 10,
        "result_limit": 20,
        "thresholds": {
            "semantic_latency_seconds": 2.0,
            "ocr_latency_seconds": 2.0,
            "image_latency_seconds": 3.0,
            "index_seconds_per_image": 5.0,
            "min_indexed_images": 50000,
            "min_index_batch_images": 50,
        },
        "min_mean_precision_at_10": {},
        "indexing_batch_ids": [],
        "queries": queries,
        "manual_checks": [
            {
                "id": "auth",
                "description": "Register, login, logout and role-based admin access work.",
                "status": "not_tested",
                "evidence": "",
            },
            {
                "id": "three-modes-ui",
                "description": "Semantic, OCR and image search are accessible from the UI.",
                "status": "not_tested",
                "evidence": "",
            },
            {
                "id": "image-query-ux",
                "description": "Image query supports drag/drop, preview and crop before search.",
                "status": "not_tested",
                "evidence": "",
            },
            {
                "id": "results-ui",
                "description": "Top-20 results render in a responsive grid/masonry layout.",
                "status": "not_tested",
                "evidence": "",
            },
            {
                "id": "states-ui",
                "description": "Loading skeleton, empty state and server/network errors are clear.",
                "status": "not_tested",
                "evidence": "",
            },
            {
                "id": "index-progress",
                "description": "Upload, CLIP and OCR progress survives navigation/reload.",
                "status": "not_tested",
                "evidence": "",
            },
            {
                "id": "docker",
                "description": "The complete system starts successfully with Docker Compose.",
                "status": "not_tested",
                "evidence": "",
            },
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "ground-truth.json",
    )
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() and not args.force:
        parser.error(f"{output} already exists; pass --force to replace it.")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(build_manifest(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (output.parent / "query-images").mkdir(exist_ok=True)
    print(f"Created {output} with 50 query slots.")
    print("Next: fill relevant_image_ids, add 15 query images, and update manual checks.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
