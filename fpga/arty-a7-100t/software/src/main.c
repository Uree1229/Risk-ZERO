#include "lwip/init.h"
#include "lwip/netif.h"
#include "lwip/timeouts.h"
#include "netif/xadapter.h"
#include "platform.h"
#include "risk_zero_app.h"
#include "risk_zero_config.h"
#include "xil_printf.h"


static struct netif risk_zero_netif;
static unsigned char mac_address[] = {0x00, 0x0a, 0x35, 0x00, 0x01, 0x02};

int main(void) {
    ip_addr_t ip_address;
    ip_addr_t netmask;
    ip_addr_t gateway;

    init_platform();
    lwip_init();
    IP4_ADDR(&ip_address, RISK_ZERO_IP_A, RISK_ZERO_IP_B, RISK_ZERO_IP_C, RISK_ZERO_IP_D);
    IP4_ADDR(&netmask, 255, 255, 255, 0);
    IP4_ADDR(&gateway, RISK_ZERO_IP_A, RISK_ZERO_IP_B, RISK_ZERO_IP_C, RISK_ZERO_GATEWAY_D);

    if (xemac_add(
            &risk_zero_netif,
            &ip_address,
            &netmask,
            &gateway,
            mac_address,
            RISK_ZERO_EMAC_BASEADDR) == 0) {
        xil_printf("Ethernet initialization failed\r\n");
        cleanup_platform();
        return 1;
    }
    netif_set_default(&risk_zero_netif);
    netif_set_up(&risk_zero_netif);
    platform_enable_interrupts();

    xil_printf(
        "RISK-ZERO Arty IP: %d.%d.%d.%d\r\n",
        RISK_ZERO_IP_A,
        RISK_ZERO_IP_B,
        RISK_ZERO_IP_C,
        RISK_ZERO_IP_D);
    if (risk_zero_app_init() != 0) {
        xil_printf("RISK-ZERO application initialization failed\r\n");
        cleanup_platform();
        return 2;
    }

    while (1) {
        xemacif_input(&risk_zero_netif);
        sys_check_timeouts();
    }
    cleanup_platform();
    return 0;
}
