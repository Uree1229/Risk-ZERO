from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .challenge import ChallengeService
from .contracts import AnalysisEvidence, CaptureQuality, ControlRequest
from .policy import VerificationPolicy


def demo_evidence(scenario: str) -> AnalysisEvidence:
    base = dict(
        person_present=True,
        face_count=1,
        mouth_visible=True,
        audio_detected=True,
        av_offset_ms=42.0,
        sync_confidence=0.93,
        active_speaker_score=0.91,
        audio_spoof_score=0.08,
        visual_spoof_score=0.05,
        challenge_matched=True,
        audio_quality=CaptureQuality.GOOD,
        video_quality=CaptureQuality.GOOD,
        clock_synchronized=True,
        model_versions={"av_sync": "demo-0.1", "active_speaker": "demo-0.1", "audio_spoof": "demo-0.1"},
    )
    overrides = {
        "audio-replay": {"person_present": False, "face_count": 0, "audio_spoof_score": 0.91},
        "sync-mismatch": {"av_offset_ms": 640.0, "sync_confidence": 0.96},
        "challenge-mismatch": {"challenge_matched": False},
        "multiple-faces": {"face_count": 2},
        "low-quality": {"mouth_visible": False, "video_quality": CaptureQuality.BAD},
    }
    base.update(overrides.get(scenario, {}))
    return AnalysisEvidence(**base)


def run_demo(scenario: str) -> tuple[ControlRequest, object]:
    now = datetime.now(timezone.utc)
    challenges = ChallengeService()
    challenge = challenges.issue(now=now, phrase="초록 우산")
    request = ControlRequest(
        id=f"request_{scenario}",
        device_id="RZ-EDGE-DEMO-01",
        intent="unlock",
        transcript="초록 우산 문 열어",
        asr_confidence=0.94,
        requested_at=now,
        expires_at=now + timedelta(seconds=15),
        challenge_id=challenge.id,
        nonce=challenge.nonce,
        challenge_phrase=challenge.phrase,
    )
    attempt = VerificationPolicy(challenge_service=challenges).evaluate(
        request,
        demo_evidence(scenario),
        now=now + timedelta(milliseconds=450),
        is_demo=True,
    )
    return request, attempt
