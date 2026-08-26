#pragma once

// 이 파일을 risk_zero_config.h로 복사한 뒤 실제 값을 입력합니다.
// risk_zero_config.h는 Git에 올라가지 않습니다.
#define RISK_ZERO_WIFI_SSID "YOUR_WIFI_SSID"
#define RISK_ZERO_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define RISK_ZERO_DEVICE_ID "XIAO-ESP32S3-SENSE-01"

// Arty A7-100T가 연결된 같은 공유기 내부 IP를 입력합니다.
// 0이면 기존 JPEG 웹 카메라 기능만 사용합니다.
#define RISK_ZERO_FPGA_UDP_ENABLED 0
#define RISK_ZERO_FPGA_IP "192.168.0.40"
#define RISK_ZERO_FPGA_PORT 5005
#define RISK_ZERO_FPGA_FRAME_INTERVAL_MS 500
