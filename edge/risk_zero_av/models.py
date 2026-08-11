from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .contracts import AnalysisEvidence


@dataclass(frozen=True)
class CaptureSession:
    id: str
    video_path: Path
    audio_path: Path | None
    capture_started_at: str
    capture_ended_at: str


class CaptureAdapter(Protocol):
    def capture(self, duration_seconds: float) -> CaptureSession: ...


class AVSyncModelAdapter(Protocol):
    def analyze(self, capture: CaptureSession) -> tuple[float, float]:
        """Return (offset_ms, confidence)."""


class ActiveSpeakerModelAdapter(Protocol):
    def analyze(self, capture: CaptureSession) -> float: ...


class AudioSpoofModelAdapter(Protocol):
    def analyze(self, capture: CaptureSession) -> float: ...


class EvidenceAssembler(Protocol):
    def analyze(self, capture: CaptureSession, transcript: str) -> AnalysisEvidence: ...


class ModelUnavailableError(RuntimeError):
    """Raised when a real model or device adapter has not been configured."""
