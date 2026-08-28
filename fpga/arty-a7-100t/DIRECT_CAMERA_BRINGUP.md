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
