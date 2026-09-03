# RISK-ZERO 새 PC·Codex 인수인계

- 기준일: 2026-09-03
- GitHub: <https://github.com/Uree1229/Risk-ZERO>
- 브랜치: `main`
- 단계: 새 하드웨어 아키텍처 채택, RTL 골격 작성, 실장 통합 전

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
| Camera | 모델·전압·핀맵 미결정, controller/SCCB/CDC 미구현 |
| Result/Snapshot | SPI 계약·buffer·Door Hub 중계 미구현 |
| 웹·모바일 | Door Hub 상태 화면, D1 API·seed, 모바일 SQLite v5 구현, 실제 하드웨어 미연결 |
| AV 검증 | 정책 DEMO 유지, 실제 AI 미연결 |

Python FPGA asset/reference 테스트 15개, GitHub Actions Icarus Verilog와 Windows Vivado 2025.2 XSIM의 motion·AXI·Safety·DVP simulation이 통과했다. 소프트웨어는 Edge 45개, 웹 13개, 모바일 24개 테스트와 SQLite schema 검사를 통과했다. 새 구조의 Block Design·합성·timing과 실물 Camera/Arty 검증은 별도로 남아 있다.

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

```powershell
git clone https://github.com/Uree1229/Risk-ZERO.git
cd Risk-ZERO

python -m unittest discover -s edge/tests -v
python -m unittest discover -s fpga/arty-a7-100t/tests -v
```

## 다음 작업 순서

1. 외부 DVP Camera 모델·모듈 회로도·전압·핀맵 확정
2. XCLK·SCCB ID·PCLK/VSYNC/HREF를 장비로 확인
3. Camera controller, format unpack/grayscale와 async FIFO 구현
4. 기존 motion core를 DVP stream에 연결
5. 3×3 zone, timeline, B_end 비교와 Snapshot buffer 구현
6. Door Hub PIR event와 SPI result link 구현
7. LED로 수직 통합
8. 앱 결과·Snapshot 연결

## 새 Codex에 전달할 문장

> AGENTS.md와 docs/RISK-ZERO_하드웨어_아키텍처_2026-08-28.md를 먼저 전부 읽어줘. 현재 구조는 ESP32-S3 Door Hub + 외부 DVP Camera의 FPGA 직접 입력이며 XIAO/ESP32-CAM UDP는 이전 참고 구현이야. 카메라 모델·전압·핀은 추측하지 말고, 우선 새 Safety Gate와 DVP RX testbench를 Vivado에서 검증한 뒤 DIRECT_CAMERA_BRINGUP.md 순서로 진행해줘. APK는 내가 요청하기 전에는 빌드하거나 업로드하지 마.
