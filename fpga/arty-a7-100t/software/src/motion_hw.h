#pragma once

#include <stdint.h>


typedef struct {
    uint8_t background_ready;
    uint32_t motion_count;
    uint32_t sum_x;
    uint32_t sum_y;
    uint8_t min_x;
    uint8_t max_x;
    uint8_t min_y;
    uint8_t max_y;
} motion_hw_result_t;

void motion_hw_initialize(uint8_t threshold);
int motion_hw_process_frame(const uint8_t* frame, uint32_t frame_bytes, motion_hw_result_t* result);
