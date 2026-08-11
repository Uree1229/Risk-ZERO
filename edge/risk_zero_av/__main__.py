import argparse
import json
from pathlib import Path
import sys

from .actuator import ActuationGate, MockActuator
from .capture_pair import CapturePairValidationError, load_capture_pair
from .demo import run_demo
from .models import DemoAVSyncModelAdapter


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="RISK-ZERO AV verification demo")
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument(
        "--scenario",
        choices=("live-pass", "audio-replay", "sync-mismatch", "challenge-mismatch", "multiple-faces", "low-quality"),
    )
    actions.add_argument("--check-capture", type=Path, metavar="MANIFEST_JSON")
    actions.add_argument("--demo-sync", type=Path, metavar="MANIFEST_JSON")
    args = parser.parse_args()

    if args.check_capture or args.demo_sync:
        manifest_path = args.check_capture or args.demo_sync
        try:
            pair = load_capture_pair(manifest_path)
        except CapturePairValidationError as error:
            print(json.dumps({"valid": False, "error": {"code": error.code, "message": str(error)}}, ensure_ascii=False, indent=2))
            sys.exit(2)

        output = {"capture": pair.to_dict()}
        if args.demo_sync:
            offset_ms, confidence = DemoAVSyncModelAdapter().analyze(pair.session)
            output["avSync"] = {
                "mode": "demo",
                "modelVersion": DemoAVSyncModelAdapter.model_version,
                "offsetMs": offset_ms,
                "confidence": confidence,
                "verificationDecision": None,
                "warning": "미디어를 분석하지 않은 연결 시험용 값입니다.",
            }
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    request, attempt = run_demo(args.scenario or "live-pass")
    gate = ActuationGate()
    decision = gate.decide(request, attempt, heartbeat_ok=True, now=attempt.evaluated_at)
    executed = MockActuator().execute(decision, now=attempt.evaluated_at)
    print(json.dumps({"attempt": attempt.to_dict(), "actuation": executed.to_dict()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
