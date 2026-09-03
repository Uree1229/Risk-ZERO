# RISK-ZERO 새 PC·Codex 인수인계

- 기준일: 2026-09-03
- GitHub: <https://github.com/Uree1229/Risk-ZERO>
- 브랜치: `main`
- 단계: 새 하드웨어 아키텍처 채택, Camera primitive 검증, OV7670 SCCB 실기 진단 중

## 먼저 읽을 문서

1. `AGENTS.md`
2. `docs/RISK-ZERO_하드웨어_아키텍처_2026-08-28.md`
3. `docs/implementation-status.md`
4. `fpga/arty-a7-100t/DIRECT_CAMERA_BRINGUP.md`
5. `docs/HARDWARE_TEST_2026-08-26.md` — 이전 UDP/XIAO 구조의 PC 시험 이력

## 핵심 변경

2026-08-28 하드웨어팀 계획에 따라 XIAO ESP32-S3 Sense와 AI Thinker ESP32-CAM은 현재 영상 입력 경로에서 제외됐다.

```text
PIR → ESP32-S3 Door Hub → FPGA Vision wake
External DVP Camera → Arty FPGA direct pixel input
FPGA result/Snapshot → Door Hub → Wi-Fi → 앱
```

FPGA는 상시 구성 상태다. Safety Domain은 영상과 독립적으로 항상 동작하고 Camera·Vision만 이벤트 기반으로 활성화한다.

## 현재 구현

| 영역 | 상태 |
| --- | --- |
| Safety Gate | toggle auth/request/heartbeat, Reed·Tamper·E-stop, auth 만료·소비, pulse 상한 RTL·Icarus·Vivado XSIM 통과 |
| DVP RX | PCLK domain GRAY8 byte·좌표·frame geometry RTL·Icarus·Vivado XSIM 통과 |
| Motion core | 배경 차분·threshold·bbox 누적 기존 RTL, DVP 직접 연결 전 |
| Door Hub | C++ 상태 코어와 Python `door-hub-event/1` 기준 구현 작성, 실제 pin/SPI adapter 전 |
| Camera | Voltly `VLT-CAM003` OV7670 실물 식별. 25 MHz XCLK primitive, 수정된 2-transmission SCCB, PID/VER probe, YUV422 Y 추출, async FIFO RTL·Vivado XSIM 통과. 저항 보호용 12.5MHz SCCB-only top을 Arty A7-100T에 프로그램했고 SCCB ID 실패 원인을 LED로 분류하는 단계 |
| Result/Snapshot | SPI 계약·buffer·Door Hub 중계 미구현 |
| 웹·모바일 | Door Hub 상태 화면, D1 API·seed, 모바일 SQLite v5 구현, 실제 하드웨어 미연결 |
| AV 검증 | 정책 DEMO 유지, 실제 AI 미연결 |

Python FPGA asset/reference 테스트 18개와 Windows Vivado 2025.2 XSIM의 motion·AXI·Safety·DVP·XCLK·SCCB·OV7670 ID·YUV422·async FIFO simulation 9개가 통과했다. 신규 Camera primitive 4개는 Artix-7 OOC synthesis도 오류·경고 0건으로 통과했고 FIFO storage는 distributed RAM으로 추론됐다. 12.5MHz 최소 probe top도 전체 합성·배치·배선·bitstream DRC와 timing을 통과했다. GitHub Actions Icarus의 원격 검증은 push 후 다시 확인해야 한다. 소프트웨어는 Edge 45개, 웹 13개, 모바일 24개 테스트와 SQLite schema 검사를 통과했다. 전체 Camera top/DVP 실장 통합은 별도로 남아 있다.

## 2026-09-03 OV7670 실기 상태

- 보드: Digilent Arty A7-100T, JTAG serial `210319B9B31CA`, device `xc7a100t`
- 카메라: Device Mart/Voltly `VLT-CAM003`, OV7670, FIFO 없음
- 사용자 보고 기준 최소 저항 배선 완료: JA1=XCLK, JA2=SIOC/SCL, JA3=SIOD/SDA, JA6/JA12 계열 3.3V, 공통 GND, RESET high 분압, PWDN GND
- level shifter와 멀티미터/오실로스코프가 없는 임시 bring-up이다. 최종 회로 검증으로 간주하지 않는다.
- 첫 probe 결과: `LD4 OFF`, `LD5 ON`, `LD6 OFF`. 이때 LD5는 PID 불일치였고 LD6 OFF는 내부 상태 머신 완료일 뿐 Camera ACK를 증명하지 않는다.
- 이를 구분하기 위해 PID 결과를 LED로 분류하도록 top을 변경하고 다시 합성·프로그램했다.
- **현재 마지막 상태:** 새 진단 bitstream 프로그램 성공 후 사용자의 LD4~LD7 판독을 기다리는 중이다.

