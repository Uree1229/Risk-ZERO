from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .contracts import SafetyDecision, SafetyStatus, VisionResult
from .session import DoorHubSession


def build_demo_event(*, now: datetime | None = None):
    generated_at = now or datetime.now(timezone.utc)
    session = DoorHubSession(next_event_id=1042)
    event_id = session.start(generated_at - timedelta(seconds=21))
    return session.complete(
        event_id=event_id,
        household_id="demo-household-01",
        device_id="RZ-DOOR-HUB-DEMO-01",
        generated_at=generated_at,
        ended_at=generated_at - timedelta(seconds=1),
        vision=VisionResult(
            status="ready",
            visitor_present=False,
            object_count=0,
            primary_zone=6,
            zone_mask=0b000100000,
            dwell_ms=18_200,
            background_change_ratio=0.12,
            background_changed=True,
            snapshot_ready=True,
        ),
        safety=SafetyStatus(
            heartbeat_ok=True,
            auth_armed=False,
            decision=SafetyDecision.NONE,
            block_reason=None,
            fault_latched=False,
            door_closed=True,
            tamper_detected=False,
            emergency_stop=False,
            output_active=False,
        ),
        is_demo=True,
    )
