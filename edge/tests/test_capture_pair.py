from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

from edge.risk_zero_av.capture_pair import CapturePairValidationError, load_capture_pair
from edge.risk_zero_av.models import DemoAVSyncModelAdapter


class CapturePairTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        self.media = self.root / "risk-zero_test.webm"
        self.media.write_bytes(b"webm-test-bytes")
        self.manifest = self.root / "risk-zero_test.json"
        self.payload = {
            "schemaVersion": "av-capture-manifest/1",
            "sessionId": "session-test-1",
            "participantCode": "P01",
            "scenario": "bona-fide",
            "challengePhrase": "초록 우산 문 열어",
            "capturedAt": {
                "started": "2026-08-11T03:00:00.000Z",
                "ended": "2026-08-11T03:00:04.250Z",
                "durationMs": 4250,
            },
            "media": {
                "fileName": self.media.name,
                "mimeType": "video/webm;codecs=vp8,opus",
                "sizeBytes": self.media.stat().st_size,
            },
            "source": "browser-local",
            "verificationStatus": "not_evaluated",
        }
        self.write_manifest()

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def write_manifest(self) -> None:
        self.manifest.write_text(json.dumps(self.payload, ensure_ascii=False), encoding="utf-8")

    def assert_error_code(self, expected: str) -> None:
        self.write_manifest()
        with self.assertRaises(CapturePairValidationError) as raised:
            load_capture_pair(self.manifest)
        self.assertEqual(raised.exception.code, expected)

    def test_loads_matching_video_and_manifest(self) -> None:
        pair = load_capture_pair(self.manifest)
        self.assertEqual(pair.session.id, "session-test-1")
        self.assertEqual(pair.session.video_path, self.media)
        self.assertIsNone(pair.session.audio_path)
        self.assertEqual(pair.scenario, "bona-fide")
        self.assertEqual(pair.to_dict()["verificationStatus"], "not_evaluated")

    def test_demo_adapter_runs_without_claiming_a_real_decision(self) -> None:
        pair = load_capture_pair(self.manifest)
        offset_ms, confidence = DemoAVSyncModelAdapter().analyze(pair.session)
        self.assertEqual(offset_ms, 42.0)
        self.assertEqual(confidence, 0.93)
        self.assertTrue(DemoAVSyncModelAdapter.model_version.startswith("demo-"))

    def test_rejects_media_size_mismatch(self) -> None:
        self.payload["media"]["sizeBytes"] += 1
        self.assert_error_code("media_size_mismatch")

    def test_rejects_unsupported_schema(self) -> None:
        self.payload["schemaVersion"] = "av-capture-manifest/99"
        self.assert_error_code("unsupported_schema")

    def test_rejects_directory_traversal(self) -> None:
        self.payload["media"]["fileName"] = "../risk-zero_test.webm"
        self.assert_error_code("unsafe_media_path")

    def test_rejects_media_and_manifest_name_mismatch(self) -> None:
        other_media = self.root / "other.webm"
        other_media.write_bytes(self.media.read_bytes())
        self.payload["media"]["fileName"] = other_media.name
        self.assert_error_code("pair_name_mismatch")

    def test_rejects_timestamps_that_disagree_with_duration(self) -> None:
        self.payload["capturedAt"]["durationMs"] = 1000
        self.assert_error_code("duration_mismatch")

    def test_check_capture_cli_returns_normalized_pair(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "edge.risk_zero_av", "--check-capture", str(self.manifest)],
            cwd=Path(__file__).resolve().parents[2],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        output = json.loads(completed.stdout)
        self.assertTrue(output["capture"]["valid"])
        self.assertEqual(output["capture"]["audioTrack"], "embedded")

    def test_demo_sync_cli_is_explicitly_non_decisional(self) -> None:
        completed = subprocess.run(
            [sys.executable, "-m", "edge.risk_zero_av", "--demo-sync", str(self.manifest)],
            cwd=Path(__file__).resolve().parents[2],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        output = json.loads(completed.stdout)
        self.assertEqual(output["avSync"]["mode"], "demo")
        self.assertIsNone(output["avSync"]["verificationDecision"])
        self.assertIn("미디어를 분석하지 않은", output["avSync"]["warning"])


if __name__ == "__main__":
    unittest.main()