새 진단 LED 의미:

| LED | 의미 |
| --- | --- |
| LD4 | PID/VER 정상 (`0x76`/`0x73`) |
| LD5 | PID `0xFF`: SDA high 고정 또는 Camera 무응답 가능성 |
| LD6 | PID `0x00`: SDA low 고정 가능성 |
| LD7 | 다른 PID/VER 불일치 또는 내부 controller timeout |

Windows Vivado 2025.2에서는 사용자 Tcl app 초기화가 `Common 17-356`으로 실패해 해당 프로세스에서 `XILINX_LOCAL_USER_DATA=no`를 사용했다. 또한 Windows known-folder 경로 정규화가 `Documents`를 누락한 사례가 있어 build/program Tcl에 절대 경로 인수를 추가했다.

```powershell
$env:XILINX_LOCAL_USER_DATA='no'
vivado -mode batch -source fpga/arty-a7-100t/vivado/build_ov7670_probe.tcl -tclargs 'C:/ABS/PATH/RISK-ZERO/fpga/arty-a7-100t'
vivado -mode batch -source fpga/arty-a7-100t/vivado/program_ov7670_probe.tcl -tclargs 'C:/ABS/PATH/RISK-ZERO/fpga/arty-a7-100t/build/ov7670-probe/risk_zero_ov7670_probe.bit'
```

최신 진단 build는 route WNS `+4.790ns`, DRC 오류 0건이며 FPGA programming startup status는 `HIGH`였다. bitstream은 gitignored build 산출물이므로 새 환경에서 위 명령으로 재생성한다.

## 이전 구현의 위치

- `firmware/esp32-cam`: XIAO/AI Thinker 카메라·RZFP UDP 참고 구현
- `fpga/arty-a7-100t/software`: MicroBlaze UDP/HTTP 참고 구현
- BRAM·DDR Vivado/Vitis build와 2026-08-26 하드웨어 기록: 이전 경로의 PC toolchain 검증

삭제하지 않지만 현재 수직 통합에는 사용하지 않는다. motion core의 픽셀 연산은 새 DVP stream에 재사용할 수 있다.

## 새 노트북 준비

- Git
- Python 3.11 이상
- Node.js 22.13 이상
- pnpm 11 계열
- FPGA 작업: Artix-7 지원 Vivado와 Digilent board files
- MCU 작업: PlatformIO
- 실장: logic analyzer/oscilloscope, 안정된 전원, 실제 Camera 회로도·데이터시트

Vivado는 macOS에서 네이티브로 실행하지 못한다. Mac에서 문서·소프트웨어·RTL 편집과 Python 테스트는 가능하지만 FPGA 합성/JTAG programming은 지원되는 Windows/Linux 환경을 유지해야 한다.

```powershell
git clone https://github.com/Uree1229/Risk-ZERO.git
cd Risk-ZERO

python -m unittest discover -s edge/tests -v
python -m unittest discover -s fpga/arty-a7-100t/tests -v
```

## 다음 작업 순서

1. 현재 프로그램된 진단 bitstream의 LD4~LD7을 판독한다.
2. LD5면 SDA/SIOC와 Camera 전원·RESET·PWDN 연결을 재확인하고, LD6면 SDA short/분압 연결을 확인하며, LD7이면 실제 PID/VER capture를 추가한다.
3. level shifter와 측정 장비를 확보해 XCLK·SCCB ACK·Camera I/O 전압을 확인한다.
4. 검증된 YUV422·async FIFO primitive를 전체 Camera top에 연결
5. 실측 byte order에 맞는 init table을 확정하고 기존 motion core를 DVP stream에 연결
6. 3×3 zone, timeline, B_end 비교와 Snapshot buffer 구현
7. Door Hub PIR event와 SPI result link 구현
8. LED로 수직 통합
9. 앱 결과·Snapshot 연결

## 새 Codex에 전달할 문장

> AGENTS.md와 docs/CODEX_HANDOFF.md를 먼저 전부 읽어줘. 현재 구조는 ESP32-S3 Door Hub + VLT-CAM003 OV7670의 FPGA 직접 DVP 입력이며 XIAO/ESP32-CAM UDP는 이전 참고 구현이야. 새 PID 분류용 probe bitstream까지 Arty A7-100T에 프로그램됐고 최종 LD4~LD7 판독 대기 상태이므로 기존 작업을 다시 만들지 말고 여기서 이어가 줘. 카메라 전압·핀은 추측하지 말고 APK는 내가 요청하기 전에는 빌드하거나 업로드하지 마.
