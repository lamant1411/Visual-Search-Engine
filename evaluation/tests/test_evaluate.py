import contextlib
import io
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from evaluation.evaluate import (
    bootstrap_mean_confidence_interval,
    build_evaluation,
    compute_batch_metrics,
    hit_at_k,
    judged_coverage_at_k,
    ndcg_at_k,
    percentile,
    precision_at_k,
    recall_at_k,
    run_query,
    summarize_latencies,
    validate_manifest,
    write_outputs,
)


class MetricTests(unittest.TestCase):
    def test_bootstrap_confidence_interval_is_deterministic_and_bounded(self):
        first = bootstrap_mean_confidence_interval(
            [0.0, 0.5, 1.0], resamples=2000, seed=7
        )
        second = bootstrap_mean_confidence_interval(
            [0.0, 0.5, 1.0], resamples=2000, seed=7
        )
        self.assertEqual(first, second)
        self.assertLessEqual(first["lower"], first["mean"])
        self.assertGreaterEqual(first["upper"], first["mean"])
        self.assertEqual(first["sample_size"], 3)

    def test_precision_at_10_always_uses_ten_as_denominator(self):
        results = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        self.assertEqual(precision_at_k(results, {2, 4, 6}, 10), 0.3)

    def test_recall_at_10_uses_labelled_relevant_set(self):
        self.assertEqual(recall_at_k([1, 2, 3], {2, 3, 4, 5}, 10), 0.5)

    def test_percentile_interpolates(self):
        self.assertAlmostEqual(percentile([1.0, 2.0, 3.0, 4.0], 50), 2.5)

    def test_latency_gate_is_strict(self):
        summary = summarize_latencies([0.5, 1.99, 2.0], 2.0)
        self.assertFalse(summary["all_under_threshold"])
        self.assertEqual(summary["under_threshold_count"], 2)

    def test_quality_requires_every_top10_result_to_be_judged(self):
        self.assertEqual(judged_coverage_at_k(list(range(1, 11)), range(1, 10), 10), 0.9)

    def test_ndcg_rewards_relevant_images_near_the_top(self):
        high = ndcg_at_k([1, 2, 9, 10], {1, 2}, 4)
        low = ndcg_at_k([9, 10, 1, 2], {1, 2}, 4)
        self.assertGreater(high, low)

    def test_hit_at_10_supports_sparse_ocr_ground_truth(self):
        self.assertEqual(hit_at_k([20, 30, 40], {30}, 10), 1.0)
        self.assertEqual(hit_at_k([20, 30, 40], {99}, 10), 0.0)

    def test_sparse_result_set_still_satisfies_top20_contract(self):
        class FakeClient:
            def search_text(self, mode, query, *, limit):
                return {"items": [{"id": 7}], "total": 1}

        result = run_query(
            FakeClient(),
            {
                "id": "ocr-sparse",
                "mode": "ocr",
                "query": "Nhím",
                "relevant_image_ids": [7],
                "judged_image_ids": [7],
                "label_status": "reviewed",
            },
            manifest_dir=Path("."),
            top_k=10,
            result_limit=20,
            thresholds={
                "semantic_latency_seconds": 2.0,
                "ocr_latency_seconds": 2.0,
                "image_latency_seconds": 3.0,
            },
        )
        self.assertTrue(result["top20_contract_pass"])
        self.assertEqual(result["hit_at_10"], 1.0)

    def test_image_source_is_excluded_without_losing_top20(self):
        class FakeClient:
            requested_limit = None

            def search_image(self, *, limit, image_id=None, image_path=None):
                self.requested_limit = limit
                return {
                    "items": [{"id": 999}] + [{"id": value} for value in range(1, 21)],
                    "total": 21,
                }

        client = FakeClient()
        query = {
            "id": "image-01",
            "mode": "image",
            "image_id": 999,
            "exclude_image_id": 999,
            "relevant_image_ids": list(range(1, 11)),
            "judged_image_ids": list(range(1, 11)),
            "label_status": "reviewed",
        }
        result = run_query(
            client,
            query,
            manifest_dir=Path("."),
            top_k=10,
            result_limit=20,
            thresholds={
                "semantic_latency_seconds": 2.0,
                "ocr_latency_seconds": 2.0,
                "image_latency_seconds": 3.0,
            },
        )
        self.assertEqual(client.requested_limit, 21)
        self.assertEqual(result["returned_count"], 20)
        self.assertEqual(result["precision_at_10"], 1.0)
        self.assertTrue(result["top20_contract_pass"])


