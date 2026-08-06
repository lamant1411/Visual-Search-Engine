#!/usr/bin/env python3
"""Build a reviewable 50-query ground-truth draft from indexed local data.

Semantic and image-query labels are derived from the independent Unsplash Lite
metadata, not from the search ranking being evaluated. OCR labels are derived
from the OCR text currently stored in PostgreSQL. The generated HTML gallery is
intended for a final human review before the numbers are used in a report.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TSV = REPOSITORY_ROOT / "AI" / "data" / "unsplash-lite" / "photos.tsv000"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "ground-truth.json"
DEFAULT_REVIEW = Path(__file__).resolve().parent / "ground-truth-review.html"
DEFAULT_OCR_FIXTURES = Path(__file__).resolve().parent / "ocr-fixtures.json"


@dataclass(frozen=True)
class SemanticSpec:
    query: str
    required_patterns: tuple[str, ...]
    label: str


@dataclass(frozen=True)
class CatalogImage:
    image_id: int
    storage_path: str
    description: str


SEMANTIC_SPECS = (
    SemanticSpec(
        "một chú chó ở ngoài trời",
        (r"\b(dog|dogs|puppy|puppies)\b", r"\b(outdoor|outside|grass|field|park|beach|road)\b"),
        "chó ở ngoài trời",
    ),
    SemanticSpec(
        "một con mèo đang ngồi",
        (r"\b(cat|cats|kitten|kittens)\b", r"\b(sit|sits|sitting|seated)\b"),
        "mèo đang ngồi",
    ),
    SemanticSpec(
        "người đi bộ trong rừng",
        (
            r"\b(person|people|man|woman|hiker|hikers)\b",
            r"\b(forest|woods|woodland)\b",
            r"\b(walk|walks|walking|hike|hikes|hiking)\b",
        ),
        "người đi bộ trong rừng",
    ),
    SemanticSpec(
        "ô tô màu đỏ",
        (r"\bred\b", r"\b(car|cars|automobile|vehicle)\b"),
        "ô tô đỏ",
    ),
    SemanticSpec(
        "bãi biển lúc hoàng hôn",
        (r"\b(beach|shore|coast|seaside)\b", r"\b(sunset|dusk|sunrise)\b"),
        "bãi biển lúc hoàng hôn",
    ),
    SemanticSpec(
        "núi phủ tuyết",
        (r"\b(snow|snowy|snow-covered)\b", r"\b(mountain|mountains|peak|peaks)\b"),
        "núi phủ tuyết",
    ),
    SemanticSpec(
        "thành phố vào ban đêm",
        (r"\b(city|urban|downtown|cityscape)\b", r"\b(night|nighttime|dusk)\b"),
        "thành phố ban đêm",
    ),
    SemanticSpec(
        "xe đạp",
        (r"\b(bicycle|bicycles|bike|bikes|cycling|cyclist|cyclists)\b",),
        "xe đạp",
    ),
    SemanticSpec(
        "hoa trong vườn",
        (r"\b(flower|flowers|blossom|blossoms)\b", r"\b(garden|yard)\b"),
        "hoa trong vườn",
    ),
    SemanticSpec(
        "thuyền trên hồ",
        (r"\b(boat|boats|canoe|kayak)\b", r"\b(lake|water)\b"),
        "thuyền trên hồ",
    ),
    SemanticSpec(
        "a cup of coffee",
        (r"\bcoffee\b", r"\b(cup|mug)\b"),
        "coffee cup",
    ),
    SemanticSpec(
        "an airplane flying in the sky",
        (r"\b(airplane|aeroplane|aircraft|plane)\b", r"\b(flying|flight|sky|air)\b"),
        "airplane in the sky",
    ),
    SemanticSpec(
        "an office workspace",
        (r"\b(office|workspace|workplace)\b",),
        "office workspace",
    ),
    SemanticSpec(
        "a close-up portrait of a person",
        (r"\b(portrait|headshot)\b", r"\b(person|people|man|woman|boy|girl)\b"),
        "close-up portrait",
    ),
    SemanticSpec(
        "a plate of food",
        (r"\b(food|meal|dish|dishes|breakfast|lunch|dinner)\b",),
        "food or meal",
    ),
    SemanticSpec(
        "children outdoors",
        (r"\b(child|children|kid|kids|boy|boys|girl|girls)\b",),
        "children",
    ),
    SemanticSpec(
        "sports players",
        (r"\b(soccer|football|baseball|rugby|tennis|basketball|sport|sports)\b",),
        "sports",
    ),
    SemanticSpec(
        "historic architecture",
        (r"\b(historic|historical|ancient|heritage)\b",),
        "historic architecture",
    ),
    SemanticSpec(
        "wild animals in nature",
        (r"\b(wildlife|elephant|elephants|giraffe|giraffes|zebra|zebras|deer|bear|bears)\b",),
        "wild animals",
    ),
    SemanticSpec(
        "a waterfall in the forest",
        (r"\b(waterfall|waterfalls)\b", r"\b(forest|woods|trees|jungle)\b"),
        "waterfall in a forest",
    ),
)


OCR_QUERIES = (
    "STOP",
    "OPEN",
    "SCHOOL",
    "COFFEE",
    "SALE",
    "HOTEL",
    "CAFE",
    "BEER",
    "FOOD",
    "POLICE",
    "STREET",
    "Nhím",
    "ĐƯỜNG",
    "SÀI GÒN",
    "HUẾ",
)


# These categories are deliberately narrower than the general semantic set so
# an indexed source image and its relevant images share a concrete visual idea.
IMAGE_SPECS = (
    SEMANTIC_SPECS[0],
    SEMANTIC_SPECS[1],
    SEMANTIC_SPECS[4],
    SEMANTIC_SPECS[5],
    SEMANTIC_SPECS[6],
    SEMANTIC_SPECS[8],
    SEMANTIC_SPECS[9],
    SEMANTIC_SPECS[10],
    SEMANTIC_SPECS[11],
    SEMANTIC_SPECS[12],
    SEMANTIC_SPECS[13],
    SEMANTIC_SPECS[14],
    SEMANTIC_SPECS[16],
    SEMANTIC_SPECS[18],
    SEMANTIC_SPECS[19],
)


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").lower()
    return re.sub(r"\s+", " ", value).strip()


def normalize_ocr_query(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "").lower().replace("đ", "d")
    value = "".join(character for character in value if not unicodedata.combining(character))
    return re.sub(r"\s+", " ", value).strip()


def matches_spec(description: str, spec: SemanticSpec) -> bool:
    return all(re.search(pattern, description, flags=re.IGNORECASE) for pattern in spec.required_patterns)


def run_psql_csv(
    sql: str,
    *,
    service: str,
    database: str,
    user: str,
) -> list[dict[str, str]]:
    copy_sql = f"COPY ({sql.rstrip().rstrip(';')}) TO STDOUT WITH (FORMAT CSV, HEADER TRUE)"
    command = [
        "docker",
        "compose",
        "exec",
        "-T",
        service,
        "psql",
        "-U",
        user,
        "-d",
        database,
        "-c",
        copy_sql,
    ]
    try:
        completed = subprocess.run(
            command,
            cwd=REPOSITORY_ROOT,
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except FileNotFoundError as exc:
        raise RuntimeError("Docker CLI was not found. Start Docker Desktop and try again.") from exc
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"Could not read PostgreSQL through Docker Compose: {detail}")
    return list(csv.DictReader(io.StringIO(completed.stdout)))


def load_indexed_unsplash(
    tsv_path: Path,
    *,
    service: str,
    database: str,
    user: str,
) -> list[CatalogImage]:
    indexed_rows = run_psql_csv(
        """
        SELECT id AS image_id, storage_path
        FROM images
        WHERE status = 'indexed'
          AND source_type = 'dataset'
          AND storage_path LIKE 'http%'
        ORDER BY id
        """,
        service=service,
        database=database,
        user=user,
    )
    ids_by_url = {row["storage_path"]: int(row["image_id"]) for row in indexed_rows}

    catalog: list[CatalogImage] = []
    with tsv_path.open("r", encoding="utf-8", newline="") as stream:
        for row in csv.DictReader(stream, delimiter="\t"):
            storage_path = (row.get("photo_image_url") or "").strip()
            image_id = ids_by_url.get(storage_path)
            if image_id is None:
                continue
            description = normalize_text(
                " ".join(
                    part
                    for part in (
                        row.get("photo_description") or "",
                        row.get("ai_description") or "",
                    )
                    if part
                )
            )
            if description:
                catalog.append(CatalogImage(image_id, storage_path, description))
    catalog.sort(key=lambda item: item.image_id)
    return catalog


def load_ocr_rows(*, service: str, database: str, user: str) -> list[dict[str, str]]:
    return run_psql_csv(
        """
        SELECT o.image_id,
               COALESCE(o.raw_text, '') AS raw_text,
               COALESCE(o.normalized_text, '') AS normalized_text,
               i.storage_path
        FROM ocr_texts AS o
        JOIN images AS i ON i.id = o.image_id
        WHERE i.status = 'indexed'
          AND BTRIM(COALESCE(o.normalized_text, '')) <> ''
        ORDER BY o.image_id
        """,
        service=service,
        database=database,
        user=user,
    )


def load_all_image_paths(*, service: str, database: str, user: str) -> dict[int, str]:
    rows = run_psql_csv(
        """
        SELECT id AS image_id, storage_path
        FROM images
        WHERE status = 'indexed'
        ORDER BY id
        """,
        service=service,
        database=database,
        user=user,
    )
    return {int(row["image_id"]): row["storage_path"] for row in rows}


def load_candidate_results(paths: Iterable[Path]) -> dict[str, list[int]]:
    candidates: dict[str, list[int]] = {}
    for path in paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(f"Could not read candidate report {path}: {exc}") from exc
        queries = payload.get("search", {}).get("queries", [])
        if not isinstance(queries, list):
            raise RuntimeError(f"Candidate report has no search.queries list: {path}")
        for query in queries:
            if not isinstance(query, dict) or not isinstance(query.get("id"), str):
                continue
            existing = candidates.setdefault(query["id"], [])
            existing.extend(
                value
                for value in query.get("result_ids", [])
                if isinstance(value, int)
                and not isinstance(value, bool)
                and value not in existing
            )
    return candidates


def whole_word_match(text: str, query: str) -> bool:
    normalized_query = normalize_ocr_query(query)
    return bool(re.search(rf"(?<!\w){re.escape(normalized_query)}(?!\w)", normalize_text(text)))


def load_ocr_fixtures(path: Path | None) -> dict[str, list[int]]:
    if path is None or not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not read OCR fixtures {path}: {exc}") from exc
    fixtures: dict[str, list[int]] = {}
    for item in payload.get("fixtures", []):
        if not isinstance(item, dict) or not isinstance(item.get("query"), str):
            continue
        ids = item.get("relevant_image_ids", [])
        fixtures[item["query"]] = [
            value for value in ids if isinstance(value, int) and not isinstance(value, bool)
        ]
    return fixtures


def build_queries(
    catalog: list[CatalogImage],
    ocr_rows: list[dict[str, str]],
    *,
    minimum_labels: int,
    candidate_results: dict[str, list[int]] | None = None,
    ocr_fixtures: dict[str, list[int]] | None = None,
    metadata_candidates_per_query: int = 30,
) -> tuple[list[dict], dict[int, CatalogImage], dict[int, dict[str, str]]]:
    catalog_by_id = {item.image_id: item for item in catalog}
    ocr_by_id = {int(row["image_id"]): row for row in ocr_rows}
    matches_by_spec: dict[SemanticSpec, list[int]] = {}
    for spec in set(SEMANTIC_SPECS) | set(IMAGE_SPECS):
        matches_by_spec[spec] = [item.image_id for item in catalog if matches_spec(item.description, spec)]

    shortages: list[str] = []
    for index, spec in enumerate(SEMANTIC_SPECS, start=1):
        count = len(matches_by_spec[spec])
        if count < minimum_labels:
            shortages.append(
                f"semantic-{index:02d} {spec.query!r}: {count}/{minimum_labels} labels"
            )
    for index, query in enumerate(OCR_QUERIES, start=1):
        count = sum(whole_word_match(row["normalized_text"], query) for row in ocr_rows)
        fixture_count = len((ocr_fixtures or {}).get(query, []))
        if count < minimum_labels and fixture_count == 0:
            shortages.append(f"ocr-{index:02d} {query!r}: {count}/{minimum_labels} labels")
    for index, spec in enumerate(IMAGE_SPECS, start=1):
        count = len(matches_by_spec[spec])
        required = minimum_labels + 1
        if count < required:
            shortages.append(
                f"image-{index:02d} {spec.label!r}: {count}/{required} images"
            )
    if shortages:
        raise RuntimeError("Not enough labels:\n- " + "\n- ".join(shortages))

    queries: list[dict] = []
    for index, spec in enumerate(SEMANTIC_SPECS, start=1):
        query_id = f"semantic-{index:02d}"
        all_metadata_ids = matches_by_spec[spec]
        candidate_ids = list(
            dict.fromkeys(
                [*(candidate_results or {}).get(query_id, []), *all_metadata_ids[:metadata_candidates_per_query]]
            )
        )
        relevant_ids = [image_id for image_id in candidate_ids if image_id in set(all_metadata_ids)]
        queries.append(
            {
                "id": query_id,
                "mode": "semantic",
                "query": spec.query,
                "relevant_image_ids": relevant_ids,
                "candidate_image_ids": candidate_ids,
                "judged_image_ids": [],
                "label_status": "draft",
                "notes": (
                    f"Draft candidate pool: {len(all_metadata_ids)} indexed Unsplash images matched "
                    f"independent metadata category '{spec.label}', plus retrieved candidates when "
                    "a prior report was supplied. Human review required."
                ),
            }
        )

    for index, query in enumerate(OCR_QUERIES, start=1):
        query_id = f"ocr-{index:02d}"
        all_ocr_ids = [
            int(row["image_id"])
            for row in ocr_rows
            if whole_word_match(row["normalized_text"], query)
        ]
        fixture_ids = (ocr_fixtures or {}).get(query, [])
        all_ocr_ids = list(dict.fromkeys([*fixture_ids, *all_ocr_ids]))
        candidate_ids = list(
            dict.fromkeys(
                [*(candidate_results or {}).get(query_id, []), *all_ocr_ids[:metadata_candidates_per_query]]
            )
        )
        relevant_ids = [image_id for image_id in candidate_ids if image_id in set(all_ocr_ids)]
        queries.append(
            {
                "id": query_id,
                "mode": "ocr",
                "query": query,
                "relevant_image_ids": relevant_ids,
                "candidate_image_ids": candidate_ids,
                "judged_image_ids": [],
                "label_status": "draft",
                "notes": (
                    f"Draft: {len(all_ocr_ids)} indexed images contain this whole word in "
                    "a controlled fixture or normalized OCR text. Review the visible image text "
                    "before final reporting."
                ),
            }
        )

    for index, spec in enumerate(IMAGE_SPECS, start=1):
        category_ids = matches_by_spec[spec]
        image_id = category_ids[0]
        query_id = f"image-{index:02d}"
        metadata_ids = [candidate for candidate in category_ids if candidate != image_id]
        candidate_ids = list(
            dict.fromkeys(
                [
                    *(candidate_results or {}).get(query_id, []),
                    *metadata_ids[:metadata_candidates_per_query],
                ]
            )
        )
        candidate_ids = [candidate for candidate in candidate_ids if candidate != image_id]
        relevant_ids = [image_id for image_id in candidate_ids if image_id in set(metadata_ids)]
        queries.append(
            {
                "id": query_id,
                "mode": "image",
                "image_id": image_id,
                "exclude_image_id": image_id,
                "relevant_image_ids": relevant_ids,
                "candidate_image_ids": candidate_ids,
                "judged_image_ids": [],
                "label_status": "draft",
                "notes": (
                    f"Draft source and {len(metadata_ids)} metadata matches share independent "
                    f"Unsplash metadata category '{spec.label}'. Human visual review required."
                ),
            }
        )
    return queries, catalog_by_id, ocr_by_id


def build_manifest(queries: list[dict]) -> dict:
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


def image_url(storage_path: str, backend_url: str) -> str:
    normalized = storage_path.replace("\\", "/")
    if normalized.startswith("http://") or normalized.startswith("https://"):
        return normalized
    if normalized.startswith("/static/"):
        return f"{backend_url.rstrip('/')}{normalized}"
    if normalized.startswith("static/"):
        return f"{backend_url.rstrip('/')}/{normalized}"
    return ""


def render_cards(
    image_ids: Iterable[int],
    *,
    query_id: str | None,
    suggested_ids: set[int],
    catalog_by_id: dict[int, CatalogImage],
    ocr_by_id: dict[int, dict[str, str]],
    storage_paths_by_id: dict[int, str],
    backend_url: str,
    maximum: int,
    blind: bool = False,
) -> str:
    cards: list[str] = []
    for image_id in list(image_ids)[:maximum]:
        catalog_item = catalog_by_id.get(image_id)
        ocr_item = ocr_by_id.get(image_id)
        storage_path = storage_paths_by_id.get(image_id, "")
        detail = ""
        if catalog_item is not None:
            storage_path = catalog_item.storage_path
            detail = catalog_item.description
        elif ocr_item is not None:
            storage_path = ocr_item["storage_path"]
            detail = ocr_item["raw_text"]
        url = image_url(storage_path, backend_url)
        judgement = ""
        if query_id is not None:
            judgement = (
                f"<label>Đánh giá<select class='judgement' data-query='{html.escape(query_id, quote=True)}' "
                f"data-image-id='{image_id}'>"
                "<option value=''>Chưa duyệt</option>"
                "<option value='0'>Không liên quan</option>"
                "<option value='1'>Liên quan</option>"
                "<option value='2'>Rất liên quan</option>"
                "</select></label>"
            )
        if blind:
            detail = ""
        suggestion = (
            "<span class='suggestion'>Gợi ý metadata/OCR</span>"
            if image_id in suggested_ids and not blind
            else ""
        )
        cards.append(
            f"<article class='card' data-card-id='{image_id}'>"
            f"<img loading='lazy' src='{html.escape(url, quote=True)}' alt='image {image_id}'>"
            f"<strong>ID {image_id}</strong>{suggestion}"
            f"<p>{html.escape(detail[:240])}</p>"
            f"{judgement}"
            "</article>"
        )
    return "".join(cards)


def write_review_html(
    path: Path,
    queries: list[dict],
    *,
    catalog_by_id: dict[int, CatalogImage],
    ocr_by_id: dict[int, dict[str, str]],
    storage_paths_by_id: dict[int, str],
    backend_url: str,
    maximum_images: int,
    manifest: Mapping | None = None,
    blind: bool = False,
) -> None:
    sections: list[str] = []
    for query in queries:
        source = ""
        if query["mode"] == "image":
            source_id = int(query["image_id"])
            source = (
                "<h3>Source image</h3><div class='grid source'>"
                + render_cards(
                    [source_id],
                    query_id=None,
                    suggested_ids=set(),
                    catalog_by_id=catalog_by_id,
                    ocr_by_id=ocr_by_id,
                    storage_paths_by_id=storage_paths_by_id,
                    backend_url=backend_url,
                    maximum=1,
                    blind=blind,
                )
                + "</div>"
            )
        title = query.get("query") or query.get("notes", "")
        candidates = query["candidate_image_ids"]
        suggested_ids = set(query.get("relevant_image_ids", [])) if not blind else set()
        notes = "" if blind else str(query.get("notes", ""))
        sections.append(
            f"<section><h2>{html.escape(query['id'])}: {html.escape(str(title))}</h2>"
            f"<p>{html.escape(notes)}</p>{source}"
            f"<h3>Candidate pool (showing {min(len(candidates), maximum_images)} "
            f"of {len(candidates)})</h3><div class='grid'>"
            + render_cards(
                candidates,
                query_id=query["id"],
                suggested_ids=suggested_ids,
                catalog_by_id=catalog_by_id,
                ocr_by_id=ocr_by_id,
                storage_paths_by_id=storage_paths_by_id,
                backend_url=backend_url,
                maximum=maximum_images,
                blind=blind,
            )
            + "</div></section>"
        )
    manifest_payload = dict(manifest) if manifest is not None else build_manifest(queries)
    manifest_json = json.dumps(manifest_payload, ensure_ascii=False).replace("</", "<\\/")
    review_fingerprint = hashlib.sha256(
        json.dumps(manifest_payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()[:16]
    review_kind = "reliability" if manifest_payload.get("reliability_review") else "ground-truth"
    storage_key = f"visual-search-review-{review_kind}-{review_fingerprint}"
    heading = "Duyệt nhãn độc lập" if blind else "Duyệt nhãn ground truth"
    intro = (
        "Đánh giá độc lập từng ảnh chỉ theo truy vấn và nội dung nhìn thấy; không suy đoán nhãn của người duyệt trước."
        if blind
        else "Đánh giá từng candidate theo nội dung ảnh. Gợi ý metadata/OCR chỉ là gợi ý, không phải nhãn cuối."
    )
    reviewer_placeholder = "Người duyệt độc lập" if blind else "Nguyễn Kim Vũ"
    document = f"""<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Ground-truth review</title>
