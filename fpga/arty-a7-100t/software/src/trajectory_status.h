#pragma once

#include <stddef.h>
#include <stdint.h>

#include "motion_hw.h"

#define TRAJECTORY_MAX_POINTS 32

typedef struct {
    uint32_t t_ms;
    uint16_t x_permille;
    uint16_t y_permille;
    const char* zone;
} trajectory_point_t;

typedef struct {
    uint32_t frame_id;
    uint32_t captured_ms;
    uint32_t completed_frames;
    uint32_t invalid_packets;
    uint8_t background_ready;
    uint8_t active;
    uint8_t missing_frames;
    uint32_t track_number;
    uint32_t track_started_ms;
    uint32_t last_seen_ms;
    uint32_t last_track_ended_ms;
    uint16_t quick_return_seconds;
    uint32_t motion_count;
    uint16_t centroid_x;
    uint16_t centroid_y;
    uint8_t min_x;
    uint8_t max_x;
    uint8_t min_y;
    uint8_t max_y;
    const char* zone;
    trajectory_point_t points[TRAJECTORY_MAX_POINTS];
    uint8_t point_count;
} trajectory_status_t;

void trajectory_status_init(trajectory_status_t* status);
void trajectory_status_update(
    trajectory_status_t* status,
    uint32_t frame_id,
    uint32_t captured_ms,
    const motion_hw_result_t* motion);
size_t trajectory_status_json(const trajectory_status_t* status, char* output, size_t capacity);
