from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class TrajectoryDecision(str, Enum):
    NORMAL = "normal"
    WATCH = "watch"
    ALERT = "alert"
    INCONCLUSIVE = "inconclusive"


@dataclass(frozen=True)
class TrajectoryPoint:
    t_ms: int
    x: float
    y: float
    zone: str


@dataclass(frozen=True)
class PersonTrack:
    id: str
    entered_at: datetime
    last_seen_at: datetime
    entry_zone: str
    exit_zone: str | None
    dwell_ms: int
    delivery_action_detected: bool
    returned_within_seconds: int | None
    tracking_confidence: float
    points: tuple[TrajectoryPoint, ...]


@dataclass(frozen=True)
class TrajectoryObservation:
    id: str
    schema_version: str
    device_id: str
    captured_at: datetime
    frame_width: int
    frame_height: int
    people_entered: int
    people_exited: int
    people_visible: int
    processed_video: str | None
    tracks: tuple[PersonTrack, ...]
    is_demo: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "schemaVersion": self.schema_version,
            "deviceId": self.device_id,
            "capturedAt": self.captured_at.isoformat(),
            "frame": {"width": self.frame_width, "height": self.frame_height},
            "counts": {
                "entered": self.people_entered,
                "exited": self.people_exited,
                "visible": self.people_visible,
            },
            "processedVideo": self.processed_video,
            "tracks": [
                {
                    "id": track.id,
                    "enteredAt": track.entered_at.isoformat(),
                    "lastSeenAt": track.last_seen_at.isoformat(),
                    "entryZone": track.entry_zone,
                    "exitZone": track.exit_zone,
                    "dwellMs": track.dwell_ms,
                    "deliveryActionDetected": track.delivery_action_detected,
                    "returnedWithinSeconds": track.returned_within_seconds,
                    "trackingConfidence": track.tracking_confidence,
                    "points": [
                        {
                            "tMs": point.t_ms,
                            "x": point.x,
                            "y": point.y,
                            "zone": point.zone,
                        }
                        for point in track.points
                    ],
                }
                for track in self.tracks
            ],
            "isDemo": self.is_demo,
        }


@dataclass(frozen=True)
class TrajectoryAssessment:
    id: str
    observation_id: str
    decision: TrajectoryDecision
    anomaly_score: int
    reason_codes: tuple[str, ...]
    summary: str
    policy_version: str
    evaluated_at: datetime
    is_demo: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "observationId": self.observation_id,
            "decision": self.decision.value,
            "anomalyScore": self.anomaly_score,
            "reasonCodes": list(self.reason_codes),
            "summary": self.summary,
            "policyVersion": self.policy_version,
            "evaluatedAt": self.evaluated_at.isoformat(),
            "isDemo": self.is_demo,
            "criminalIntentDetermined": False,
        }
