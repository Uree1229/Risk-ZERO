#include "motion_hw.h"

#include "risk_zero_config.h"
#include "xil_io.h"


#define REG_CONTROL 0x00u
#define REG_PIXEL   0x04u
#define REG_CONFIG  0x08u
#define REG_STATUS  0x0cu
#define REG_COUNT   0x10u
#define REG_SUM_X   0x14u
#define REG_SUM_Y   0x18u
#define REG_BBOX    0x1cu
#define REG_VERSION 0x20u

#define STATUS_RESULT_PENDING 0x01u
#define STATUS_BACKGROUND_READY 0x02u
#define CONTROL_FRAME_START 0x01u
#define CONTROL_BACKGROUND_RESET 0x02u
#define CONTROL_CLEAR_RESULT 0x04u

static void write_register(uint32_t offset, uint32_t value) {
    Xil_Out32(RISK_ZERO_MOTION_BASEADDR + offset, value);
}

static uint32_t read_register(uint32_t offset) {
    return Xil_In32(RISK_ZERO_MOTION_BASEADDR + offset);
}

void motion_hw_initialize(uint8_t threshold) {
    write_register(REG_CONFIG, threshold);
    write_register(REG_CONTROL, CONTROL_BACKGROUND_RESET | CONTROL_CLEAR_RESULT);
}

int motion_hw_process_frame(const uint8_t* frame, uint32_t frame_bytes, motion_hw_result_t* result) {
    uint32_t index;
    uint32_t timeout;
    uint32_t status;
    uint32_t bbox;

    if (frame == 0 || result == 0 || frame_bytes != RISK_ZERO_FRAME_BYTES) return -1;
    write_register(REG_CONTROL, CONTROL_CLEAR_RESULT | CONTROL_FRAME_START);
    for (index = 0; index < frame_bytes; ++index) {
        write_register(REG_PIXEL, frame[index]);
    }

    for (timeout = 0; timeout < 1000000u; ++timeout) {
        status = read_register(REG_STATUS);
        if ((status & STATUS_RESULT_PENDING) != 0) break;
    }
    if (timeout == 1000000u) return -2;

    result->background_ready = (status & STATUS_BACKGROUND_READY) != 0;
    result->motion_count = read_register(REG_COUNT);
    result->sum_x = read_register(REG_SUM_X);
    result->sum_y = read_register(REG_SUM_Y);
    bbox = read_register(REG_BBOX);
    result->min_x = bbox & 0xffu;
    result->max_x = (bbox >> 8) & 0xffu;
    result->min_y = (bbox >> 16) & 0xffu;
    result->max_y = (bbox >> 24) & 0xffu;
    write_register(REG_CONTROL, CONTROL_CLEAR_RESULT);
    return 0;
}
