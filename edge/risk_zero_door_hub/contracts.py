from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any


class DoorHubStage(str, Enum):
    IDLE = "idle"
    VISION_WAKE = "vision-wake"
    CAMERA_INIT = "camera-init"
    CAPTURE = "capture"
    END_BACKGROUND = "end-background"
    RESULT_READY = "result-ready"
    VISION_SLEEP = "vision-sleep"
    FAULT = "fault"


class SafetyDecision(str, Enum):
    NONE = "none"
    ALLOW = "allow"
    BLOCK = "block"
    ABORT = "abort"


@dataclass(frozen=True)
class VisionResult:
    status: str
    visitor_present: bool
    object_count: int
    primary_zone: int | None
    zone_mask: int
    dwell_ms: int
    background_change_ratio: float
    background_changed: bool
    snapshot_ready: bool
    snapshot_ref: str | None = None

    def validate(self) -> None:
        if self.status not in {"ready", "capturing", "sleeping", "fault"}:
            raise ValueError("unsupported Vision status")
        if self.object_count < 0 or self.dwell_ms < 0:
            raise ValueError("Vision counts and dwell must be non-negative")
        if self.primary_zone is not None and not 1 <= self.primary_zone <= 9:
            raise ValueError("primary_zone must be between 1 and 9")
        if not 0 <= self.zone_mask <= 0x1FF:
            raise ValueError("zone_mask must fit the 3x3 zone bitmap")
        if not 0 <= self.background_change_ratio <= 1:
            raise ValueError("background_change_ratio must be between 0 and 1")


@dataclass(frozen=True)
class SafetyStatus:
    heartbeat_ok: bool
    auth_armed: bool
    decision: SafetyDecision
    block_reason: str | None
    fault_latched: bool
    door_closed: bool
    tamper_detected: bool
    emergency_stop: bool
    output_active: bool
    output_target: str = "led"

    def validate(self) -> None:
        if self.output_target != "led":
            raise ValueError("the first vertical integration only permits the LED target")
        if self.output_active and self.decision is not SafetyDecision.ALLOW:
            raise ValueError("an active output requires an ALLOW decision")
        if self.output_active and (self.fault_latched or self.tamper_detected or self.emergency_stop):
            raise ValueError("an active output cannot coexist with a Safety fault")


@dataclass(frozen=True)
class DoorHubEvent:
    household_id: str
    device_id: str
    event_id: int
    stage: DoorHubStage
    pir_active: bool
    started_at: datetime
    ended_at: datetime | None
    generated_at: datetime
    vision: VisionResult
    safety: SafetyStatus
    is_demo: bool = False
    schema_version: str = "door-hub-event/1"

    def validate(self) -> None:
        if self.schema_version != "door-hub-event/1":
            raise ValueError("unsupported Door Hub schema")
        if not self.household_id or not self.device_id or self.event_id < 0:
            raise ValueError("household, device and monotonic event id are required")
        if self.ended_at is not None and self.ended_at < self.started_at:
            raise ValueError("event end cannot precede event start")
        self.vision.validate()
        self.safety.validate()

    def to_dict(self) -> dict[str, Any]:
        self.validate()
        return {
            "householdId": self.household_id,
            "deviceId": self.device_id,
            "schemaVersion": self.schema_version,
            "generatedAt": self.generated_at.isoformat(),
            "isDemo": self.is_demo,
            "session": {
                "eventId": self.event_id,
                "stage": self.stage.value,
                "pirActive": self.pir_active,
                "startedAt": self.started_at.isoformat(),
                "endedAt": self.ended_at.isoformat() if self.ended_at else None,
            },
            "vision": {
                "status": self.vision.status,
                "visitorPresent": self.vision.visitor_present,
                "objectCount": self.vision.object_count,
                "primaryZone": self.vision.primary_zone,
                "zoneMask": self.vision.zone_mask,
                "dwellMs": self.vision.dwell_ms,
                "backgroundChangeRatio": self.vision.background_change_ratio,
                "backgroundChanged": self.vision.background_changed,
                "snapshotReady": self.vision.snapshot_ready,
                "snapshotRef": self.vision.snapshot_ref,
            },
            "safety": {
                "heartbeatOk": self.safety.heartbeat_ok,
                "authArmed": self.safety.auth_armed,
                "decision": self.safety.decision.value,
                "blockReason": self.safety.block_reason,
                "faultLatched": self.safety.fault_latched,
                "doorClosed": self.safety.door_closed,
                "tamperDetected": self.safety.tamper_detected,
                "emergencyStop": self.safety.emergency_stop,
                "outputTarget": self.safety.output_target,
                "outputActive": self.safety.output_active,
            },
        }
