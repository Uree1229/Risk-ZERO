from __future__ import annotations

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import time


started = time.monotonic()


def build_status() -> dict[str, object]:
    elapsed = time.monotonic() - started
    frame_id = int(elapsed * 2) + 1
    progress = min(1, (frame_id % 24) / 23)
    x = 18 + int(progress * 128)
    y = 102 - int(math.sin(progress * math.pi) * 52)
    zone = "blind_side" if x >= 128 else "delivery_zone" if x >= 84 and y >= 64 else "approach"
    decision = "alert" if zone == "blind_side" else "watch"
    points = []
    for point_index in range(max(2, min(frame_id, 24))):
        point_progress = point_index / 23
        point_x = 18 + int(point_progress * 128)
        point_y = 102 - int(math.sin(point_progress * math.pi) * 52)
        point_zone = "blind_side" if point_x >= 128 else "delivery_zone" if point_x >= 84 and point_y >= 64 else "approach"
        points.append({
            "tMs": point_index * 500,
            "xPermille": point_x * 1000 // 160,
            "yPermille": point_y * 1000 // 120,
            "zone": point_zone,
        })
    return {
        "status": "ok",
        "schemaVersion": "fpga-motion/1",
        "deviceId": "ARTY-A7-100T-EMULATOR",
        "source": "arty-a7-100t",
        "frameId": frame_id,
        "capturedMs": frame_id * 500,
        "backgroundReady": True,
        "completedFrames": frame_id,
        "invalidPackets": 0,
        "motionPixelCount": 260,
        "minMotionPixels": 80,
        "bbox": {"minX": max(0, x - 8), "maxX": min(159, x + 8), "minY": max(0, y - 18), "maxY": min(119, y + 18)},
        "track": {
            "id": "motion-001",
            "active": True,
            "dwellMs": frame_id * 500,
            "quickReturnSeconds": None,
            "zone": zone,
            "centroid": {"x": x, "y": y},
            "points": points,
        },
        "assessment": {
            "decision": decision,
            "summary": "움직임 중심점이 사각지대 구역에 있습니다." if decision == "alert" else "움직이는 사람 후보의 동선을 추적하고 있습니다.",
            "criminalIntentDetermined": False,
        },
        "limitation": "motion_candidate_not_person_classification",
    }


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        body = json.dumps(build_status(), ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description="RISK-ZERO Arty A7 HTTP status emulator")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8081)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"FPGA status emulator: http://{args.host}:{args.port}/trajectory")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
