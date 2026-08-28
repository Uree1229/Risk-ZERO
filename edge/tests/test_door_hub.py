from datetime import datetime, timedelta, timezone
import unittest

from edge.risk_zero_door_hub import (
    DoorHubSession,
    SafetyDecision,
    SafetyStatus,
    VisionResult,
    build_demo_event,
)


class DoorHubContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 28, 10, 42, tzinfo=timezone.utc)

    def test_demo_payload_matches_web_api_contract(self) -> None:
        payload = build_demo_event(now=self.now).to_dict()
        self.assertEqual(payload["schemaVersion"], "door-hub-event/1")
        self.assertEqual(payload["session"]["eventId"], 1042)
        self.assertEqual(payload["vision"]["primaryZone"], 6)
        self.assertEqual(payload["safety"]["outputTarget"], "led")

    def test_stale_fpga_result_is_rejected(self) -> None:
        session = DoorHubSession(next_event_id=7)
        session.start(self.now)
        with self.assertRaisesRegex(ValueError, "stale"):
            session.complete(
                event_id=6,
                household_id="home",
                device_id="hub",
                generated_at=self.now,
                ended_at=None,
                vision=VisionResult("capturing", True, 1, 5, 16, 1000, 0.0, False, False),
                safety=SafetyStatus(True, False, SafetyDecision.NONE, None, False, True, False, False, False),
            )

    def test_output_cannot_turn_on_without_safety_allow(self) -> None:
        status = SafetyStatus(True, False, SafetyDecision.BLOCK, "policy", False, True, False, False, True)
        with self.assertRaisesRegex(ValueError, "ALLOW"):
            status.validate()

    def test_event_id_increments_after_completed_session(self) -> None:
        session = DoorHubSession(next_event_id=10)
        first = session.start(self.now)
        session.complete(
            event_id=first,
            household_id="home",
            device_id="hub",
            generated_at=self.now + timedelta(seconds=2),
            ended_at=self.now + timedelta(seconds=1),
            vision=VisionResult("ready", False, 0, 5, 16, 1000, 0.0, False, True),
            safety=SafetyStatus(True, False, SafetyDecision.NONE, None, False, True, False, False, False),
        )
        self.assertEqual(session.start(self.now + timedelta(seconds=3)), 11)


if __name__ == "__main__":
    unittest.main()
