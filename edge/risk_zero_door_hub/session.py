from __future__ import annotations

from datetime import datetime

from .contracts import DoorHubEvent, DoorHubStage, SafetyStatus, VisionResult


class DoorHubSession:
    """Hardware-independent event correlation model.

    Pin assignment, SPI timing, PIR debounce and event-end thresholds stay in the
    board adapter. This class only keeps the monotonic event id and rejects stale
    FPGA results.
    """

    def __init__(self, *, next_event_id: int = 1) -> None:
        if next_event_id < 0:
            raise ValueError("next_event_id must be non-negative")
        self._next_event_id = next_event_id
        self._active_event_id: int | None = None
        self._started_at: datetime | None = None

    @property
    def active_event_id(self) -> int | None:
        return self._active_event_id

    def start(self, started_at: datetime) -> int:
        if self._active_event_id is not None:
            return self._active_event_id
        event_id = self._next_event_id
        self._next_event_id += 1
        self._active_event_id = event_id
        self._started_at = started_at
        return event_id

    def complete(
        self,
        *,
        event_id: int,
        household_id: str,
        device_id: str,
        generated_at: datetime,
        ended_at: datetime | None,
        vision: VisionResult,
        safety: SafetyStatus,
        is_demo: bool = False,
    ) -> DoorHubEvent:
        if event_id != self._active_event_id or self._started_at is None:
            raise ValueError("stale or unknown FPGA result event id")
        stage = DoorHubStage.FAULT if safety.fault_latched or vision.status == "fault" else DoorHubStage.RESULT_READY
        event = DoorHubEvent(
            household_id=household_id,
            device_id=device_id,
            event_id=event_id,
            stage=stage,
            pir_active=ended_at is None,
            started_at=self._started_at,
            ended_at=ended_at,
            generated_at=generated_at,
            vision=vision,
            safety=safety,
            is_demo=is_demo,
        )
        event.validate()
        if ended_at is not None:
            self._active_event_id = None
            self._started_at = None
        return event
