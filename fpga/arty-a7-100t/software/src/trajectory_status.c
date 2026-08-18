#include "trajectory_status.h"

#include <stdio.h>
#include <string.h>

#include "risk_zero_config.h"


static const char* classify_zone(uint16_t x_permille, uint16_t y_permille) {
    if (x_permille >= 800 && y_permille >= 270 && y_permille <= 740) return "blind_side";
    if (x_permille >= 520 && x_permille <= 730 && y_permille >= 530 && y_permille <= 730) {
        return "delivery_zone";
    }
    if (x_permille >= 400 && x_permille <= 670 && y_permille >= 250 && y_permille <= 560) {
        return "door_zone";
    }
    if (x_permille <= 260 && y_permille >= 700) return "corridor_entry";
    return "approach";
}

void trajectory_status_init(trajectory_status_t* status) {
    memset(status, 0, sizeof(*status));
    status->zone = "none";
}

void trajectory_status_update(
    trajectory_status_t* status,
    uint32_t frame_id,
    uint32_t captured_ms,
    const motion_hw_result_t* motion) {
    uint16_t x_permille;
    uint16_t y_permille;
    trajectory_point_t* point;

    status->frame_id = frame_id;
    status->captured_ms = captured_ms;
    status->completed_frames++;
    status->background_ready = motion->background_ready;
    status->motion_count = motion->motion_count;
    status->min_x = motion->min_x;
    status->max_x = motion->max_x;
    status->min_y = motion->min_y;
    status->max_y = motion->max_y;

    if (!motion->background_ready || motion->motion_count < RISK_ZERO_MIN_MOTION_PIXELS) {
        if (status->active && ++status->missing_frames >= RISK_ZERO_TRACK_MISSING_FRAMES) {
            status->active = 0;
            status->last_track_ended_ms = captured_ms;
        }
        return;
    }

    status->missing_frames = 0;
    status->centroid_x = motion->sum_x / motion->motion_count;
    status->centroid_y = motion->sum_y / motion->motion_count;
    x_permille = (uint32_t)status->centroid_x * 1000u / RISK_ZERO_FRAME_WIDTH;
    y_permille = (uint32_t)status->centroid_y * 1000u / RISK_ZERO_FRAME_HEIGHT;
    status->zone = classify_zone(x_permille, y_permille);
    if (!status->active) {
        status->active = 1;
        status->track_number++;
        status->track_started_ms = captured_ms;
        status->point_count = 0;
        if (status->last_track_ended_ms != 0 && captured_ms - status->last_track_ended_ms <= 60000u) {
            uint32_t seconds = (captured_ms - status->last_track_ended_ms) / 1000u;
            status->quick_return_seconds = seconds == 0 ? 1 : seconds;
        } else {
            status->quick_return_seconds = 0;
        }
    }
    status->last_seen_ms = captured_ms;

    if (status->point_count == TRAJECTORY_MAX_POINTS) {
        memmove(status->points, status->points + 1, sizeof(status->points[0]) * (TRAJECTORY_MAX_POINTS - 1));
        status->point_count--;
    }
    point = &status->points[status->point_count++];
    point->t_ms = captured_ms - status->track_started_ms;
    point->x_permille = x_permille;
    point->y_permille = y_permille;
    point->zone = status->zone;
}

size_t trajectory_status_json(const trajectory_status_t* status, char* output, size_t capacity) {
    size_t used;
    uint8_t index;
    const char* decision;
    const char* summary;
    char quick_return[16];
    uint32_t dwell_ms = status->track_number != 0
        ? status->last_seen_ms - status->track_started_ms
        : 0;

    if (!status->background_ready) {
        decision = "inconclusive";
        summary = "배경 프레임을 준비하고 있습니다.";
    } else if (status->quick_return_seconds != 0) {
        decision = "alert";
        summary = "이전 움직임 종료 후 60초 안에 다시 접근했습니다.";
    } else if (strcmp(status->zone, "blind_side") == 0) {
        decision = "alert";
        summary = "움직임 중심점이 사각지대 구역에 있습니다.";
    } else if (dwell_ms >= 45000u) {
        decision = "watch";
        summary = "현관 앞 움직임이 45초 이상 이어졌습니다.";
    } else if (status->active) {
        decision = "watch";
        summary = "움직이는 사람 후보의 동선을 추적하고 있습니다.";
    } else {
        decision = "normal";
        summary = "현재 기준 이상의 움직임이 없습니다.";
    }

    if (status->quick_return_seconds == 0) {
        strcpy(quick_return, "null");
    } else {
        snprintf(quick_return, sizeof(quick_return), "%u", status->quick_return_seconds);
    }

    used = snprintf(
        output,
        capacity,
        "{\"status\":\"ok\",\"schemaVersion\":\"fpga-motion/1\","
        "\"deviceId\":\"%s\",\"source\":\"arty-a7-100t\","
        "\"frameId\":%lu,\"capturedMs\":%lu,\"backgroundReady\":%s,"
        "\"completedFrames\":%lu,\"invalidPackets\":%lu,"
        "\"motionPixelCount\":%lu,\"minMotionPixels\":%u,"
        "\"bbox\":{\"minX\":%u,\"maxX\":%u,\"minY\":%u,\"maxY\":%u},"
        "\"track\":{\"id\":\"motion-%03lu\",\"active\":%s,\"dwellMs\":%lu,\"quickReturnSeconds\":%s,"
        "\"zone\":\"%s\",\"centroid\":{\"x\":%u,\"y\":%u},\"points\":[",
        RISK_ZERO_DEVICE_ID,
        (unsigned long)status->frame_id,
        (unsigned long)status->captured_ms,
        status->background_ready ? "true" : "false",
        (unsigned long)status->completed_frames,
        (unsigned long)status->invalid_packets,
        (unsigned long)status->motion_count,
        RISK_ZERO_MIN_MOTION_PIXELS,
        status->min_x,
        status->max_x,
        status->min_y,
        status->max_y,
        (unsigned long)status->track_number,
        status->active ? "true" : "false",
        (unsigned long)dwell_ms,
        quick_return,
        status->zone,
        status->centroid_x,
        status->centroid_y);
    if (used >= capacity) return capacity;

    for (index = 0; index < status->point_count; ++index) {
        const trajectory_point_t* point = &status->points[index];
        int written = snprintf(
            output + used,
            capacity - used,
            "%s{\"tMs\":%lu,\"xPermille\":%u,\"yPermille\":%u,\"zone\":\"%s\"}",
            index == 0 ? "" : ",",
            (unsigned long)point->t_ms,
            point->x_permille,
            point->y_permille,
            point->zone);
        if (written < 0 || (size_t)written >= capacity - used) return capacity;
        used += written;
    }

    {
        int written = snprintf(
            output + used,
            capacity - used,
            "]},\"assessment\":{\"decision\":\"%s\",\"summary\":\"%s\","
            "\"criminalIntentDetermined\":false},"
            "\"limitation\":\"motion_candidate_not_person_classification\"}",
            decision,
            summary);
        if (written < 0 || (size_t)written >= capacity - used) return capacity;
        used += written;
    }
    return used;
}
