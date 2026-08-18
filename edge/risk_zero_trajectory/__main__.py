import argparse
import json
from pathlib import Path
import sys

from .camera_client import ESP32CameraClient
from .demo import build_demo_observation, scenario_options
from .policy import TrajectoryPolicy


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="RISK-ZERO trajectory policy demo")
    parser.add_argument("--scenario", choices=tuple(item[0] for item in scenario_options), default="normal-delivery")
    parser.add_argument("--probe-camera", metavar="URL", help="ESP32-CAM health 주소 확인 (예: http://192.168.0.30)")
    parser.add_argument("--capture", metavar="JPEG", help="probe한 카메라의 현재 사진을 저장할 경로")
    args = parser.parse_args()
    if args.probe_camera:
        client = ESP32CameraClient(args.probe_camera)
        status = client.health()
        result: dict[str, object] = {
            "status": status.status,
            "deviceId": status.device_id,
            "rssi": status.rssi,
            "freeHeap": status.free_heap,
        }
        if args.capture:
            capture_path = Path(args.capture)
            capture_path.write_bytes(client.capture_jpeg())
            result["capture"] = str(capture_path.resolve())
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return
    observation = build_demo_observation(args.scenario)
    assessment = TrajectoryPolicy().evaluate(observation)
    print(json.dumps({"observation": observation.to_dict(), "assessment": assessment.to_dict()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
