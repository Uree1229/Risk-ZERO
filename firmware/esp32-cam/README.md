# ESP32-CAM 영상 수집기

Seeed Studio XIAO ESP32S3 Sense 또는 AI Thinker ESP32-CAM에서 JPEG 사진과 MJPEG 영상을 로컬 Wi-Fi로 제공하고, 저해상도 흑백 프레임을 Arty A7-100T로 보내는 수집 펌웨어다. 사람 후보의 동선 수치 처리는 카메라 보드나 웹·모바일이 아니라 Arty의 MicroBlaze와 motion RTL이 담당한다.

## 준비

1. VS Code에 PlatformIO를 설치한다.
2. `include/config.example.h`를 `include/risk_zero_config.h`로 복사한다.
3. `RISK_ZERO_WIFI_SSID`, `RISK_ZERO_WIFI_PASSWORD`, `RISK_ZERO_DEVICE_ID`를 수정한다.
4. XIAO ESP32S3 Sense를 USB-C로 연결하고 `xiao-esp32s3-sense` 환경에서 `Upload`를 실행한다.
5. 시리얼 모니터를 115200 baud로 열어 할당된 IP를 확인한다.

`risk_zero_config.h`는 Git에서 제외된다. 실제 Wi-Fi 비밀번호를 `config.example.h`에 적지 않는다.

현재 기본 환경은 XIAO ESP32S3 Sense의 8MB flash·8MB OPI PSRAM과 OV3660 카메라 핀맵을 사용한다. 기존 AI Thinker 보드를 사용할 때만 PlatformIO 환경을 `ai-thinker-cam`으로 바꾼다.

PlatformIO가 Windows의 `COM3` 또는 macOS의 `/dev/cu.*` 포트를 자동 감지하도록 포트 이름을 저장소에 고정하지 않는다. 여러 장치가 연결돼 자동 감지가 모호할 때만 로컬 명령의 `--upload-port` 또는 `--port` 옵션을 사용한다.

## 제공 주소

- `http://장치IP/health`: 장치 ID, Wi-Fi 신호, 여유 메모리 확인
- `http://장치IP/capture`: 현재 JPEG 한 장
- `http://장치IP:81/stream`: 로컬 처리기에 전달할 MJPEG 스트림

## Arty A7-100T UDP 출력

`risk_zero_config.h`에서 다음 값을 설정하면 기존 웹 스트림과 함께 FPGA용 흑백 프레임을 보낸다.

```cpp
#define RISK_ZERO_FPGA_UDP_ENABLED 1
#define RISK_ZERO_FPGA_IP "192.168.0.40"
#define RISK_ZERO_FPGA_PORT 5005
#define RISK_ZERO_FPGA_FRAME_INTERVAL_MS 500
```

JPEG QVGA 프레임을 PSRAM에서 RGB로 해제한 뒤 160×120 GRAY8로 축소하고, 1,200 bytes씩 16개 UDP 패킷으로 전송한다. 패킷 규격은 [`fpga/arty-a7-100t/protocol.md`](../../fpga/arty-a7-100t/protocol.md)에 있다. PSRAM이 없거나 IP가 잘못되면 FPGA 출력만 비활성화되고 `/capture`, `/stream`은 유지된다.

`/health`의 `fpgaUdp` 항목에서 설정 여부, 버퍼 준비, 대상 IP, 전송·실패 프레임 수를 확인한다. 웹 스트림과 FPGA 전송을 동시에 사용하면 프레임률이 떨어질 수 있으므로 보드 시험에서는 먼저 웹 스트림을 닫고 FPGA 경로만 측정한다.

기본 해상도는 QVGA(320×240), JPEG 품질 값은 12다. 동선 실험에서는 높은 해상도보다 끊김 없이 시간 순서가 유지되는 것이 우선이다.

## 전원 주의

업로드와 실행에는 안정적인 5V 전원을 사용한다. 카메라와 Wi-Fi가 동시에 동작할 때 전원이 부족하면 재부팅이나 프레임 손실이 발생할 수 있다. 현관 밖 인터넷에 스트림을 공개하지 말고 같은 실험용 로컬 네트워크에서만 사용한다.
