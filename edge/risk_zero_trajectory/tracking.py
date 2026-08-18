from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot

from .contracts import TrajectoryPoint


@dataclass(frozen=True)
class Detection:
    """탐지 모델이 반환하는 정규화 좌표 상자다."""

    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float

    def __post_init__(self) -> None:
        if not (0 <= self.x1 < self.x2 <= 1 and 0 <= self.y1 < self.y2 <= 1):
            raise ValueError("detection coordinates must be normalized to 0..1")
        if not 0 <= self.confidence <= 1:
            raise ValueError("detection confidence must be normalized to 0..1")

    @property
    def centroid(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)


@dataclass(frozen=True)
class TrackSnapshot:
    id: str
    confidence: float
    missed_frames: int
    points: tuple[TrajectoryPoint, ...]


@dataclass
class _TrackState:
    id: str
    confidence_sum: float
    detection_count: int
    missed_frames: int = 0
    points: list[TrajectoryPoint] = field(default_factory=list)

    @property
    def confidence(self) -> float:
        return self.confidence_sum / self.detection_count

    @property
    def centroid(self) -> tuple[float, float]:
        point = self.points[-1]
        return point.x, point.y

    def snapshot(self) -> TrackSnapshot:
        return TrackSnapshot(
            id=self.id,
            confidence=self.confidence,
            missed_frames=self.missed_frames,
            points=tuple(self.points),
        )


def classify_zone(x: float, y: float) -> str:
    """웹 동선 지도와 같은 정규화 영역 이름을 반환한다."""

    if x >= 0.80 and 0.27 <= y <= 0.74:
        return "blind_side"
    if 0.52 <= x <= 0.73 and 0.53 <= y <= 0.73:
        return "delivery_zone"
    if 0.40 <= x <= 0.67 and 0.25 <= y <= 0.56:
        return "door_zone"
    if x <= 0.26 and y >= 0.70:
        return "corridor_entry"
    return "approach"


class CentroidTracker:
    """탐지 모델과 독립적인 작은 MVP 추적기다.

    detector가 매 프레임 사람 상자를 주면 중심점의 가까운 순서로 기존 ID를
    이어 붙인다. 가림이나 교차 상황을 완전하게 해결하는 re-ID 모델은 아니다.
    """

    def __init__(self, *, max_distance: float = 0.20, max_missed_frames: int = 5) -> None:
        if max_distance <= 0:
            raise ValueError("max_distance must be positive")
        if max_missed_frames < 0:
            raise ValueError("max_missed_frames must be non-negative")
        self.max_distance = max_distance
        self.max_missed_frames = max_missed_frames
        self._next_id = 1
        self._tracks: dict[str, _TrackState] = {}
        self._finished: list[TrackSnapshot] = []

    def update(self, detections: list[Detection], *, t_ms: int) -> tuple[TrackSnapshot, ...]:
        if t_ms < 0:
            raise ValueError("t_ms must be non-negative")
        candidates: list[tuple[float, str, int]] = []
        for track_id, track in self._tracks.items():
            track_x, track_y = track.centroid
            for detection_index, detection in enumerate(detections):
                detection_x, detection_y = detection.centroid
                distance = hypot(track_x - detection_x, track_y - detection_y)
                if distance <= self.max_distance:
                    candidates.append((distance, track_id, detection_index))

        matched_tracks: set[str] = set()
        matched_detections: set[int] = set()
        for _, track_id, detection_index in sorted(candidates):
            if track_id in matched_tracks or detection_index in matched_detections:
                continue
            self._append_detection(self._tracks[track_id], detections[detection_index], t_ms)
            matched_tracks.add(track_id)
            matched_detections.add(detection_index)

        for track_id, track in tuple(self._tracks.items()):
            if track_id in matched_tracks:
                continue
            track.missed_frames += 1
            if track.missed_frames > self.max_missed_frames:
                self._finished.append(track.snapshot())
                del self._tracks[track_id]

        for detection_index, detection in enumerate(detections):
            if detection_index in matched_detections:
                continue
            track = _TrackState(
                id=f"person-{self._next_id:02d}",
                confidence_sum=0,
                detection_count=0,
            )
            self._next_id += 1
            self._append_detection(track, detection, t_ms)
            self._tracks[track.id] = track

        return self.active_tracks

    @property
    def active_tracks(self) -> tuple[TrackSnapshot, ...]:
        return tuple(track.snapshot() for track in self._tracks.values())

    def consume_finished_tracks(self) -> tuple[TrackSnapshot, ...]:
        finished = tuple(self._finished)
        self._finished.clear()
        return finished

    @staticmethod
    def _append_detection(track: _TrackState, detection: Detection, t_ms: int) -> None:
        x, y = detection.centroid
        track.points.append(TrajectoryPoint(t_ms=t_ms, x=x, y=y, zone=classify_zone(x, y)))
        track.confidence_sum += detection.confidence
        track.detection_count += 1
        track.missed_frames = 0

