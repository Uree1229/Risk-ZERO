from pathlib import Path
import sys
import unittest


TOOLS = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS))

from motion_reference import MotionReference  # noqa: E402
from protocol import FramePacket, FrameReassembler, decode_packet, encode_packet  # noqa: E402


class ProtocolTests(unittest.TestCase):
    def test_big_endian_packet_round_trip(self) -> None:
        payload = bytes(index % 256 for index in range(1200))
        packet = FramePacket(17, 2000, 160, 120, 0, 16, 0, payload)
        encoded = encode_packet(packet)
        self.assertEqual(encoded[:4], b"RZFP")
        self.assertEqual(decode_packet(encoded), packet)

    def test_reassembles_out_of_order_chunks(self) -> None:
        reassembler = FrameReassembler()
        frame = bytes(index % 256 for index in range(160 * 120))
        packets = [
            encode_packet(FramePacket(3, 900, 160, 120, chunk, 16, chunk * 1200, frame[chunk * 1200:(chunk + 1) * 1200]))
            for chunk in range(16)
        ]
        result = None
        for packet in reversed(packets):
            result = reassembler.add(packet)
        self.assertEqual(result, (3, 900, 160, 120, frame))

    def test_rejects_truncated_packet(self) -> None:
        with self.assertRaises(ValueError):
            decode_packet(b"RZFP")

    def test_rejects_overlapping_chunk_offset(self) -> None:
        payload = bytes(index % 256 for index in range(1200))
        packet = FramePacket(17, 2000, 160, 120, 1, 16, 0, payload)
        with self.assertRaises(ValueError):
            decode_packet(encode_packet(packet))


class MotionReferenceTests(unittest.TestCase):
    def test_matches_rtl_test_vector(self) -> None:
        model = MotionReference(8, 6, threshold=20)
        background = bytes([10] * 48)
        self.assertEqual(model.process(background).count, 0)
        frame = bytearray(background)
        for x, y in ((2, 1), (3, 1), (2, 2), (3, 2)):
            frame[y * 8 + x] = 100
        result = model.process(bytes(frame))
        self.assertEqual(result.count, 4)
        self.assertEqual((result.sum_x, result.sum_y), (10, 6))
        self.assertEqual((result.min_x, result.max_x, result.min_y, result.max_y), (2, 3, 1, 2))
        self.assertEqual(model.process(bytes(frame)).count, 4)

    def test_rejects_wrong_frame_size(self) -> None:
        with self.assertRaises(ValueError):
            MotionReference(4, 4).process(b"short")


if __name__ == "__main__":
    unittest.main()
