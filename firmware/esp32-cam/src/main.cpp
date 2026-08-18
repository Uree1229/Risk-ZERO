#include <Arduino.h>
#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"

#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
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

constexpr char kStreamContentType[] = "multipart/x-mixed-replace;boundary=frame";
constexpr char kStreamBoundary[] = "\r\n--frame\r\n";
constexpr char kStreamPart[] = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

void add_common_headers(httpd_req_t* request) {
  httpd_resp_set_hdr(request, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
}

esp_err_t health_handler(httpd_req_t* request) {
  add_common_headers(request);
  httpd_resp_set_type(request, "application/json");

  char body[256];
  snprintf(
      body,
      sizeof(body),
      "{\"status\":\"ok\",\"deviceId\":\"%s\",\"rssi\":%d,\"freeHeap\":%u}",
      RISK_ZERO_DEVICE_ID,
      WiFi.RSSI(),
      ESP.getFreeHeap());
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
  start_servers();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.disconnect();
    WiFi.begin(RISK_ZERO_WIFI_SSID, RISK_ZERO_WIFI_PASSWORD);
  }
  delay(3000);
}

