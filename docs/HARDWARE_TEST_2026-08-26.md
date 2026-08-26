# RISK-ZERO 하드웨어 시험 기록 — 2026-08-26

이 문서는 Windows 작업 PC에서 수행한 FPGA PC toolchain 검증과 XIAO ESP32S3 Sense 실장치 시험을 다음 개발 PC에 전달한다. Wi-Fi 비밀번호, 장치 고유번호, 개인 사진과 실제 촬영 영상은 저장소에 포함하지 않는다.

## ESP32 시험 환경

- 보드: Seeed Studio XIAO ESP32S3 Sense
- 카메라 표기: OV3660
- 연결: USB-C, ESP32-S3 USB Serial/JTAG
- PlatformIO Core: 6.1.19
- PlatformIO Espressif32 platform: 7.0.1
- Arduino-ESP32 framework: 2.0.17
- PlatformIO 환경: `xiao-esp32s3-sense`
- flash/PSRAM: 8MB flash, 8MB OPI PSRAM

## ESP32에서 통과한 항목

```text
PlatformIO build: SUCCESS
PlatformIO upload: SUCCESS, flash hash verified
USB Serial/JTAG enumeration: SUCCESS
Firmware boot: SUCCESS
PSRAM reported by firmware: 8386295 bytes
```

Windows 시험 당시 빌드 사용량은 RAM 약 14.9%, flash 약 23.0%였다. macOS에서 현재 커밋을 다시 빌드해 수치를 갱신한다.

## ESP32에서 막힌 항목

카메라 초기화가 Wi-Fi 연결보다 먼저 실패한다. 여러 차례 USB reset과 재부팅에서 다음 로그가 반복됐다.

```text
RISK-ZERO camera boot
PSRAM: 8386295 bytes
E (...) camera: Camera probe failed with error 0x105(ESP_ERR_NOT_FOUND)
E (...) gdma: gdma_disconnect(...): no peripheral is connected to the channel
camera init failed: 0x105
```

확인한 사항:

- Seeed/Arduino CameraWebServer의 XIAO ESP32S3 Sense 핀맵과 `src/main.cpp`를 대조했다.
- 올바른 값은 `PWDN=-1`, `RESET=-1`, `XCLK=10`, `SDA=40`, `SCL=39`다.
- GPIO21은 이 보드에서 카메라 PWDN이 아니라 LED 핀이므로 `PWDN=21`로 바꾸지 않는다.
- 나머지 영상 데이터, VSYNC, HREF, PCLK 핀도 공식 예제와 일치한다.
- XIAO 본체와 Sense 확장보드 사이 B2B 커넥터를 여러 번 재체결했다.
- OV3660 FPC 리본과 잠금부를 재체결했다.
- 네트워크를 변경해도 카메라 probe 단계에서 먼저 실패하므로 Wi-Fi 원인이 아니다.
- 초기 시험 중 센서가 일시적으로 OV3660으로 식별된 적이 있으나 SCCB 설정이 이어서 실패했고, 이후 재현되지 않았다. 접촉 불량 또는 카메라/확장보드 불량 정황으로 본다.

현재 판정은 XIAO 본체·USB·flash·PSRAM은 정상이고, OV3660 모듈/FPC/카메라 커넥터/Sense 확장보드 중 하나의 하드웨어 불량 가능성이 높다는 것이다.

다음 시험은 이 순서로 진행한다.

1. 정상으로 확인된 호환 OV3660 카메라 모듈만 교체하고 현재 펌웨어를 재부팅한다.
2. 여전히 `0x105`이면 Sense 확장보드를 교체한다.
3. 센서 PID가 출력되면 Wi-Fi 연결, `/health`, `/capture`, `:81/stream`을 확인한다.
4. 30분 연속 스트림이 통과한 뒤에만 ESP32 실증 완료로 표시한다.

## macOS에서 ESP32 작업 재개

Apple Silicon과 Intel Mac 모두 VS Code PlatformIO extension 또는 PlatformIO Core를 사용할 수 있다. 저장소 루트에서 로컬 비밀 설정을 새로 만든다.

```bash
cp firmware/esp32-cam/include/config.example.h \
  firmware/esp32-cam/include/risk_zero_config.h
```

`risk_zero_config.h`에 Mac이 접속한 실험용 Wi-Fi 정보를 입력한다. 이 파일은 `.gitignore` 대상이며 커밋하지 않는다.

```bash
cd firmware/esp32-cam
pio device list
pio run -e xiao-esp32s3-sense
pio run -e xiao-esp32s3-sense -t upload
pio device monitor -b 115200
```

포트는 저장소에 고정하지 않는다. 자동 감지가 실패할 때만 `pio device list`에 표시된 `/dev/cu.usbmodem*` 포트를 명령 옵션으로 지정한다.

## FPGA PC 검증 요약

- Vivado/Vitis 2025.2 설치 및 Arty A7-100 board part 확인
- RTL simulation 2개 통과
- BRAM profile synthesis, implementation, bitstream, XSA 통과; route WNS `+0.543579ns`
- DDR3L profile synthesis, implementation, bitstream, XSA 통과; route WNS `+0.998833ns`
- Vitis standalone/lwIP DDR ELF 수동 build와 `vitis/build_ddr_app.py`의 깨끗한 workspace 자동 build 통과
- 최종 자동 build ELF 할당 크기: text 187,752byte, data 2,166byte, bss 3,984,346byte
- 실제 Arty program, MIG calibration, UART, Ethernet, ESP32 UDP는 미검증

`fpga/arty-a7-100t/vitis/build_ddr_app.py`는 성공한 수동 Vitis 작업을 자동화한 스크립트다. Windows의 `subst` 드라이브가 긴 실제 경로로 되돌아가지 않도록 `Path.resolve()`를 사용하지 않는다. 최종 수정 후 빈 `vitis-workspace-ddr-handoff`에서 platform, BSP, lwIP, application과 ELF 생성을 끝까지 재현했다.

Vivado/Vitis 합성·구현은 macOS 네이티브 작업으로 가정하지 않는다. AMD의 [Vivado 2025.2 지원 OS](https://docs.amd.com/r/2025.2-English/ug973-vivado-release-notes-install-license/Supported-Operating-Systems)는 x86-64 Windows와 지정 Linux 배포판이며 macOS를 포함하지 않는다. Mac에서는 소스·Python·웹·모바일·ESP32 작업을 이어가고, FPGA vendor tool 실행과 실물 Arty program은 지원되는 Windows/Linux 환경에서 수행한다.
