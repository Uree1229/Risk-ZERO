from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .capture_pair import CAPTURE_SCENARIOS, CapturePairValidationError, load_capture_pair


DATASET_INDEX_VERSION = "av-dataset-index/1"


class DatasetIndexError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class DatasetIndex:
    generated_at: datetime
    captures: tuple[dict[str, Any], ...]
    errors: tuple[dict[str, str], ...]

    @property
    def is_valid(self) -> bool:
        return not self.errors

    def to_dict(self) -> dict[str, Any]:
        participants = {item["participantCode"] for item in self.captures}
        scenario_counts = {
            scenario: sum(1 for item in self.captures if item["scenario"] == scenario)
            for scenario in sorted(CAPTURE_SCENARIOS)
        }
        return {
            "schemaVersion": DATASET_INDEX_VERSION,
            "generatedAt": self.generated_at.isoformat(),
            "root": ".",
            "valid": self.is_valid,
            "summary": {
                "totalCandidates": len(self.captures) + len(self.errors),
                "validPairs": len(self.captures),
                "invalidPairs": len(self.errors),
                "participantCount": len(participants),
                "scenarioCounts": scenario_counts,
            },
            "captures": list(self.captures),
            "errors": list(self.errors),
        }


def build_dataset_index(root: str | Path, *, generated_at: datetime | None = None) -> DatasetIndex:
    dataset_root = Path(root).resolve()
    if not dataset_root.is_dir():
        raise DatasetIndexError("dataset_not_found", f"dataset directory not found: {dataset_root}")

    captures: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    manifest_paths = sorted(dataset_root.rglob("risk-zero_*.json"))
    if not manifest_paths:
        raise DatasetIndexError("no_capture_manifests", "no risk-zero_*.json capture manifests were found")

    for manifest_path in manifest_paths:
        relative_manifest = manifest_path.relative_to(dataset_root).as_posix()
        try:
            pair = load_capture_pair(manifest_path)
        except CapturePairValidationError as error:
            errors.append({"manifestFile": relative_manifest, "code": error.code, "message": str(error)})
            continue

        normalized = pair.to_dict()
        captures.append(
            {
                "sessionId": normalized["sessionId"],
                "participantCode": normalized["participantCode"],
                "scenario": normalized["scenario"],
                "challengePhrase": normalized["challengePhrase"],
                "capturedAt": normalized["captureStartedAt"],
                "durationMs": normalized["durationMs"],
                "manifestFile": relative_manifest,
                "mediaFile": pair.media_path.relative_to(dataset_root).as_posix(),
                "mimeType": normalized["mimeType"],
                "sizeBytes": normalized["sizeBytes"],
                "verificationStatus": normalized["verificationStatus"],
            }
        )

    captures.sort(key=lambda item: (item["capturedAt"], item["sessionId"]))
    timestamp = generated_at or datetime.now(timezone.utc)
    if timestamp.tzinfo is None:
        raise DatasetIndexError("invalid_generated_at", "generated_at must include a timezone")
    return DatasetIndex(generated_at=timestamp, captures=tuple(captures), errors=tuple(errors))


def write_dataset_index(index: DatasetIndex, output_path: str | Path) -> Path:
    path = Path(output_path).resolve()
    if path.suffix.lower() != ".json":
        raise DatasetIndexError("invalid_output_extension", "dataset index must use the .json extension")
    if not path.parent.is_dir():
        raise DatasetIndexError("output_directory_not_found", f"output directory not found: {path.parent}")

    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    temporary_path.write_text(json.dumps(index.to_dict(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(path)
    return path
