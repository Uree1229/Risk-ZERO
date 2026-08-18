from __future__ import annotations

from dataclasses import dataclass
import struct


MAGIC = 0x525A4650
VERSION = 1
FORMAT_GRAY8 = 1
HEADER = struct.Struct(">IBBHIIHHHHIHH")
HEADER_BYTES = HEADER.size
FRAME_WIDTH = 160
FRAME_HEIGHT = 120
MAX_FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT
PAYLOAD_BYTES = 1200


@dataclass(frozen=True)
class FramePacket:
    frame_id: int
    captured_ms: int
    width: int
    height: int
    chunk_index: int
    chunk_count: int
    payload_offset: int
    payload: bytes


def encode_packet(packet: FramePacket) -> bytes:
    return HEADER.pack(
        MAGIC,
        VERSION,
        FORMAT_GRAY8,
        HEADER_BYTES,
        packet.frame_id,
        packet.captured_ms,
        packet.width,
        packet.height,
        packet.chunk_index,
        packet.chunk_count,
        packet.payload_offset,
        len(packet.payload),
        0,
    ) + packet.payload


def decode_packet(data: bytes) -> FramePacket:
    if len(data) < HEADER_BYTES:
        raise ValueError("packet is shorter than the RZFP header")
    (
        magic,
        version,
        pixel_format,
        header_bytes,
        frame_id,
        captured_ms,
        width,
        height,
        chunk_index,
        chunk_count,
        payload_offset,
        payload_bytes,
        _reserved,
    ) = HEADER.unpack_from(data)
    if magic != MAGIC or version != VERSION or pixel_format != FORMAT_GRAY8:
        raise ValueError("unsupported RZFP packet")
    if header_bytes != HEADER_BYTES or len(data) != header_bytes + payload_bytes:
        raise ValueError("RZFP packet length mismatch")
    if width != FRAME_WIDTH or height != FRAME_HEIGHT:
        raise ValueError("unsupported frame size")
    expected_chunk_count = (width * height + PAYLOAD_BYTES - 1) // PAYLOAD_BYTES
    if chunk_count != expected_chunk_count or chunk_index >= chunk_count:
        raise ValueError("invalid chunk index")
    expected_payload_bytes = (
        width * height - chunk_index * PAYLOAD_BYTES
        if chunk_index + 1 == chunk_count
        else PAYLOAD_BYTES
    )
    if (
        payload_offset != chunk_index * PAYLOAD_BYTES
        or payload_bytes != expected_payload_bytes
        or payload_offset + payload_bytes > width * height
    ):
        raise ValueError("payload exceeds frame buffer")
    return FramePacket(
        frame_id=frame_id,
        captured_ms=captured_ms,
        width=width,
        height=height,
        chunk_index=chunk_index,
        chunk_count=chunk_count,
        payload_offset=payload_offset,
        payload=data[header_bytes:],
    )


class FrameReassembler:
    def __init__(self) -> None:
        self._frame_id: int | None = None
        self._captured_ms = 0
        self._width = 0
        self._height = 0
        self._chunk_count = 0
        self._received_mask = 0
        self._buffer = bytearray(MAX_FRAME_BYTES)

    def add(self, data: bytes) -> tuple[int, int, int, int, bytes] | None:
        packet = decode_packet(data)
        if self._frame_id != packet.frame_id:
            self._frame_id = packet.frame_id
            self._captured_ms = packet.captured_ms
            self._width = packet.width
            self._height = packet.height
            self._chunk_count = packet.chunk_count
            self._received_mask = 0
        elif (
            packet.width != self._width
            or packet.height != self._height
            or packet.chunk_count != self._chunk_count
        ):
            raise ValueError("frame metadata changed between chunks")

        start = packet.payload_offset
        self._buffer[start:start + len(packet.payload)] = packet.payload
        self._received_mask |= 1 << packet.chunk_index
        complete_mask = (1 << self._chunk_count) - 1
        if self._received_mask != complete_mask:
            return None
        frame_bytes = self._width * self._height
        return (
            packet.frame_id,
            self._captured_ms,
            self._width,
            self._height,
            bytes(self._buffer[:frame_bytes]),
        )
