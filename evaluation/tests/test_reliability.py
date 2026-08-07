import unittest

from evaluation.create_reliability_sample import build_blind_sample
from evaluation.reviewer_agreement import (
    cohen_kappa,
    compare_manifests,
    merge_consensus,
    quadratic_weighted_kappa,
)


def reviewed_manifest(reviewer="Primary"):
    queries = []
    for mode in ("semantic", "ocr", "image"):
        query = {
            "id": f"{mode}-01",
            "mode": mode,
            "candidate_image_ids": list(range(1, 21)),
            "judged_image_ids": list(range(1, 21)),
            "relevant_image_ids": list(range(2, 21, 2)),
            "relevance_grades": {
                str(image_id): (2 if image_id % 4 == 0 else 1 if image_id % 2 == 0 else 0)
                for image_id in range(1, 21)
            },
            "label_status": "reviewed",
        }
        if mode == "image":
            query["image_id"] = 100
        else:
            query["query"] = "test"
        queries.append(query)
    return {
        "evaluation_name": "test",
        "queries": queries,
        "label_review": {
            "reviewers": [reviewer],
            "reviewed_at": "2026-08-05",
            "protocol": "test",
        },
    }


class ReliabilitySampleTests(unittest.TestCase):
    def test_sample_is_stratified_blind_and_deterministic(self):
        primary = reviewed_manifest()
        first = build_blind_sample(
            primary,
            source_sha256="abc",
            source_name="primary.json",
            sample_ratio=0.30,
            minimum_per_query=4,
            seed=9,
        )
        second = build_blind_sample(
            primary,
            source_sha256="abc",
            source_name="primary.json",
            sample_ratio=0.30,
            minimum_per_query=4,
            seed=9,
        )
        self.assertEqual(first, second)
        self.assertNotIn("label_review", first)
        self.assertEqual(len(first["queries"]), 3)
        for query in first["queries"]:
            self.assertEqual(len(query["candidate_image_ids"]), 6)
            self.assertEqual(query["relevance_grades"], {})
            self.assertEqual(query["relevant_image_ids"], [])


class AgreementTests(unittest.TestCase):
    def test_kappa_is_one_for_identical_grades(self):
        grades = [0, 0, 1, 1, 2, 2]
        self.assertEqual(cohen_kappa(grades, grades, (0, 1, 2)), 1.0)
        self.assertEqual(quadratic_weighted_kappa(grades, grades, (0, 1, 2)), 1.0)

    def test_compare_and_adjudicate_disagreement(self):
        primary = reviewed_manifest("Primary")
        secondary = build_blind_sample(
            primary,
            source_sha256="abc",
            source_name="primary.json",
            sample_ratio=0.10,
            minimum_per_query=2,
            seed=3,
        )
        secondary["label_review"] = {
            "reviewers": ["Secondary"],
            "reviewed_at": "2026-08-06",
            "protocol": "blind",
        }
        for query in secondary["queries"]:
            primary_query = next(
                item for item in primary["queries"] if item["id"] == query["id"]
            )
            primary_grades = primary_query["relevance_grades"]
            query["relevance_grades"] = {
                str(image_id): primary_grades[str(image_id)]
                for image_id in query["candidate_image_ids"]
            }
            query["judged_image_ids"] = list(query["candidate_image_ids"])
            query["label_status"] = "reviewed"
        disputed_query = secondary["queries"][0]
        disputed_image = disputed_query["candidate_image_ids"][0]
        original_grade = int(disputed_query["relevance_grades"][str(disputed_image)])
        disputed_query["relevance_grades"][str(disputed_image)] = (original_grade + 1) % 3

        secondary["reliability_review"]["source_manifest_sha256"] = "abc"
        report, records, warnings = compare_manifests(
            primary, secondary, primary_sha256="abc"
        )
        self.assertTrue(report["independent_reviewers"])
        self.assertTrue(report["second_review_complete"])
        self.assertEqual(report["overall"]["disagreement_count"], 1)
        self.assertEqual(warnings, [])

        adjudication = {
            "queries": [
                {
                    "id": disputed_query["id"],
                    "relevance_grades": {str(disputed_image): 2},
                }
            ],
            "label_review": {"reviewers": ["Adjudicator"]},
        }
        consensus = merge_consensus(primary, secondary, adjudication, records, report)
        merged_query = next(
            query for query in consensus["queries"] if query["id"] == disputed_query["id"]
        )
        self.assertEqual(merged_query["relevance_grades"][str(disputed_image)], 2)
        self.assertIn("Adjudicator", consensus["label_review"]["reviewers"])


if __name__ == "__main__":
    unittest.main()