class BatchMetricTests(unittest.TestCase):
    def test_overlapping_clip_and_ocr_uses_wall_clock_duration(self):
        start = datetime(2026, 8, 1, tzinfo=timezone.utc)
        status = {
            "batch_id": "idx_test",
            "status": "completed",
            "total_images": 50,
            "processed_images": 50,
            "failed_images": 0,
            "ocr_processed_images": 50,
            "ocr_failed_images": 0,
            "semantic_started_at": start.isoformat(),
            "semantic_completed_at": (start + timedelta(seconds=20)).isoformat(),
            "ocr_started_at": (start + timedelta(seconds=2)).isoformat(),
            "ocr_completed_at": (start + timedelta(seconds=100)).isoformat(),
        }
        metrics = compute_batch_metrics(status, 5.0)
        self.assertEqual(metrics["total_index_seconds"], 100.0)
        self.assertEqual(metrics["seconds_per_image"], 2.0)
        self.assertTrue(metrics["pass"])

    def test_failed_images_fail_batch_even_when_fast(self):
        start = datetime(2026, 8, 1, tzinfo=timezone.utc)
        end = start + timedelta(seconds=10)
        status = {
            "batch_id": "idx_failed",
            "status": "completed",
            "total_images": 10,
            "processed_images": 9,
            "failed_images": 1,
            "ocr_processed_images": 9,
            "ocr_failed_images": 0,
            "semantic_started_at": start.isoformat(),
            "semantic_completed_at": end.isoformat(),
            "ocr_started_at": start.isoformat(),
            "ocr_completed_at": end.isoformat(),
        }
        self.assertFalse(compute_batch_metrics(status, 5.0)["pass"])


