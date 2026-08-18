import unittest
from unittest.mock import patch

from edge.risk_zero_trajectory.camera_client import ESP32CameraClient


class FakeResponse:
    def __init__(self, payload: bytes, status: int = 200) -> None:
        self.payload = payload
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> None:
        return None

    def read(self) -> bytes:
        return self.payload


class ESP32CameraClientTests(unittest.TestCase):
    @patch("edge.risk_zero_trajectory.camera_client.urlopen")
    def test_reads_health_payload(self, urlopen) -> None:
        urlopen.return_value = FakeResponse(
            b'{"status":"ok","deviceId":"ESP32-CAM-01","rssi":-51,"freeHeap":103220}'
        )
        status = ESP32CameraClient("http://192.168.0.30").health()
        self.assertEqual(status.device_id, "ESP32-CAM-01")
        self.assertEqual(status.rssi, -51)
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, "http://192.168.0.30/health")

    @patch("edge.risk_zero_trajectory.camera_client.urlopen")
    def test_accepts_complete_jpeg(self, urlopen) -> None:
        urlopen.return_value = FakeResponse(b"\xff\xd8frame\xff\xd9")
        self.assertEqual(
            ESP32CameraClient("http://camera.local").capture_jpeg(),
            b"\xff\xd8frame\xff\xd9",
        )

    @patch("edge.risk_zero_trajectory.camera_client.urlopen")
    def test_rejects_incomplete_jpeg(self, urlopen) -> None:
        urlopen.return_value = FakeResponse(b"not-a-jpeg")
        with self.assertRaises(ValueError):
            ESP32CameraClient("http://camera.local").capture_jpeg()


if __name__ == "__main__":
    unittest.main()

