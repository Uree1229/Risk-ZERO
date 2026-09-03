# Arty A7-100T 외부 DVP Camera 구동 순서

현재 하드웨어 아키텍처의 첫 실장 절차다. 기존 `BOARD_BRINGUP.md`는 ESP32 카메라 UDP·MicroBlaze Ethernet 경로의 이전 시험 절차이며 현재 수직 통합 기준이 아니다.

## 0. 결정 게이트

다음 정보가 모두 확보되기 전에는 카메라 XDC와 SCCB register table을 작성하지 않는다.

- 실제 판매 모듈명과 회로도
- 센서 데이터시트와 SCCB/I2C register 문서
- DVP 출력 지원과 `D[7:0]`, PCLK, VSYNC, HREF
- 모듈 I/O 전압과 Arty I/O Bank 전압
- XCLK, RESET, PWDN 요구 조건
- 출력 포맷과 해상도
- 사용할 Arty header와 실제 핀맵

현재 확보된 실물은 Device Mart에서 판매하는 Voltly `VLT-CAM003` OV7670 모듈이다. 사진상 FIFO 메모리가 없는 18-pin Parallel DVP 보드이며 `3.3V`, `GND`, `SIOC`, `SIOD`, `VS`, `HS`, `PCLK`, `XCLK`, `D[7:0]`, `RESET`, `PWDN` 표기가 확인됐다. 판매 페이지에 모듈 회로도와 I/O 전압 자료가 없으므로 Arty 연결 전 내부 I/O 전압 측정 또는 FPGA→Camera 레벨 변환이 필요하다.

## 1. Safety Domain 독립 검증

```powershell
vivado -mode batch -source fpga/arty-a7-100t/vivado/run_rtl_tests.tcl
```

`tb_risk_zero_safety_gate_fsm`에서 다음을 확인한다.

- reset 기본 차단
- heartbeat 전에는 BOOT
- auth 1회 발급·만료·1회 소비
- authorization 없는 request 차단
- Reed #2 open 차단
- Tamper와 E-stop fault latch
- 펄스 중 unsafe 입력 ABORT
- 펄스 최대 폭

Safety test가 실패하면 Camera 연결을 진행하지 않는다.

## 2. Camera 전기적 단독 시험

전원과 I/O 전압을 멀티미터·오실로스코프·logic analyzer로 먼저 확인한다.

1. Camera 전원과 GND
2. FPGA XCLK
3. RESET/PWDN
4. SCCB ACK와 Camera ID read-back
5. PCLK, VSYNC, HREF 활동
6. 알려진 해상도의 line/frame pixel count

5V 신호를 FPGA GPIO에 직접 연결하지 않는다. Camera 전원을 FPGA GPIO에서 공급하지 않는다.

## 3. DVP RX simulation

`tb_risk_zero_camera_dvp_rx`는 작은 정상 frame과 line 폭이 짧은 frame을 주입한다.

- 정상 frame: 좌표·pixel·frame count와 geometry valid
- 비정상 frame: geometry error
- Vision disabled: pixel 무시

현재 수신기는 Camera PCLK domain의 GRAY8 byte capture만 담당한다. 카메라가 YUV/RGB를 출력하면 별도 unpack/grayscale 단계가 필요하다. processing clock으로 전달할 때는 asynchronous FIFO를 추가한다.

`risk_zero_camera_xclk`는 100 MHz system clock에서 정확히 분주되는 25 MHz 기본 XCLK와 disable 시 LOW 출력을 제공한다. 이는 simulation 단계의 구현값이며, 레벨 변환·핀 배치·실측 파형이 확인되기 전에는 Camera 연결 완료로 간주하지 않는다.

## 4. ILA 시험

핀맵과 timing constraint가 확정된 뒤 다음 신호를 ILA로 확인한다.

- Camera PCLK
- VSYNC/HREF
- 처음과 마지막 line의 pixel count
- frame width/height
- frame boundary
- `geometry_error`

