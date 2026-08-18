#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "img_converters.h"

#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif

#ifndef RISK_ZERO_FPGA_UDP_ENABLED
#define RISK_ZERO_FPGA_UDP_ENABLED 0
#endif
#ifndef RISK_ZERO_FPGA_IP
#define RISK_ZERO_FPGA_IP "192.168.0.40"
#endif
#ifndef RISK_ZERO_FPGA_PORT
#define RISK_ZERO_FPGA_PORT 5005
#endif
#ifndef RISK_ZERO_FPGA_FRAME_INTERVAL_MS
#define RISK_ZERO_FPGA_FRAME_INTERVAL_MS 500
#endif

// AI Thinker ESP32-CAM pin map
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

namespace {
httpd_handle_t control_server = nullptr;
httpd_handle_t stream_server = nullptr;
WiFiUDP fpga_udp;
IPAddress fpga_address;

constexpr uint16_t kFpgaFrameWidth = 160;
constexpr uint16_t kFpgaFrameHeight = 120;
constexpr size_t kFpgaFrameBytes = kFpgaFrameWidth * kFpgaFrameHeight;
constexpr size_t kSourceRgbBytes = 320 * 240 * 3;
constexpr size_t kUdpHeaderBytes = 32;
constexpr size_t kUdpPayloadBytes = 1200;
constexpr uint32_t kUdpMagic = 0x525A4650;  // ASCII "RZFP"

uint8_t* fpga_gray_frame = nullptr;
uint8_t* fpga_rgb_frame = nullptr;
uint32_t fpga_frame_id = 0;
uint32_t fpga_frames_sent = 0;
uint32_t fpga_frames_failed = 0;
uint32_t last_fpga_frame_ms = 0;

constexpr char kStreamContentType[] = "multipart/x-mixed-replace;boundary=frame";
constexpr char kStreamBoundary[] = "\r\n--frame\r\n";
constexpr char kStreamPart[] = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

void write_u16_be(uint8_t* target, uint16_t value) {
  target[0] = static_cast<uint8_t>(value >> 8);
  target[1] = static_cast<uint8_t>(value);
}

void write_u32_be(uint8_t* target, uint32_t value) {
  target[0] = static_cast<uint8_t>(value >> 24);
  target[1] = static_cast<uint8_t>(value >> 16);
  target[2] = static_cast<uint8_t>(value >> 8);
  target[3] = static_cast<uint8_t>(value);
}

bool initialize_fpga_transport() {
  if (!RISK_ZERO_FPGA_UDP_ENABLED) {
    return false;
  }
  if (!psramFound() || !fpga_address.fromString(RISK_ZERO_FPGA_IP)) {
    Serial.println("FPGA UDP disabled: PSRAM or target IP unavailable");
    return false;
  }

  fpga_gray_frame = static_cast<uint8_t*>(ps_malloc(kFpgaFrameBytes));
  fpga_rgb_frame = static_cast<uint8_t*>(ps_malloc(kSourceRgbBytes));
  if (fpga_gray_frame == nullptr || fpga_rgb_frame == nullptr) {
    free(fpga_gray_frame);
    free(fpga_rgb_frame);
    fpga_gray_frame = nullptr;
    fpga_rgb_frame = nullptr;
    Serial.println("FPGA UDP disabled: frame buffer allocation failed");
    return false;
  }
  if (fpga_udp.begin(0) == 0) {
    free(fpga_gray_frame);
    free(fpga_rgb_frame);
    fpga_gray_frame = nullptr;
    fpga_rgb_frame = nullptr;
    Serial.println("FPGA UDP disabled: socket initialization failed");
    return false;
  }
  Serial.printf("FPGA UDP target: %s:%u\n", RISK_ZERO_FPGA_IP, RISK_ZERO_FPGA_PORT);
  return true;
}

bool send_fpga_packet(
    uint32_t frame_id,
    uint32_t captured_ms,
    uint16_t chunk_index,
    uint16_t chunk_count,
    uint32_t payload_offset,
    const uint8_t* payload,
    uint16_t payload_bytes) {
  uint8_t header[kUdpHeaderBytes] = {};
  write_u32_be(header + 0, kUdpMagic);
  header[4] = 1;  // protocol version
  header[5] = 1;  // GRAY8
  write_u16_be(header + 6, kUdpHeaderBytes);
  write_u32_be(header + 8, frame_id);
  write_u32_be(header + 12, captured_ms);
  write_u16_be(header + 16, kFpgaFrameWidth);
  write_u16_be(header + 18, kFpgaFrameHeight);
  write_u16_be(header + 20, chunk_index);
  write_u16_be(header + 22, chunk_count);
  write_u32_be(header + 24, payload_offset);
  write_u16_be(header + 28, payload_bytes);

  if (!fpga_udp.beginPacket(fpga_address, RISK_ZERO_FPGA_PORT)) {
    return false;
  }
  const size_t header_written = fpga_udp.write(header, sizeof(header));
  const size_t payload_written = fpga_udp.write(payload, payload_bytes);
  return header_written == sizeof(header) &&
      payload_written == payload_bytes &&
      fpga_udp.endPacket() == 1;
}

bool send_fpga_frame() {
  if (fpga_gray_frame == nullptr || fpga_rgb_frame == nullptr || WiFi.status() != WL_CONNECTED) {
    return false;
  }

  camera_fb_t* frame = esp_camera_fb_get();
  if (frame == nullptr) {
    return false;
  }
  const bool converted = fmt2rgb888(frame->buf, frame->len, frame->format, fpga_rgb_frame);
  esp_camera_fb_return(frame);
  if (!converted) {
    return false;
  }

  // QVGA RGB에서 가로·세로 한 칸씩 건너뛰어 QQVGA GRAY8을 만든다.
  for (uint16_t y = 0; y < kFpgaFrameHeight; ++y) {
    for (uint16_t x = 0; x < kFpgaFrameWidth; ++x) {
      const size_t source = (static_cast<size_t>(y) * 2 * 320 + x * 2) * 3;
      const uint16_t gray =
          77 * fpga_rgb_frame[source] +
          150 * fpga_rgb_frame[source + 1] +
          29 * fpga_rgb_frame[source + 2];
      fpga_gray_frame[static_cast<size_t>(y) * kFpgaFrameWidth + x] = gray >> 8;
    }
  }

  const uint32_t frame_id = ++fpga_frame_id;
  const uint32_t captured_ms = millis();
  const uint16_t chunk_count =
      static_cast<uint16_t>((kFpgaFrameBytes + kUdpPayloadBytes - 1) / kUdpPayloadBytes);
  for (uint16_t chunk = 0; chunk < chunk_count; ++chunk) {
    const size_t offset = static_cast<size_t>(chunk) * kUdpPayloadBytes;
    const size_t remaining = kFpgaFrameBytes - offset;
    const uint16_t payload_bytes =
        static_cast<uint16_t>(remaining < kUdpPayloadBytes ? remaining : kUdpPayloadBytes);
    if (!send_fpga_packet(
            frame_id,
            captured_ms,
            chunk,
            chunk_count,
            offset,
            fpga_gray_frame + offset,
            payload_bytes)) {
      return false;
    }
    delay(1);
  }
  return true;
}

void add_common_headers(httpd_req_t* request) {
  httpd_resp_set_hdr(request, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
}

esp_err_t health_handler(httpd_req_t* request) {
  add_common_headers(request);
  httpd_resp_set_type(request, "application/json");

  char body[512];
  snprintf(
      body,
      sizeof(body),
      "{\"status\":\"ok\",\"deviceId\":\"%s\",\"rssi\":%d,\"freeHeap\":%u,"
      "\"fpgaUdp\":{\"configured\":%s,\"ready\":%s,\"target\":\"%s:%u\","
      "\"framesSent\":%u,\"framesFailed\":%u}}",
      RISK_ZERO_DEVICE_ID,
      WiFi.RSSI(),
      ESP.getFreeHeap(),
      RISK_ZERO_FPGA_UDP_ENABLED ? "true" : "false",
      fpga_gray_frame != nullptr && fpga_rgb_frame != nullptr ? "true" : "false",
      RISK_ZERO_FPGA_IP,
      RISK_ZERO_FPGA_PORT,
      fpga_frames_sent,
      fpga_frames_failed);
  return httpd_resp_send(request, body, HTTPD_RESP_USE_STRLEN);
}

esp_err_t capture_handler(httpd_req_t* request) {
  camera_fb_t* frame = esp_camera_fb_get();
  if (frame == nullptr) {
    httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR, "camera capture failed");
    return ESP_FAIL;
  }

  add_common_headers(request);
  httpd_resp_set_type(request, "image/jpeg");
  httpd_resp_set_hdr(request, "Content-Disposition", "inline; filename=capture.jpg");
  const esp_err_t result = httpd_resp_send(request, reinterpret_cast<const char*>(frame->buf), frame->len);
  esp_camera_fb_return(frame);
  return result;
}

esp_err_t stream_handler(httpd_req_t* request) {
  add_common_headers(request);
  httpd_resp_set_type(request, kStreamContentType);

  while (true) {
    camera_fb_t* frame = esp_camera_fb_get();
    if (frame == nullptr) {
      return ESP_FAIL;
    }

    char header[80];
    const int header_length = snprintf(header, sizeof(header), kStreamPart, frame->len);
    esp_err_t result = httpd_resp_send_chunk(request, kStreamBoundary, strlen(kStreamBoundary));
    if (result == ESP_OK) {
      result = httpd_resp_send_chunk(request, header, header_length);
    }
    if (result == ESP_OK) {
      result = httpd_resp_send_chunk(
          request,
          reinterpret_cast<const char*>(frame->buf),
          frame->len);
    }
    esp_camera_fb_return(frame);

    if (result != ESP_OK) {
      break;
    }
    delay(1);
  }
  return ESP_OK;
}

bool start_camera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA;
  config.jpeg_quality = 12;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.fb_count = psramFound() ? 2 : 1;
  config.grab_mode = psramFound() ? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY;

