from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MotionResult:
    count: int
    sum_x: int
    sum_y: int
    min_x: int
    max_x: int
    min_y: int
    max_y: int

    @property
    def centroid(self) -> tuple[float, float] | None:
        if self.count == 0:
            return None
        return self.sum_x / self.count, self.sum_y / self.count


class MotionReference:
    def __init__(self, width: int, height: int, threshold: int = 24) -> None:
        self.width = width
        self.height = height
        self.threshold = threshold
        self.background: bytearray | None = None

    def process(self, frame: bytes) -> MotionResult:
        if len(frame) != self.width * self.height:
            raise ValueError("frame length mismatch")
        if self.background is None:
            self.background = bytearray(frame)
            return MotionResult(0, 0, 0, 0, 0, 0, 0)

        moving: list[tuple[int, int]] = []
        for index, (current, background) in enumerate(zip(frame, self.background)):
            if abs(current - background) >= self.threshold:
                moving.append((index % self.width, index // self.width))
            else:
                self.background[index] = current
        if not moving:
            return MotionResult(0, 0, 0, 0, 0, 0, 0)
        xs = [point[0] for point in moving]
        ys = [point[1] for point in moving]
        return MotionResult(
            count=len(moving),
            sum_x=sum(xs),
            sum_y=sum(ys),
            min_x=min(xs),
            max_x=max(xs),
            min_y=min(ys),
            max_y=max(ys),
        )