Camera 데이터시트의 setup/hold를 기준으로 PCLK와 input delay constraint를 작성한다.

## 5. Vision 연결

처음에는 `160×120 GRAY8`로 고정하고 다음 순서로 하나씩 연결한다.

1. DVP RX
2. async pixel FIFO 또는 PCLK streaming pipeline
3. `B_ref` BRAM
4. 기존 motion core의 absolute difference·threshold·bbox 누적
5. 3×3 zone과 timeline
6. `B_end` 비교
7. result register
8. Snapshot buffer

기존 AXI pixel write와 UDP 재조립은 직접 DVP 경로에서 제거 대상이다. motion core의 픽셀 연산 자체만 재사용한다.

## 6. Door Hub 연결

Safety 제어면과 Vision 데이터면을 분리한다.

- GPIO/toggle: heartbeat, auth, request, ack, 직접 안전 상태
- SPI: EVENT_START/END, event_id, result, status, Snapshot

PIR 반복 입력은 같은 방문에서 새 `event_id`를 만들지 않는다. 방문 종료는 PIR LOW와 FPGA의 연속 미검출 조건을 함께 사용한다.

## 통과 기록

실험마다 commit SHA, Vivado 버전, Camera 모델, 모듈 회로도 revision, 핀맵, 해상도·포맷·PCLK, WNS, LUT/FF/BRAM/DSP, latency, 측정 장비와 결과를 Markdown으로 남긴다. 코드 작성과 simulation, 합성, 실물 시험을 별도로 표시한다.

### 2026-09-03 RTL simulation

- 기준 commit: `f3a7619`
- 도구: AMD Vivado 2025.2 XSIM, Windows
- 명령: `vivado -mode batch -source fpga/arty-a7-100t/vivado/run_rtl_tests.tcl`
- PASS: `tb_risk_zero_motion_core`, `tb_risk_zero_motion_axi_lite`, `tb_risk_zero_safety_gate_fsm`, `tb_risk_zero_camera_dvp_rx`
- 범위: behavioral RTL simulation만 완료. 새 DVP Block Design·합성·timing·실물 Camera/Arty 시험은 미완료

### 2026-09-03 Camera XCLK simulation

- Camera 후보 확정: Voltly `VLT-CAM003`, OV7670, FIFO 없음
- 구현: parameterized 100 MHz → 25 MHz integer divider, disabled LOW
- PASS: `tb_risk_zero_camera_xclk`, Windows AMD Vivado 2025.2 XSIM
- 범위: behavioral RTL simulation만 완료. Camera I/O 전압·level shifting·XDC·실측 XCLK는 미완료

### 2026-09-03 팀원 Camera RTL 선별 반영

- 반영: open-drain intent SCCB master, OV7670 PID/VER probe, parameterized YUV422 Y-byte 추출, Gray-pointer async FIFO
- 수정: OV7670 register read를 `STOP → 새 START`가 있는 두 transmission으로 변경
- 제외: 실물 검증 전 48-write init table, 전체 candidate XDC/top, 고정 24 MHz/QVGA/SPI pin 계약
- PASS: `tb_risk_zero_sccb_master`, `tb_risk_zero_ov7670_id_probe`, `tb_risk_zero_camera_yuv422_y_extract`, `tb_risk_zero_async_fifo`
- 회귀: Windows AMD Vivado 2025.2 XSIM 총 9/9, FPGA Python tests 17/17
- 합성: 신규 primitive 4개 Artix-7 OOC synthesis 오류·경고 0건, async FIFO distributed RAM 추론 확인
- 범위: 독립 primitive simulation·OOC synthesis 완료. top 연결·전체 place/route/timing·실물 SCCB/DVP 시험은 미완료
- 하드웨어 상태: level shifting 또는 보호 저항 준비 전까지 배선 시험 중단
