#pragma once

#include <stdint.h>

#include "risk_zero_config.h"

#define RZFP_MAGIC 0x525A4650u
#define RZFP_VERSION 1u
#define RZFP_FORMAT_GRAY8 1u
#define RZFP_HEADER_BYTES 32u
#define RZFP_PAYLOAD_BYTES 1200u
#define RZFP_MAX_CHUNKS 32u
#define RZFP_MAX_PACKET_BYTES 1472u

typedef enum {
    RZFP_ACCEPTED = 0,
    RZFP_FRAME_COMPLETE = 1,
    RZFP_INVALID = -1,
} rzfp_result_t;

typedef struct {
    uint32_t frame_id;
    uint32_t captured_ms;
    uint16_t width;
    uint16_t height;
    uint16_t chunk_count;
    uint32_t received_mask;
    uint32_t received_bytes;
    uint8_t frame[RISK_ZERO_FRAME_BYTES];
} rzfp_reassembler_t;

void rzfp_init(rzfp_reassembler_t* state);
rzfp_result_t rzfp_accept(rzfp_reassembler_t* state, const uint8_t* packet, uint16_t length);
