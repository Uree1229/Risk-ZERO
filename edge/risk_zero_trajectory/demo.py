from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .contracts import PersonTrack, TrajectoryObservation, TrajectoryPoint


scenario_options = (
    ("normal-delivery", "정상 배송"),
    ("hidden-after-delivery", "배송 후 사각지대"),
    ("quick-return", "짧은 시간 내 재접근"),
    ("multiple-persons", "진입 인원 불일치"),
    ("long-dwell", "장시간 체류"),
    ("tracking-lost", "추적 품질 부족"),
)


def _points(values: tuple[tuple[int, float, float, str], ...]) -> tuple[TrajectoryPoint, ...]:
    return tuple(TrajectoryPoint(t_ms=t, x=x, y=y, zone=zone) for t, x, y, zone in values)


def build_demo_observation(scenario: str, *, now: datetime | None = None) -> TrajectoryObservation:
    captured_at = now or datetime.now(timezone.utc)
    entered_at = captured_at - timedelta(seconds=24)
    base_points = _points(
        (
            (0, 0.08, 0.86, "corridor_entry"),
            (2800, 0.22, 0.71, "approach"),
            (6100, 0.42, 0.56, "approach"),
            (9400, 0.57, 0.43, "door_zone"),
            (12800, 0.62, 0.58, "delivery_zone"),
            (17100, 0.39, 0.69, "approach"),
            (22100, 0.12, 0.87, "corridor_exit"),
        )
    )

    exit_zone = "corridor_exit"
    returned_within_seconds = None
    dwell_ms = 22_100
    confidence = 0.91
    people_entered = 1
    people_exited = 1
    people_visible = 0
    points = base_points
    second_track: PersonTrack | None = None

    if scenario == "hidden-after-delivery":
        exit_zone = "blind_side"
        people_exited = 0
        points = _points(
            (
                *[(point.t_ms, point.x, point.y, point.zone) for point in base_points[:5]],
                (16600, 0.78, 0.62, "blind_side"),
                (20500, 0.93, 0.57, "blind_side"),
            )
        )
    elif scenario == "quick-return":
        returned_within_seconds = 38
        points = (*base_points, TrajectoryPoint(38000, 0.11, 0.86, "corridor_entry"), TrajectoryPoint(42100, 0.35, 0.66, "approach"))
        people_entered = 2
        people_exited = 1
        people_visible = 1
    elif scenario == "multiple-persons":
        people_entered = 2
        people_exited = 0
        people_visible = 2
        second_track = PersonTrack(
            id="person-02",
            entered_at=entered_at + timedelta(seconds=4),
            last_seen_at=captured_at,
            entry_zone="corridor_entry",
            exit_zone=None,
            dwell_ms=18_000,
            delivery_action_detected=False,
            returned_within_seconds=None,
            tracking_confidence=0.86,
            points=_points(((0, 0.14, 0.91, "corridor_entry"), (6200, 0.31, 0.74, "approach"), (15000, 0.47, 0.68, "approach"))),
        )
    elif scenario == "long-dwell":
        dwell_ms = 72_000
        people_exited = 0
        people_visible = 1
        exit_zone = None
        points = _points(((0, 0.09, 0.86, "corridor_entry"), (4500, 0.48, 0.51, "door_zone"), (72000, 0.51, 0.50, "door_zone")))
    elif scenario == "tracking-lost":
        confidence = 0.31
        people_exited = 0
        exit_zone = None
        points = _points(((0, 0.08, 0.86, "corridor_entry"), (2700, 0.23, 0.75, "approach")))

    primary = PersonTrack(
        id="person-01",
        entered_at=entered_at,
        last_seen_at=captured_at,
        entry_zone="corridor_entry",
        exit_zone=exit_zone,
        dwell_ms=dwell_ms,
        delivery_action_detected=scenario != "tracking-lost",
        returned_within_seconds=returned_within_seconds,
        tracking_confidence=confidence,
        points=tuple(points),
    )
    tracks = (primary,) if second_track is None else (primary, second_track)
    return TrajectoryObservation(
        id=f"trajectory-{scenario}",
        schema_version="trajectory-observation/1",
        device_id="ESP32-CAM-DEMO-01",
        captured_at=captured_at,
        frame_width=320,
        frame_height=240,
        people_entered=people_entered,
        people_exited=people_exited,
        people_visible=people_visible,
        processed_video=f"clips/{scenario}.mp4",
        tracks=tracks,
        is_demo=True,
    )
