from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from edge.risk_zero_av.dataset_index import DatasetIndexError, build_dataset_index, write_dataset_index


class DatasetIndexTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def make_pair(self, folder: str, stem: str, participant: str, scenario: str, *, started_second: int = 0) -> Path:
        pair_root = self.root / folder
        pair_root.mkdir(parents=True, exist_ok=True)
        media = pair_root / f"{stem}.webm"
        media.write_bytes(f"media-{stem}".encode())
        manifest = pair_root / f"{stem}.json"
        payload = {
            "schemaVersion": "av-capture-manifest/2",
            "sessionId": f"session-{stem}",
            "participantCode": participant,
            "scenario": scenario,
            "challengePhrase": "초록 우산 문 열어",
            "conditions": {
                "distance": "standard",
                "lighting": "normal",
                "playbackDevice": "none",
                "noise": "quiet",
            },
            "capturedAt": {
                "started": f"2026-08-11T03:00:{started_second:02d}.000Z",
                "ended": f"2026-08-11T03:00:{started_second + 4:02d}.000Z",
                "durationMs": 4000,
            },
            "media": {
                "fileName": media.name,
                "mimeType": "video/webm;codecs=vp8,opus",
                "sizeBytes": media.stat().st_size,
            },
            "source": "browser-local",
            "verificationStatus": "not_evaluated",
        }
        manifest.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return manifest

    def test_builds_portable_index_from_nested_pairs(self) -> None:
        self.make_pair("P01", "risk-zero_a", "P01", "bona-fide", started_second=5)
        self.make_pair("P02", "risk-zero_b", "P02", "av-delay", started_second=1)
        index = build_dataset_index(self.root, generated_at=datetime(2026, 8, 11, tzinfo=timezone.utc))
        output = index.to_dict()

        self.assertTrue(output["valid"])
        self.assertEqual(output["root"], ".")
        self.assertEqual(output["summary"]["participantCount"], 2)
        self.assertEqual(output["summary"]["scenarioCounts"]["av-delay"], 1)
        self.assertEqual(output["captures"][0]["manifestFile"], "P02/risk-zero_b.json")
        self.assertEqual(output["captures"][0]["conditions"]["distance"], "standard")

    def test_records_invalid_pair_without_stopping(self) -> None:
        self.make_pair("P01", "risk-zero_good", "P01", "bona-fide")
        invalid = self.root / "P01" / "risk-zero_bad.json"
        invalid.write_text("{}", encoding="utf-8")
        output = build_dataset_index(self.root).to_dict()

        self.assertFalse(output["valid"])
        self.assertEqual(output["summary"]["validPairs"], 1)
        self.assertEqual(output["summary"]["invalidPairs"], 1)
        self.assertEqual(output["errors"][0]["manifestFile"], "P01/risk-zero_bad.json")
        self.assertEqual(output["errors"][0]["code"], "unsupported_schema")

    def test_written_index_contains_metadata_but_not_media_content_or_absolute_root(self) -> None:
        self.make_pair("P01", "risk-zero_private", "P01", "bona-fide")
        index = build_dataset_index(self.root)
        output_path = write_dataset_index(index, self.root / "dataset-index.json")
        saved = output_path.read_text(encoding="utf-8")

        self.assertIn('"mediaFile": "P01/risk-zero_private.webm"', saved)
        self.assertNotIn(str(self.root), saved)
        self.assertNotIn("media-risk-zero_private", saved)

    def test_strict_cli_writes_index_and_reports_invalid_pair(self) -> None:
        self.make_pair("P01", "risk-zero_good", "P01", "bona-fide")
        (self.root / "risk-zero_bad.json").write_text("{}", encoding="utf-8")
        output_path = self.root / "dataset-index.json"
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "edge.risk_zero_av",
                "--index-dataset",
                str(self.root),
                "--output",
                str(output_path),
                "--strict",
            ],
            cwd=Path(__file__).resolve().parents[2],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )

        self.assertEqual(completed.returncode, 2)
        self.assertTrue(output_path.is_file())
        self.assertFalse(json.loads(completed.stdout)["valid"])

    def test_rejects_missing_and_empty_dataset_directory(self) -> None:
        with self.assertRaises(DatasetIndexError) as raised:
            build_dataset_index(self.root / "missing")
        self.assertEqual(raised.exception.code, "dataset_not_found")

        with self.assertRaises(DatasetIndexError) as empty:
            build_dataset_index(self.root)
        self.assertEqual(empty.exception.code, "no_capture_manifests")


if __name__ == "__main__":
    unittest.main()
