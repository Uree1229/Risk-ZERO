from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from .models import CaptureSession


CAPTURE_MANIFEST_VERSION = "av-capture-manifest/1"
CAPTURE_SCENARIOS = frozenset(
    {
        "bona-fide",
        "audio-replay",
        "screen-replay",
        "av-delay",
        "mouth-occlusion",
        "background-noise",
    }
)


class CapturePairValidationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class CapturePair:
    manifest_path: Path
    media_path: Path
    session: CaptureSession
    participant_code: str
    scenario: str
    challenge_phrase: str
    mime_type: str
    size_bytes: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": True,
            "schemaVersion": CAPTURE_MANIFEST_VERSION,
            "sessionId": self.session.id,
            "participantCode": self.participant_code,
            "scenario": self.scenario,
            "challengePhrase": self.challenge_phrase,
            "captureStartedAt": self.session.capture_started_at,
            "captureEndedAt": self.session.capture_ended_at,
            "mediaFile": self.media_path.name,
            "mimeType": self.mime_type,
            "sizeBytes": self.size_bytes,
            "audioTrack": "embedded",
            "verificationStatus": "not_evaluated",
        }


def _required_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CapturePairValidationError("missing_field", f"{field} must be a non-empty string")
    return value.strip()


def _required_mapping(value: Any, field: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise CapturePairValidationError("missing_field", f"{field} must be an object")
    return value


def _parse_timestamp(value: Any, field: str) -> datetime:
    text = _required_text(value, field)
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as error:
        raise CapturePairValidationError("invalid_timestamp", f"{field} must be an ISO 8601 timestamp") from error
    if parsed.tzinfo is None:
        raise CapturePairValidationError("invalid_timestamp", f"{field} must include a timezone")
    return parsed


def load_capture_pair(manifest_path: str | Path) -> CapturePair:
    path = Path(manifest_path).resolve()
    if not path.is_file():
        raise CapturePairValidationError("manifest_not_found", f"manifest file not found: {path}")
    if path.suffix.lower() != ".json":
        raise CapturePairValidationError("invalid_manifest_extension", "manifest file must use the .json extension")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CapturePairValidationError("invalid_json", "manifest must be valid UTF-8 JSON") from error

    if not isinstance(payload, dict):
        raise CapturePairValidationError("invalid_manifest", "manifest root must be an object")
    if payload.get("schemaVersion") != CAPTURE_MANIFEST_VERSION:
        raise CapturePairValidationError("unsupported_schema", f"schemaVersion must be {CAPTURE_MANIFEST_VERSION}")
    if payload.get("source") != "browser-local":
        raise CapturePairValidationError("invalid_source", "source must be browser-local")
    if payload.get("verificationStatus") != "not_evaluated":
        raise CapturePairValidationError("invalid_status", "new captures must be not_evaluated")

    session_id = _required_text(payload.get("sessionId"), "sessionId")
    participant_code = _required_text(payload.get("participantCode"), "participantCode")
    scenario = _required_text(payload.get("scenario"), "scenario")
    if scenario not in CAPTURE_SCENARIOS:
        raise CapturePairValidationError("invalid_scenario", f"unsupported scenario: {scenario}")
    challenge_phrase = _required_text(payload.get("challengePhrase"), "challengePhrase")

    captured_at = _required_mapping(payload.get("capturedAt"), "capturedAt")
    started = _parse_timestamp(captured_at.get("started"), "capturedAt.started")
    ended = _parse_timestamp(captured_at.get("ended"), "capturedAt.ended")
    duration_ms = captured_at.get("durationMs")
    if not isinstance(duration_ms, int) or duration_ms < 0:
        raise CapturePairValidationError("invalid_duration", "capturedAt.durationMs must be a non-negative integer")
    measured_duration_ms = round((ended - started).total_seconds() * 1000)
    if measured_duration_ms < 0 or abs(measured_duration_ms - duration_ms) > 2:
        raise CapturePairValidationError("duration_mismatch", "capture timestamps do not match durationMs")

    media = _required_mapping(payload.get("media"), "media")
    file_name = _required_text(media.get("fileName"), "media.fileName")
    if Path(file_name).name != file_name:
        raise CapturePairValidationError("unsafe_media_path", "media.fileName must not contain a directory")
    if Path(file_name).stem != path.stem:
        raise CapturePairValidationError("pair_name_mismatch", "media and manifest must have the same file stem")
    mime_type = _required_text(media.get("mimeType"), "media.mimeType")
    if not mime_type.startswith("video/"):
        raise CapturePairValidationError("invalid_media_type", "media.mimeType must be a video type")
    size_bytes = media.get("sizeBytes")
    if not isinstance(size_bytes, int) or isinstance(size_bytes, bool) or size_bytes <= 0:
        raise CapturePairValidationError("invalid_media_size", "media.sizeBytes must be a positive integer")

    media_path = (path.parent / file_name).resolve()
    if media_path.parent != path.parent:
        raise CapturePairValidationError("unsafe_media_path", "media file must stay beside the manifest")
    if not media_path.is_file():
        raise CapturePairValidationError("media_not_found", f"media file not found: {media_path.name}")
    if media_path.stat().st_size != size_bytes:
        raise CapturePairValidationError("media_size_mismatch", "media file size does not match the manifest")

    session = CaptureSession(
        id=session_id,
        video_path=media_path,
        audio_path=None,
        capture_started_at=started.isoformat(),
        capture_ended_at=ended.isoformat(),
        metadata={
            "participantCode": participant_code,
            "scenario": scenario,
            "challengePhrase": challenge_phrase,
            "manifestPath": str(path),
        },
    )
    return CapturePair(
        manifest_path=path,
        media_path=media_path,
        session=session,
        participant_code=participant_code,
        scenario=scenario,
        challenge_phrase=challenge_phrase,
        mime_type=mime_type,
        size_bytes=size_bytes,
    )
