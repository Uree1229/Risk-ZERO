from __future__ import annotations

from dataclasses import dataclass
import json
from urllib.parse import urljoin
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class CameraStatus:
    status: str
    device_id: str
    rssi: int
    free_heap: int


class ESP32CameraClient:
    """ESP32-CAM 수집 펌웨어의 읽기 전용 HTTP 클라이언트다."""

    def __init__(self, base_url: str, *, timeout_seconds: float = 3) -> None:
        self.base_url = base_url.rstrip("/") + "/"
        self.timeout_seconds = timeout_seconds

    def health(self) -> CameraStatus:
        payload = json.loads(self._get("health", "application/json").decode("utf-8"))
        return CameraStatus(
            status=str(payload["status"]),
            device_id=str(payload["deviceId"]),
            rssi=int(payload["rssi"]),
            free_heap=int(payload["freeHeap"]),
        )

    def capture_jpeg(self) -> bytes:
        payload = self._get("capture", "image/jpeg")
        if not payload.startswith(b"\xff\xd8") or not payload.endswith(b"\xff\xd9"):
            raise ValueError("camera response is not a complete JPEG image")
        return payload

    def _get(self, path: str, accept: str) -> bytes:
        request = Request(urljoin(self.base_url, path), headers={"Accept": accept})
        with urlopen(request, timeout=self.timeout_seconds) as response:
            if response.status != 200:
                raise ConnectionError(f"ESP32-CAM returned HTTP {response.status}")
            return response.read()

