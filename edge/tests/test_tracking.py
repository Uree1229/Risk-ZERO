import unittest

from edge.risk_zero_trajectory import CentroidTracker, Detection, classify_zone


class CentroidTrackerTests(unittest.TestCase):
    def test_zone_classifier_matches_monitor_map(self) -> None:
        self.assertEqual(classify_zone(0.12, 0.85), "corridor_entry")
        self.assertEqual(classify_zone(0.55, 0.40), "door_zone")
        self.assertEqual(classify_zone(0.60, 0.64), "delivery_zone")
        self.assertEqual(classify_zone(0.90, 0.55), "blind_side")

    def test_nearby_detection_keeps_same_person_id(self) -> None:
        tracker = CentroidTracker(max_distance=0.25)
        first = tracker.update([Detection(0.05, 0.75, 0.15, 0.95, 0.9)], t_ms=0)
        second = tracker.update([Detection(0.16, 0.65, 0.26, 0.85, 0.8)], t_ms=1000)
        self.assertEqual(first[0].id, "person-01")
        self.assertEqual(second[0].id, "person-01")
        self.assertEqual(len(second[0].points), 2)
        self.assertAlmostEqual(second[0].confidence, 0.85)

    def test_far_detection_creates_new_person_id(self) -> None:
        tracker = CentroidTracker(max_distance=0.10)
        tracker.update([Detection(0.05, 0.75, 0.15, 0.95, 0.9)], t_ms=0)
        active = tracker.update([Detection(0.75, 0.20, 0.90, 0.60, 0.8)], t_ms=1000)
        self.assertEqual({track.id for track in active}, {"person-01", "person-02"})

    def test_track_finishes_after_missing_frame_limit(self) -> None:
        tracker = CentroidTracker(max_missed_frames=1)
        tracker.update([Detection(0.05, 0.75, 0.15, 0.95, 0.9)], t_ms=0)
        tracker.update([], t_ms=1000)
        tracker.update([], t_ms=2000)
        self.assertEqual(tracker.active_tracks, ())
        finished = tracker.consume_finished_tracks()
        self.assertEqual(finished[0].id, "person-01")
        self.assertEqual(tracker.consume_finished_tracks(), ())

    def test_invalid_detection_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            Detection(-0.1, 0.2, 0.4, 0.8, 0.9)


if __name__ == "__main__":
    unittest.main()

