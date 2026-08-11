from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


class VerificationDecision(str, Enum):
    PENDING = "pending"
    PASS = "pass"
    BLOCK = "block"
    INCONCLUSIVE = "inconclusive"


class CaptureQuality(str, Enum):
    GOOD = "good"
    DEGRADED = "degraded"
    BAD = "bad"
    MISSING = "missing"


@dataclass(frozen=True)
class ControlRequest:
    id: str
    device_id: str
    intent: str
    transcript: str
    asr_confidence: float | None
    requested_at: datetime
    expires_at: datetime
    challenge_id: str | None
    nonce: str
    challenge_phrase: str | None = None


@dataclass
class ChallengeSession:
    id: str
    phrase: str
    nonce: str
    issued_at: datetime
    expires_at: datetime
    used_at: datetime | None = None


@dataclass(frozen=True)
class AnalysisEvidence:
    person_present: bool
    face_count: int
    mouth_visible: bool
    audio_detected: bool
    av_offset_ms: float | None
    sync_confidence: float | None
    active_speaker_score: float | None
    audio_spoof_score: float | None
    visual_spoof_score: float | None
    challenge_matched: bool | None
    audio_quality: CaptureQuality
    video_quality: CaptureQuality
    clock_synchronized: bool
    model_versions: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class VerificationAttempt:
    id: str
    schema_version: str
    request_id: str
    captured_at: datetime
    decision: VerificationDecision
    confidence: float | None
    reason_codes: tuple[str, ...]
    summary: str
    policy_version: str
    evaluated_at: datetime
    processing_time_ms: int
    is_demo: bool
    evidence: AnalysisEvidence

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["decision"] = self.decision.value
        value["captured_at"] = self.captured_at.isoformat()
        value["evaluated_at"] = self.evaluated_at.isoformat()
        value["evidence"]["audio_quality"] = self.evidence.audio_quality.value
        value["evidence"]["video_quality"] = self.evidence.video_quality.value
        value["reason_codes"] = list(self.reason_codes)
        return value


@dataclass(frozen=True)
class ActuationDecision:
    id: str
    attempt_id: str
    request_id: str
    allowed: bool
    output: str
    reason: str
    valid_until: datetime
    executed_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        value = asdict(self)
        value["valid_until"] = self.valid_until.isoformat()
        value["executed_at"] = self.executed_at.isoformat() if self.executed_at else None
        return value