  const esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) {
    Serial.printf("camera init failed: 0x%x\n", result);
    return false;
  }
  return true;
}

void start_servers() {
  httpd_config_t control_config = HTTPD_DEFAULT_CONFIG();
  control_config.server_port = 80;
  control_config.max_uri_handlers = 4;
  if (httpd_start(&control_server, &control_config) == ESP_OK) {
    httpd_uri_t health_uri = {
        .uri = "/health",
        .method = HTTP_GET,
        .handler = health_handler,
        .user_ctx = nullptr,
    };
    httpd_uri_t capture_uri = {
        .uri = "/capture",
        .method = HTTP_GET,
        .handler = capture_handler,
        .user_ctx = nullptr,
    };
    httpd_register_uri_handler(control_server, &health_uri);
    httpd_register_uri_handler(control_server, &capture_uri);
  }

  httpd_config_t stream_config = HTTPD_DEFAULT_CONFIG();
  stream_config.server_port = 81;
  stream_config.ctrl_port = 32769;
  if (httpd_start(&stream_server, &stream_config) == ESP_OK) {
    httpd_uri_t stream_uri = {
        .uri = "/stream",
        .method = HTTP_GET,
        .handler = stream_handler,
        .user_ctx = nullptr,
    };
    httpd_register_uri_handler(stream_server, &stream_uri);
  }
}
}  // namespace

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(false);

  if (!start_camera()) {
    delay(3000);
    ESP.restart();
  }

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(RISK_ZERO_WIFI_SSID, RISK_ZERO_WIFI_PASSWORD);
  Serial.print("connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  Serial.printf("camera ready: http://%s/capture\n", WiFi.localIP().toString().c_str());
  Serial.printf("stream ready: http://%s:81/stream\n", WiFi.localIP().toString().c_str());
  initialize_fpga_transport();
  start_servers();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(RISK_ZERO_WIFI_SSID, RISK_ZERO_WIFI_PASSWORD);
  }
  const uint32_t now = millis();
  if (fpga_gray_frame != nullptr && now - last_fpga_frame_ms >= RISK_ZERO_FPGA_FRAME_INTERVAL_MS) {
    last_fpga_frame_ms = now;
    if (send_fpga_frame()) {
      ++fpga_frames_sent;
    } else {
      ++fpga_frames_failed;
    }
  }
  delay(5);
}
