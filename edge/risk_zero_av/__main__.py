import argparse
import json

from .actuator import ActuationGate, MockActuator
from .demo import run_demo


def main() -> None:
    parser = argparse.ArgumentParser(description="RISK-ZERO AV verification demo")
    parser.add_argument(
        "--scenario",
        default="live-pass",
        choices=("live-pass", "audio-replay", "sync-mismatch", "challenge-mismatch", "multiple-faces", "low-quality"),
    )
    args = parser.parse_args()
    request, attempt = run_demo(args.scenario)
    gate = ActuationGate()
    decision = gate.decide(request, attempt, heartbeat_ok=True, now=attempt.evaluated_at)
    executed = MockActuator().execute(decision, now=attempt.evaluated_at)
    print(json.dumps({"attempt": attempt.to_dict(), "actuation": executed.to_dict()}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
