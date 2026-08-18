#include "risk_zero_app.h"

#include "http_status.h"
#include "lwip/pbuf.h"
#include "lwip/udp.h"
#include "motion_hw.h"
#include "risk_zero_config.h"
#include "rzfp_protocol.h"
#include "trajectory_status.h"
#include "xil_printf.h"


static rzfp_reassembler_t reassembler;
static trajectory_status_t trajectory;
static uint8_t packet_buffer[RZFP_MAX_PACKET_BYTES];

static void udp_receive(
    void* argument,
    struct udp_pcb* pcb,
    struct pbuf* packet,
    const ip_addr_t* address,
    u16_t port) {
    rzfp_result_t accepted;
    motion_hw_result_t motion;
    (void)argument;
    (void)pcb;
    (void)address;
    (void)port;

    if (packet->tot_len > sizeof(packet_buffer)) {
        trajectory.invalid_packets++;
        pbuf_free(packet);
        return;
    }
    pbuf_copy_partial(packet, packet_buffer, packet->tot_len, 0);
    accepted = rzfp_accept(&reassembler, packet_buffer, packet->tot_len);
    pbuf_free(packet);
    if (accepted == RZFP_INVALID) {
        trajectory.invalid_packets++;
        return;
    }
    if (accepted != RZFP_FRAME_COMPLETE) return;

    if (motion_hw_process_frame(reassembler.frame, RISK_ZERO_FRAME_BYTES, &motion) != 0) {
        xil_printf("motion accelerator timeout\r\n");
        return;
    }
    trajectory_status_update(&trajectory, reassembler.frame_id, reassembler.captured_ms, &motion);
}

int risk_zero_app_init(void) {
    struct udp_pcb* receiver;
    rzfp_init(&reassembler);
    trajectory_status_init(&trajectory);
    motion_hw_initialize(RISK_ZERO_MOTION_THRESHOLD);

    receiver = udp_new_ip_type(IPADDR_TYPE_ANY);
    if (receiver == 0) return -1;
    if (udp_bind(receiver, IP_ANY_TYPE, RISK_ZERO_UDP_PORT) != ERR_OK) {
        udp_remove(receiver);
        return -2;
    }
    udp_recv(receiver, udp_receive, 0);
    if (http_status_start(&trajectory) != 0) return -3;
    xil_printf("RISK-ZERO UDP %d / HTTP %d ready\r\n", RISK_ZERO_UDP_PORT, RISK_ZERO_HTTP_PORT);
    return 0;
}
