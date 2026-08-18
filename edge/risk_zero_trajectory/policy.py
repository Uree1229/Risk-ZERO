from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from .contracts import TrajectoryAssessment, TrajectoryDecision, TrajectoryObservation


@dataclass(frozen=True)
class TrajectoryPolicyConfig:
    quick_return_seconds: int = 60
    long_dwell_seconds: int = 45
    minimum_tracking_confidence: float = 0.45
    policy_version: str = "trajectory-policy/0.1"


class TrajectoryPolicy:
    def __init__(self, config: TrajectoryPolicyConfig | None = None) -> None:
        self.config = config or TrajectoryPolicyConfig()

    def evaluate(
        self,
        observation: TrajectoryObservation,
        *,
        now: datetime | None = None,
    ) -> TrajectoryAssessment:
        evaluated_at = now or datetime.now(timezone.utc)
        invalid_reason = self._validate(observation)
        if invalid_reason:
            return self._assessment(
                observation,
                TrajectoryDecision.INCONCLUSIVE,
                50,
                (invalid_reason,),
                "동선 데이터가 부족해 판단할 수 없습니다.",
                evaluated_at,
            )

        reason_codes: list[str] = []
        score = 10

        if observation.people_entered > 1 or abs(observation.people_entered - observation.people_exited) > 1:
            reason_codes.append("person_count_mismatch")
            score = max(score, 88)

        for track in observation.tracks:
            if track.returned_within_seconds is not None and track.returned_within_seconds <= self.config.quick_return_seconds:
                reason_codes.append("quick_return")
                score = max(score, 92)
            if track.delivery_action_detected and track.exit_zone == "blind_side":
                reason_codes.append("blind_zone_after_delivery")
                score = max(score, 90)
            if track.dwell_ms >= self.config.long_dwell_seconds * 1000:
                reason_codes.append("long_dwell")
                score = max(score, 68)

        reason_codes = list(dict.fromkeys(reason_codes))
        if any(code in reason_codes for code in ("quick_return", "blind_zone_after_delivery", "person_count_mismatch")):
            if "quick_return" in reason_codes:
                summary = "이탈 후 짧은 시간 안에 다시 접근한 동선이 확인됐습니다."
            elif "blind_zone_after_delivery" in reason_codes:
                summary = "배송 구역을 지난 뒤 사각지대 방향으로 이동했습니다."
            else:
                summary = "진입·이탈 인원 수가 맞지 않아 영상 확인이 필요합니다."
            return self._assessment(
                observation,
                TrajectoryDecision.ALERT,
                score,
                tuple(reason_codes),
                summary,
                evaluated_at,
            )
        if "long_dwell" in reason_codes:
            return self._assessment(
                observation,
                TrajectoryDecision.WATCH,
                score,
                tuple(reason_codes),
                "현관 앞 체류시간이 기준을 넘었습니다.",
                evaluated_at,
            )

        normal_delivery = any(
            track.delivery_action_detected and track.exit_zone == "corridor_exit"
            for track in observation.tracks
        )
        if normal_delivery and observation.people_entered == observation.people_exited:
            return self._assessment(
                observation,
                TrajectoryDecision.NORMAL,
                14,
                ("normal_delivery_exit",),
                "물건을 내려놓은 뒤 정상 출구 방향으로 이탈했습니다.",
                evaluated_at,
            )

        return self._assessment(
            observation,
            TrajectoryDecision.WATCH,
            45,
            ("unclassified_movement",),
            "관찰된 동선이 정상 배송 패턴으로 끝나지 않았습니다.",
            evaluated_at,
        )

    def _validate(self, observation: TrajectoryObservation) -> str | None:
        if observation.schema_version != "trajectory-observation/1":
            return "unsupported_schema"
        if not observation.tracks:
            return "tracking_missing"
        for track in observation.tracks:
            if track.tracking_confidence < self.config.minimum_tracking_confidence:
                return "tracking_confidence_low"
            if len(track.points) < 2:
                return "trajectory_too_short"
            previous_t = -1
            for point in track.points:
                if not 0 <= point.x <= 1 or not 0 <= point.y <= 1:
                    return "trajectory_out_of_bounds"
                if point.t_ms < previous_t:
                    return "trajectory_time_invalid"
                previous_t = point.t_ms
        return None

    def _assessment(
        self,
        observation: TrajectoryObservation,
        decision: TrajectoryDecision,
        score: int,
        reason_codes: tuple[str, ...],
        summary: str,
        evaluated_at: datetime,
    ) -> TrajectoryAssessment:
        return TrajectoryAssessment(
            id=f"trajectory-assessment-{uuid4().hex}",
            observation_id=observation.id,
            decision=decision,
            anomaly_score=max(0, min(score, 100)),
            reason_codes=reason_codes,
            summary=summary,
            policy_version=self.config.policy_version,
            evaluated_at=evaluated_at,
            is_demo=observation.is_demo,
        )
