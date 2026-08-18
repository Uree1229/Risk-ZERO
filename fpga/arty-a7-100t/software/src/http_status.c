#include "http_status.h"

#include <stdio.h>
#include <string.h>

#include "lwip/tcp.h"
#include "risk_zero_config.h"


static trajectory_status_t* current_status;
static char response_body[4096];
static char response[4608];

static err_t http_receive(void* argument, struct tcp_pcb* pcb, struct pbuf* request, err_t error) {
    size_t body_bytes;
    int response_bytes;
    (void)argument;
    (void)error;

    if (request == 0) {
        tcp_close(pcb);
        return ERR_OK;
    }
    tcp_recved(pcb, request->tot_len);
    pbuf_free(request);

    body_bytes = trajectory_status_json(current_status, response_body, sizeof(response_body));
    if (body_bytes >= sizeof(response_body)) {
        static const char overflow[] = "{\"status\":\"error\",\"code\":\"JSON_OVERFLOW\"}";
        memcpy(response_body, overflow, sizeof(overflow));
        body_bytes = sizeof(overflow) - 1;
    }
    response_bytes = snprintf(
        response,
        sizeof(response),
        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
        "Access-Control-Allow-Origin: *\r\nCache-Control: no-store\r\n"
        "Content-Length: %u\r\nConnection: close\r\n\r\n%s",
        (unsigned)body_bytes,
        response_body);
    if (response_bytes > 0 && response_bytes < (int)sizeof(response)) {
        tcp_write(pcb, response, response_bytes, TCP_WRITE_FLAG_COPY);
        tcp_output(pcb);
    }
    tcp_close(pcb);
    return ERR_OK;
}

static err_t http_accept(void* argument, struct tcp_pcb* client, err_t error) {
    (void)argument;
    (void)error;
    tcp_recv(client, http_receive);
    return ERR_OK;
}

int http_status_start(trajectory_status_t* status) {
    struct tcp_pcb* server;
    current_status = status;
    server = tcp_new_ip_type(IPADDR_TYPE_ANY);
    if (server == 0) return -1;
    if (tcp_bind(server, IP_ANY_TYPE, RISK_ZERO_HTTP_PORT) != ERR_OK) {
        tcp_close(server);
        return -2;
    }
    server = tcp_listen(server);
    if (server == 0) return -3;
    tcp_accept(server, http_accept);
    return 0;
}
