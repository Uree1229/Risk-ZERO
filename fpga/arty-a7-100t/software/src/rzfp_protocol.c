#include "rzfp_protocol.h"

#include <string.h>


static uint16_t read_u16_be(const uint8_t* value) {
    return ((uint16_t)value[0] << 8) | value[1];
}

static uint32_t read_u32_be(const uint8_t* value) {
    return ((uint32_t)value[0] << 24) |
        ((uint32_t)value[1] << 16) |
        ((uint32_t)value[2] << 8) |
        value[3];
}

void rzfp_init(rzfp_reassembler_t* state) {
    memset(state, 0, sizeof(*state));
}

rzfp_result_t rzfp_accept(rzfp_reassembler_t* state, const uint8_t* packet, uint16_t length) {
    uint32_t magic;
    uint8_t version;
    uint8_t format;
    uint16_t header_bytes;
    uint32_t frame_id;
    uint32_t captured_ms;
    uint16_t width;
    uint16_t height;
    uint16_t chunk_index;
    uint16_t chunk_count;
    uint32_t payload_offset;
    uint16_t payload_bytes;
    uint32_t frame_bytes;
    uint16_t expected_chunk_count;
    uint16_t expected_payload_bytes;
    uint32_t chunk_bit;
    uint32_t complete_mask;

    if (state == 0 || packet == 0 || length < RZFP_HEADER_BYTES) return RZFP_INVALID;
    magic = read_u32_be(packet + 0);
    version = packet[4];
    format = packet[5];
    header_bytes = read_u16_be(packet + 6);
    frame_id = read_u32_be(packet + 8);
    captured_ms = read_u32_be(packet + 12);
    width = read_u16_be(packet + 16);
    height = read_u16_be(packet + 18);
    chunk_index = read_u16_be(packet + 20);
    chunk_count = read_u16_be(packet + 22);
    payload_offset = read_u32_be(packet + 24);
    payload_bytes = read_u16_be(packet + 28);
    frame_bytes = (uint32_t)width * height;

    if (magic != RZFP_MAGIC || version != RZFP_VERSION || format != RZFP_FORMAT_GRAY8) {
        return RZFP_INVALID;
    }
    if (header_bytes != RZFP_HEADER_BYTES || length != header_bytes + payload_bytes) {
        return RZFP_INVALID;
    }
    if (width != RISK_ZERO_FRAME_WIDTH || height != RISK_ZERO_FRAME_HEIGHT) {
        return RZFP_INVALID;
    }
    expected_chunk_count = (uint16_t)((frame_bytes + RZFP_PAYLOAD_BYTES - 1u) / RZFP_PAYLOAD_BYTES);
    if (chunk_count == 0 || chunk_count > RZFP_MAX_CHUNKS || chunk_index >= chunk_count) {
        return RZFP_INVALID;
    }
    expected_payload_bytes = chunk_index + 1u == chunk_count
        ? (uint16_t)(frame_bytes - (uint32_t)chunk_index * RZFP_PAYLOAD_BYTES)
        : RZFP_PAYLOAD_BYTES;
    if (
        chunk_count != expected_chunk_count ||
        payload_offset != (uint32_t)chunk_index * RZFP_PAYLOAD_BYTES ||
        payload_bytes != expected_payload_bytes ||
        payload_offset + payload_bytes > frame_bytes) {
        return RZFP_INVALID;
    }

    if (state->frame_id != frame_id) {
        state->frame_id = frame_id;
        state->captured_ms = captured_ms;
        state->width = width;
        state->height = height;
        state->chunk_count = chunk_count;
        state->received_mask = 0;
        state->received_bytes = 0;
    } else if (
        state->captured_ms != captured_ms ||
        state->width != width ||
        state->height != height ||
        state->chunk_count != chunk_count) {
        return RZFP_INVALID;
    }

    chunk_bit = 1u << chunk_index;
    if ((state->received_mask & chunk_bit) == 0) {
        memcpy(state->frame + payload_offset, packet + header_bytes, payload_bytes);
        state->received_mask |= chunk_bit;
        state->received_bytes += payload_bytes;
    }

    complete_mask = chunk_count == 32 ? 0xffffffffu : ((1u << chunk_count) - 1u);
    if (state->received_mask == complete_mask && state->received_bytes == frame_bytes) {
        return RZFP_FRAME_COMPLETE;
    }
    return RZFP_ACCEPTED;
}
