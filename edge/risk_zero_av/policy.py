from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from .challenge import ChallengeService
from .contracts import (
    AnalysisEvidence,
    CaptureQuality,
    ControlRequest,
    VerificationAttempt,
    VerificationDecision,
)


@dataclass(frozen=True)
class PolicyConfig:
    version: str = "av-policy/0.1"
    max_abs_av_offset_ms: float = 200.0
    min_sync_confidence: float = 0.75
    min_active_speaker_score: float = 0.70
    max_audio_spoof_score: float = 0.45
    max_visual_spoof_score: float = 0.45


class NonceRegistry:
    def __init__(self) -> None:
        self._used: set[str] = set()

    def claim(self, nonce: str) -> bool:
        if nonce in self._used:
            return False
        self._used.add(nonce)
        return True


class VerificationPolicy:
    def __init__(
        self,
        config: PolicyConfig | None = None,
        nonce_registry: NonceRegistry | None = None,
        challenge_service: ChallengeService | None = None,
    ) -> None:
        self.config = config or PolicyConfig()
        self.nonce_registry = nonce_registry or NonceRegistry()
        self.challenge_service = challenge_service

    def evaluate(
        self,
        request: ControlRequest,
        evidence: AnalysisEvidence,
        *,
        captured_at: datetime | None = None,
        now: datetime | None = None,
        is_demo: bool = False,
    ) -> VerificationAttempt:
        started = time.perf_counter()
        evaluated_at = now or datetime.now(timezone.utc)
        captured = captured_at or evaluated_at

        if not self.nonce_registry.claim(request.nonce):
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("nonce_replayed",), "이미 사용한 요청입니다.", is_demo)
        if evaluated_at > request.expires_at:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("request_expired",), "제어 요청이 만료되었습니다.", is_demo)

        if request.challenge_id:
            if self.challenge_service is None:
                return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.INCONCLUSIVE, ("model_error",), "challenge 저장소를 확인할 수 없습니다.", is_demo)
            challenge_error = self.challenge_service.consume(request.challenge_id, now=evaluated_at)
            if challenge_error:
                return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, (challenge_error,), "challenge를 사용할 수 없습니다.", is_demo)
            if evidence.challenge_matched is not True:
                return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("challenge_mismatch",), "제시된 문구와 발화가 다릅니다.", is_demo)

        if not evidence.person_present or evidence.face_count == 0:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("no_visible_person",), "화면에서 발화자를 확인하지 못했습니다.", is_demo)
        if evidence.face_count > 1:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.INCONCLUSIVE, ("multiple_faces",), "발화자를 한 명으로 특정할 수 없습니다.", is_demo)
        if not evidence.mouth_visible:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.INCONCLUSIVE, ("mouth_not_visible",), "입술 움직임을 판독할 수 없습니다.", is_demo)
        if not evidence.audio_detected:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("audio_missing",), "제어 요청과 연결된 발화를 찾지 못했습니다.", is_demo)
        if not evidence.clock_synchronized:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.INCONCLUSIVE, ("clock_unsynchronized",), "카메라와 마이크 시간을 신뢰할 수 없습니다.", is_demo)
        if evidence.audio_quality in (CaptureQuality.BAD, CaptureQuality.MISSING) or evidence.video_quality in (CaptureQuality.BAD, CaptureQuality.MISSING):
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.INCONCLUSIVE, ("capture_quality_low",), "음성 또는 영상 품질이 부족합니다.", is_demo)

        if evidence.audio_spoof_score is not None and evidence.audio_spoof_score >= self.config.max_audio_spoof_score:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("audio_spoof_suspected",), "녹음 또는 합성 음성 징후가 확인되었습니다.", is_demo)
        if evidence.visual_spoof_score is not None and evidence.visual_spoof_score >= self.config.max_visual_spoof_score:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("visual_spoof_suspected",), "영상 재생 공격 징후가 확인되었습니다.", is_demo)
        if evidence.av_offset_ms is None or evidence.sync_confidence is None or evidence.active_speaker_score is None:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.INCONCLUSIVE, ("model_error",), "검증 수치가 완전하지 않습니다.", is_demo)
        if abs(evidence.av_offset_ms) > self.config.max_abs_av_offset_ms:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("av_sync_mismatch",), "음성과 입술 움직임의 시간이 맞지 않습니다.", is_demo)
        if evidence.active_speaker_score < self.config.min_active_speaker_score:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.BLOCK, ("active_speaker_mismatch",), "화면 속 사람이 해당 음성을 내는 것으로 보기 어렵습니다.", is_demo)
        if evidence.sync_confidence < self.config.min_sync_confidence:
            return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.INCONCLUSIVE, ("sync_confidence_low",), "시청각 싱크 신뢰도가 부족합니다.", is_demo)

        return self._result(request, evidence, captured, evaluated_at, started, VerificationDecision.PASS, ("verified_live_speech",), "현재 발화 검증을 통과했습니다.", is_demo)

    def _result(
        self,
        request: ControlRequest,
        evidence: AnalysisEvidence,
        captured_at: datetime,
        evaluated_at: datetime,
        started: float,
        decision: VerificationDecision,
        reason_codes: tuple[str, ...],
        summary: str,
        is_demo: bool,
    ) -> VerificationAttempt:
        confidence_values = [
            value for value in (
                evidence.sync_confidence,
                evidence.active_speaker_score,
                None if evidence.audio_spoof_score is None else 1 - evidence.audio_spoof_score,
                None if evidence.visual_spoof_score is None else 1 - evidence.visual_spoof_score,
            ) if value is not None
        ]
        confidence = min(confidence_values) if confidence_values else None
        elapsed_ms = max(0, round((time.perf_counter() - started) * 1000))
        return VerificationAttempt(
            id=f"attempt_{uuid.uuid4().hex}",
            schema_version="av-verification/1",
            request_id=request.id,
            captured_at=captured_at,
            decision=decision,
            confidence=confidence,
            reason_codes=reason_codes,
            summary=summary,
            policy_version=self.config.version,
            evaluated_at=evaluated_at,
            processing_time_ms=elapsed_ms,
            is_demo=is_demo,
            evidence=evidence,
        )