class ManifestValidationTests(unittest.TestCase):
    def test_incomplete_manifest_is_rejected(self):
        manifest = {
            "target_query_count": 50,
            "top_k": 10,
            "result_limit": 20,
            "queries": [
                {
                    "id": "semantic-01",
                    "mode": "semantic",
                    "query": "a dog",
                    "relevant_image_ids": [],
                }
            ],
            "manual_checks": [],
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            result = validate_manifest(manifest, Path(temporary_directory))
        self.assertFalse(result.valid)
        self.assertTrue(any("Exactly 50" in error for error in result.errors))
        self.assertTrue(any("relevant_image_ids" in error for error in result.errors))

    def test_passed_manual_check_requires_evidence(self):
        queries = []
        for index in range(48):
            queries.append(
                {
                    "id": f"semantic-{index}",
                    "mode": "semantic",
                    "query": "a dog",
                    "relevant_image_ids": list(range(1, 11)),
                }
            )
        queries.extend(
            [
                {
                    "id": "ocr-1",
                    "mode": "ocr",
                    "query": "STOP",
                    "relevant_image_ids": list(range(1, 11)),
                },
                {
                    "id": "image-1",
                    "mode": "image",
                    "image_id": 1,
                    "relevant_image_ids": list(range(2, 12)),
                },
            ]
        )
        manifest = {
            "target_query_count": 50,
            "top_k": 10,
            "result_limit": 20,
            "queries": queries,
            "manual_checks": [
                {"id": "docker", "description": "Docker starts", "status": "pass"}
            ],
        }
        result = validate_manifest(manifest, Path("."))
        self.assertFalse(result.valid)
        self.assertTrue(any("evidence is required" in error for error in result.errors))


class EndToEndReportTests(unittest.TestCase):
    def test_fifty_queries_generate_all_report_formats(self):
        class FakeClient:
            base_url = "http://test/api/v1"

            @staticmethod
            def _results():
                return {"items": [{"id": value} for value in range(1, 21)], "total": 20}

            def search_text(self, mode, query, *, limit):
                return self._results()

            def search_image(self, *, limit, image_id=None, image_path=None):
                return self._results()

            def dashboard(self):
                return {
                    "total_images": 50000,
                    "indexed_images": 50000,
                    "dataset_indexed_images": 50000,
                    "upload_indexed_images": 0,
                    "pending_images": 0,
                    "failed_images": 0,
                }

            def list_batches(self):
                return {"items": [{"batch_id": "idx_test", "status": "completed", "total_images": 50}]}

            def batch_status(self, batch_id):
                start = datetime(2026, 8, 1, tzinfo=timezone.utc)
                return {
                    "batch_id": batch_id,
                    "status": "completed",
                    "total_images": 50,
                    "processed_images": 50,
                    "failed_images": 0,
                    "ocr_processed_images": 50,
                    "ocr_failed_images": 0,
                    "semantic_started_at": start.isoformat(),
                    "semantic_completed_at": (start + timedelta(seconds=20)).isoformat(),
                    "ocr_started_at": start.isoformat(),
                    "ocr_completed_at": (start + timedelta(seconds=100)).isoformat(),
                }

        queries = []
        modes = ["semantic"] * 20 + ["ocr"] * 15 + ["image"] * 15
        for index, mode in enumerate(modes, start=1):
            query = {
                "id": f"query-{index:02d}",
                "mode": mode,
                "relevant_image_ids": list(range(1, 11)),
                "judged_image_ids": list(range(1, 11)),
                "label_status": "reviewed",
            }
            if mode == "image":
                query["image_id"] = 1000 + index
            else:
                query["query"] = "test query"
            queries.append(query)
        manifest = {
            "evaluation_name": "Test report",
            "top_k": 10,
            "result_limit": 20,
            "queries": queries,
            "label_review": {
                "reviewers": ["Test reviewer"],
                "reviewed_at": "2026-08-02",
                "protocol": "All pooled Top-10 candidates were manually judged.",
            },
            "manual_checks": [
                {
                    "id": "docker",
                    "description": "Docker starts",
                    "status": "pass",
                    "evidence": "test log",
                }
            ],
        }
        with contextlib.redirect_stdout(io.StringIO()):
            report = build_evaluation(
                FakeClient(),
                manifest,
                manifest_dir=Path("."),
                batch_ids=[],
                shuffle=False,
                seed=2026,
                runs=3,
                warmup_runs=1,
            )
        self.assertTrue(report["overall_pass"])
        self.assertEqual(report["configuration"]["runs"], 3)
        self.assertEqual(report["search"]["modes"]["semantic"]["latency"]["count"], 60)
        self.assertEqual(
            report["search"]["modes"]["semantic"]["confidence_intervals_95"]
            ["mean_precision_at_10"]["sample_size"],
            20,
        )
        self.assertEqual(report["search"]["overall_quality"]["quality_ready_query_count"], 50)
        report["ground_truth_reliability"] = {
            "primary_reviewers": ["Primary"],
            "secondary_reviewers": ["Secondary"],
            "independent_reviewers": True,
            "compared_judgements": 30,
            "expected_sample_judgements": 30,
            "overall": {
                "exact_agreement": 0.9,
                "exact_agreement_95_ci": {"lower": 0.8, "upper": 0.95},
                "cohen_kappa": 0.8,
                "quadratic_weighted_kappa": 0.85,
                "binary_relevance_agreement": 0.95,
                "binary_cohen_kappa": 0.82,
                "disagreement_count": 3,
            },
            "by_mode": {},
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            paths = write_outputs(report, Path(temporary_directory))
            self.assertTrue(all(path.is_file() for path in paths))
            self.assertIn("Overall: **PASS**", paths[2].read_text(encoding="utf-8"))
            self.assertIn(
                "Ground-truth reliability", paths[2].read_text(encoding="utf-8")
            )


if __name__ == "__main__":
    unittest.main()