<style>
body{{font-family:system-ui,sans-serif;margin:24px;background:#f5f7fb;color:#172033}}
main{{max-width:1500px;margin:auto}}section{{background:white;margin:24px 0;padding:20px;border-radius:14px}}
.toolbar{{position:sticky;top:0;z-index:3;background:#172033;color:white;padding:14px;border-radius:12px;display:grid;grid-template-columns:1fr 2fr auto;gap:12px;align-items:end}}
.toolbar label{{display:grid;gap:5px}}input,textarea,select,button{{font:inherit}}input,textarea,select{{padding:8px;border:1px solid #b9c4d6;border-radius:7px}}button{{padding:10px 16px;border:0;border-radius:8px;background:#13a36f;color:white;font-weight:700;cursor:pointer}}
.grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}}
.source{{max-width:230px}}.card{{border:1px solid #d8dfeb;border-radius:10px;overflow:hidden;background:#fff}}
.card.relevant{{border:3px solid #13a36f}}.card.not-relevant{{opacity:.58}}.card.highly-relevant{{border:3px solid #0a68d8}}
.card img{{display:block;width:100%;height:160px;object-fit:cover;background:#e9edf4}}
.card strong,.card p,.card label{{display:block;margin:8px 10px}}.card p{{font-size:12px;line-height:1.35;color:#4d5b73;min-height:48px}}
.suggestion{{display:inline-block;margin:0 10px;padding:3px 6px;border-radius:10px;background:#fff3c4;color:#705500;font-size:11px}}
h1{{margin-bottom:4px}}h2{{font-size:20px}}h3{{font-size:15px;color:#53627a}}
</style></head><body><main>
<h1>{html.escape(heading)}</h1>
<p>{html.escape(intro)}</p>
<div class="toolbar"><label>Người duyệt<input id="reviewer" placeholder="{html.escape(reviewer_placeholder, quote=True)}"></label>
<label>Quy tắc đánh giá<textarea id="protocol">Relevant khi ảnh thực sự đáp ứng truy vấn; image search xét đối tượng, bối cảnh và độ giống trực quan.</textarea></label>
<div><div id="progress">0/0 đã duyệt</div><button id="export" type="button">Tải manifest đã duyệt</button></div></div>
{''.join(sections)}
<script>
const manifest = {manifest_json};
const selects = [...document.querySelectorAll('.judgement')];
const storageKey = {json.dumps(storage_key)};
const saved = JSON.parse(localStorage.getItem(storageKey) || '{{}}');
for (const select of selects) {{
  const key = `${{select.dataset.query}}:${{select.dataset.imageId}}`;
  if (Object.prototype.hasOwnProperty.call(saved, key)) select.value = saved[key];
  paint(select);
  select.addEventListener('change', () => {{
    saved[key] = select.value;
    localStorage.setItem(storageKey, JSON.stringify(saved));
    paint(select); updateProgress();
  }});
}}
function paint(select) {{
  const card = select.closest('.card');
  card.classList.remove('relevant', 'not-relevant', 'highly-relevant');
  if (select.value === '0') card.classList.add('not-relevant');
  if (select.value === '1') card.classList.add('relevant');
  if (select.value === '2') card.classList.add('highly-relevant');
}}
function updateProgress() {{
  const done = selects.filter(select => select.value !== '').length;
  document.getElementById('progress').textContent = `${{done}}/${{selects.length}} đã duyệt`;
}}
updateProgress();
document.getElementById('export').addEventListener('click', () => {{
  const reviewer = document.getElementById('reviewer').value.trim();
  if (!reviewer) {{ alert('Hãy nhập tên người duyệt.'); return; }}
  const output = JSON.parse(JSON.stringify(manifest));
  let allReviewed = true;
  for (const query of output.queries) {{
    const querySelects = selects.filter(select => select.dataset.query === query.id);
    query.candidate_image_ids = querySelects.map(select => Number(select.dataset.imageId));
    query.judged_image_ids = querySelects.filter(select => select.value !== '').map(select => Number(select.dataset.imageId));
    query.relevant_image_ids = querySelects.filter(select => Number(select.value) > 0).map(select => Number(select.dataset.imageId));
    query.relevance_grades = Object.fromEntries(querySelects.filter(select => select.value !== '').map(select => [select.dataset.imageId, Number(select.value)]));
    const isReliabilityReview = Boolean(output.reliability_review);
    const complete = query.judged_image_ids.length === query.candidate_image_ids.length && (isReliabilityReview || query.relevant_image_ids.length > 0);
    query.label_status = complete ? 'reviewed' : 'draft';
    allReviewed = allReviewed && complete;
  }}
  output.label_review = {{
    reviewers: [reviewer],
    reviewed_at: new Date().toISOString(),
    protocol: document.getElementById('protocol').value.trim(),
    candidate_pool: 'Top results from supplied evaluation report plus independent Unsplash/OCR metadata candidates'
  }};
  const blob = new Blob([JSON.stringify(output, null, 2)], {{type: 'application/json'}});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const prefix = output.reliability_review?.review_round === 'adjudication' ? 'adjudication' : (output.reliability_review ? 'second-review' : 'ground-truth');
  link.download = `${{prefix}}.${{allReviewed ? 'reviewed' : 'partial'}}.json`;
  link.click(); URL.revokeObjectURL(link.href);
}});
</script>
</main></body></html>"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(document, encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-manifest",
        type=Path,
        help="Render an existing manifest instead of rebuilding the 50-query draft.",
    )
    parser.add_argument("--tsv", type=Path, default=DEFAULT_TSV)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--review-html", type=Path, default=DEFAULT_REVIEW)
    parser.add_argument("--ocr-fixtures", type=Path, default=DEFAULT_OCR_FIXTURES)
    parser.add_argument(
        "--candidate-report",
        type=Path,
        action="append",
        default=[],
        help="Previous evaluation-report.json added to the review pool; repeat for multiple systems/runs.",
    )
    parser.add_argument("--postgres-service", default="postgres")
    parser.add_argument("--database", default="visual_search")
    parser.add_argument("--database-user", default="postgres")
    parser.add_argument("--backend-url", default="http://localhost:8000")
    parser.add_argument("--minimum-labels", type=int, default=10)
    parser.add_argument("--metadata-candidates-per-query", type=int, default=30)
    parser.add_argument("--review-images-per-query", type=int, default=100)
    parser.add_argument(
        "--blind-review",
        action="store_true",
        help="Hide metadata/OCR hints and candidate notes from the reviewer.",
    )
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    tsv_path = args.tsv.resolve()
    output = args.output.resolve()
    review_path = args.review_html.resolve()
    input_manifest = args.input_manifest.resolve() if args.input_manifest else None
    if input_manifest is None and not tsv_path.is_file():
        print(f"Unsplash Lite TSV not found: {tsv_path}", file=sys.stderr)
        return 1
    if input_manifest is not None and not input_manifest.is_file():
        print(f"Input manifest not found: {input_manifest}", file=sys.stderr)
        return 1
    if input_manifest is None and output.exists() and not args.force:
        print(f"Output already exists: {output}. Pass --force to replace it.", file=sys.stderr)
        return 1
    if args.minimum_labels < 1:
        print("--minimum-labels must be at least 1", file=sys.stderr)
        return 1

    try:
        if input_manifest is not None:
            manifest = json.loads(input_manifest.read_text(encoding="utf-8"))
            queries = manifest.get("queries")
            if not isinstance(queries, list) or not queries:
                raise RuntimeError("Input manifest has no queries to review.")
            storage_paths_by_id = load_all_image_paths(
                service=args.postgres_service,
                database=args.database,
                user=args.database_user,
            )
            catalog: list[CatalogImage] = []
            ocr_rows: list[dict[str, str]] = []
            catalog_by_id: dict[int, CatalogImage] = {}
            ocr_by_id: dict[int, dict[str, str]] = {}
        else:
            catalog = load_indexed_unsplash(
                tsv_path,
                service=args.postgres_service,
                database=args.database,
                user=args.database_user,
            )
            ocr_rows = load_ocr_rows(
                service=args.postgres_service,
                database=args.database,
                user=args.database_user,
            )
            storage_paths_by_id = load_all_image_paths(
                service=args.postgres_service,
                database=args.database,
                user=args.database_user,
            )
            candidate_results = load_candidate_results(
                [path.resolve() for path in args.candidate_report]
            )
            ocr_fixtures = load_ocr_fixtures(args.ocr_fixtures.resolve())
            queries, catalog_by_id, ocr_by_id = build_queries(
                catalog,
                ocr_rows,
                minimum_labels=args.minimum_labels,
                candidate_results=candidate_results,
                ocr_fixtures=ocr_fixtures,
                metadata_candidates_per_query=args.metadata_candidates_per_query,
            )
    except (RuntimeError, OSError, json.JSONDecodeError) as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if input_manifest is None:
        manifest = build_manifest(queries)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    write_review_html(
        review_path,
        queries,
        catalog_by_id=catalog_by_id,
        ocr_by_id=ocr_by_id,
        storage_paths_by_id=storage_paths_by_id,
        backend_url=args.backend_url,
        maximum_images=args.review_images_per_query,
        manifest=manifest,
        blind=args.blind_review,
    )

    if input_manifest is None:
        print(f"Mapped {len(catalog)} indexed Unsplash images with independent metadata.")
        print(f"Read {len(ocr_rows)} indexed images with non-empty OCR text.")
    for mode in ("semantic", "ocr", "image"):
        mode_queries = [query for query in queries if query["mode"] == mode]
        counts = [len(query["candidate_image_ids"]) for query in mode_queries]
        if counts:
            print(
                f"{mode}: {len(mode_queries)} queries, candidate counts "
                f"min={min(counts)}, max={max(counts)}"
            )
    if input_manifest is None:
        print(f"Wrote manifest: {output}")
    print(f"Wrote human-review gallery: {review_path}")
    print("Next: review every candidate in the gallery and export the reviewed JSON.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
