from datetime import datetime, timedelta, timezone
import unittest

from edge.risk_zero_av.actuator import ActuationGate
from edge.risk_zero_av.challenge import ChallengeService
from edge.risk_zero_av.contracts import ControlRequest, VerificationDecision
from edge.risk_zero_av.demo import demo_evidence
from edge.risk_zero_av.policy import NonceRegistry, VerificationPolicy


class VerificationPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 11, 3, 0, tzinfo=timezone.utc)
        self.challenges = ChallengeService()
        self.challenge = self.challenges.issue(
            now=self.now,
            phrase="초록 우산",
            challenge_id="challenge-test",
            nonce="nonce-test",
        )
        self.request = ControlRequest(
            id="request-test",
            device_id="RZ-EDGE-TEST",
            intent="unlock",
            transcript="초록 우산 문 열어",
            asr_confidence=0.95,
            requested_at=self.now,
            expires_at=self.now + timedelta(seconds=15),
            challenge_id=self.challenge.id,
            nonce=self.challenge.nonce,
        )

    def policy(self) -> VerificationPolicy:
        return VerificationPolicy(
            nonce_registry=NonceRegistry(),
            challenge_service=self.challenges,
        )

    def evaluate(self, scenario: str):
        return self.policy().evaluate(
            self.request,
            demo_evidence(scenario),
            now=self.now + timedelta(seconds=1),
            is_demo=True,
        )

    def test_live_speech_passes(self) -> None:
        attempt = self.evaluate("live-pass")
        self.assertEqual(attempt.decision, VerificationDecision.PASS)
        self.assertEqual(attempt.reason_codes, ("verified_live_speech",))

    def test_audio_replay_without_face_is_blocked(self) -> None:
        attempt = self.evaluate("audio-replay")
        self.assertEqual(attempt.decision, VerificationDecision.BLOCK)
        self.assertIn("no_visible_person", attempt.reason_codes)

    def test_sync_mismatch_is_blocked(self) -> None:
        attempt = self.evaluate("sync-mismatch")
        self.assertEqual(attempt.decision, VerificationDecision.BLOCK)
        self.assertIn("av_sync_mismatch", attempt.reason_codes)

    def test_challenge_mismatch_is_blocked(self) -> None:
        attempt = self.evaluate("challenge-mismatch")
        self.assertEqual(attempt.decision, VerificationDecision.BLOCK)
        self.assertIn("challenge_mismatch", attempt.reason_codes)

    def test_multiple_faces_are_inconclusive(self) -> None:
        attempt = self.evaluate("multiple-faces")
        self.assertEqual(attempt.decision, VerificationDecision.INCONCLUSIVE)

    def test_low_quality_is_inconclusive(self) -> None:
        attempt = self.evaluate("low-quality")
        self.assertEqual(attempt.decision, VerificationDecision.INCONCLUSIVE)

    def test_nonce_cannot_be_replayed(self) -> None:
        challenges = ChallengeService()
        challenge = challenges.issue(now=self.now, phrase="초록 우산", challenge_id="c2", nonce="n2")
        request = ControlRequest(
            **{**self.request.__dict__, "challenge_id": challenge.id, "nonce": challenge.nonce}
        )
        policy = VerificationPolicy(challenge_service=challenges)
        first = policy.evaluate(request, demo_evidence("live-pass"), now=self.now + timedelta(seconds=1))
        second = policy.evaluate(request, demo_evidence("live-pass"), now=self.now + timedelta(seconds=2))
        self.assertEqual(first.decision, VerificationDecision.PASS)
        self.assertEqual(second.reason_codes, ("nonce_replayed",))

    def test_actuation_expires_fail_closed(self) -> None:
        attempt = self.evaluate("live-pass")
        gate = ActuationGate(pass_ttl_seconds=3)
        expired = gate.decide(
            self.request,
            attempt,
            heartbeat_ok=True,
            now=attempt.evaluated_at + timedelta(seconds=4),
        )
        self.assertFalse(expired.allowed)
        self.assertEqual(expired.reason, "verification_expired")


if __name__ == "__main__":
    unittest.main()
