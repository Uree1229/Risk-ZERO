from dataclasses import replace
from datetime import datetime, timezone
import unittest

from edge.risk_zero_trajectory import TrajectoryDecision, TrajectoryPolicy, build_demo_observation
from edge.risk_zero_trajectory.contracts import TrajectoryPoint


class TrajectoryPolicyTests(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 18, 4, 0, tzinfo=timezone.utc)
        self.policy = TrajectoryPolicy()

    def evaluate(self, scenario: str):
        observation = build_demo_observation(scenario, now=self.now)
        return observation, self.policy.evaluate(observation, now=self.now)

    def test_normal_delivery_is_normal(self) -> None:
        _, assessment = self.evaluate("normal-delivery")
        self.assertEqual(assessment.decision, TrajectoryDecision.NORMAL)
        self.assertEqual(assessment.reason_codes, ("normal_delivery_exit",))

    def test_delivery_followed_by_blind_zone_is_alert(self) -> None:
        _, assessment = self.evaluate("hidden-after-delivery")
        self.assertEqual(assessment.decision, TrajectoryDecision.ALERT)
        self.assertIn("blind_zone_after_delivery", assessment.reason_codes)

    def test_quick_return_is_alert(self) -> None:
        _, assessment = self.evaluate("quick-return")
        self.assertEqual(assessment.decision, TrajectoryDecision.ALERT)
        self.assertIn("quick_return", assessment.reason_codes)

    def test_person_count_mismatch_is_alert(self) -> None:
        _, assessment = self.evaluate("multiple-persons")
        self.assertEqual(assessment.decision, TrajectoryDecision.ALERT)
        self.assertIn("person_count_mismatch", assessment.reason_codes)

    def test_long_dwell_is_watch(self) -> None:
        _, assessment = self.evaluate("long-dwell")
        self.assertEqual(assessment.decision, TrajectoryDecision.WATCH)
        self.assertIn("long_dwell", assessment.reason_codes)

    def test_low_tracking_quality_is_inconclusive(self) -> None:
        _, assessment = self.evaluate("tracking-lost")
        self.assertEqual(assessment.decision, TrajectoryDecision.INCONCLUSIVE)
        self.assertEqual(assessment.reason_codes, ("tracking_confidence_low",))

    def test_out_of_bounds_point_is_inconclusive(self) -> None:
        observation = build_demo_observation("normal-delivery", now=self.now)
        invalid_track = replace(observation.tracks[0], points=(TrajectoryPoint(0, 1.2, 0.5, "outside"), TrajectoryPoint(1, 0.5, 0.5, "door_zone")))
        invalid = replace(observation, tracks=(invalid_track,))
        assessment = self.policy.evaluate(invalid, now=self.now)
        self.assertEqual(assessment.decision, TrajectoryDecision.INCONCLUSIVE)
        self.assertEqual(assessment.reason_codes, ("trajectory_out_of_bounds",))

    def test_assessment_never_claims_criminal_intent(self) -> None:
        _, assessment = self.evaluate("hidden-after-delivery")
        self.assertFalse(assessment.to_dict()["criminalIntentDetermined"])

    def test_observation_json_uses_web_contract_field_names(self) -> None:
        observation = build_demo_observation("normal-delivery", now=self.now)
        point = observation.to_dict()["tracks"][0]["points"][0]
        self.assertEqual(point["tMs"], 0)
        self.assertNotIn("t_ms", point)


if __name__ == "__main__":
    unittest.main()
