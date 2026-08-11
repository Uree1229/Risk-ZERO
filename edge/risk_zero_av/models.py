from __future__ import annotations

from dataclasses import dataclass, field
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
    metadata: dict[str, object] = field(default_factory=dict)


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


class DemoAVSyncModelAdapter:
    """Deterministic wiring fixture. It does not inspect media or run an AI model."""

    model_version = "demo-av-sync/0.1"
    _RESULTS: dict[str, tuple[float, float]] = {
        "bona-fide": (42.0, 0.93),
        "audio-replay": (0.0, 0.05),
        "screen-replay": (38.0, 0.94),
        "av-delay": (640.0, 0.96),
        "mouth-occlusion": (0.0, 0.20),
        "background-noise": (65.0, 0.70),
    }

    def analyze(self, capture: CaptureSession) -> tuple[float, float]:
        scenario = capture.metadata.get("scenario")
        if not isinstance(scenario, str) or scenario not in self._RESULTS:
            raise ModelUnavailableError("demo adapter requires a supported capture scenario")
        return self._RESULTS[scenario]
