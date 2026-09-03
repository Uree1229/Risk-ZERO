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

### 2.1 보호 저항 기반 최소 ID probe

2026-09-03 현재 level shifter와 멀티미터가 없으므로 이 연결은 실험용
bring-up에만 사용한다. OV7670 센서의 정상 I/O 전원 상한은 3.0V이며 Arty
Pmod는 3.3V이므로 FPGA에서 Camera로 가는 신호를 직접 연결하지 않는다.
영상 데이터 선은 아직 연결하지 않고 `XCLK`, `SIOC/SCL`, `SIOD/SDA`만
시험한다.

모든 전원을 뺀 상태에서 다음과 같이 연결한다. 아래 `JA1` 등의 이름은
커넥터 위치를 눈대중으로 세지 말고 Arty 보드 실크와 공식 Pmod pin 번호로
확인한다.

| 기능 | Arty A7-100T | VLT-CAM003 | 저항 네트워크 |
| --- | --- | --- | --- |
| 전원 | JA6 또는 JA12 `3.3V` | `3.3V` | 직접 연결 |
| 공통 접지 | JA5 또는 JA11 `GND` | `GND` | 직접 연결. 아래 모든 분압 접지도 여기에 연결 |
| Camera clock | JA1 | `XCLK` | JA1 → 220Ω → XCLK 노드, XCLK 노드 → 1kΩ → GND |
| SCCB clock | JA2 | `SIOC` 또는 `SCL` | JA2 → 1kΩ → SIOC 노드, SIOC 노드 → 4.7kΩ → GND |
| SCCB data | JA3 | `SIOD` 또는 `SDA` | JA3와 SIOD 노드를 직접 연결, 3.3V → 2kΩ → SIOD 노드, SIOD 노드 → 4.7kΩ → GND |
| Reset 해제 | 연결하지 않음 | `RESET`/`RET` | 3.3V → 2kΩ → RESET 노드, RESET 노드 → 4.7kΩ → GND |
| Power-down 해제 | 연결하지 않음 | `PWDN` | GND에 직접 연결 |

`D[7:0]`, `VS/VSYNC`, `HS/HREF`, `PCLK`는 이 단계에서 연결하지 않는다.
XCLK 배선은 가능한 한 5cm 이내로 짧게 하고 Camera와 Arty의 GND를 반드시
공유한다. 저항 분압은 최종 제품의 level shifter를 대신하지 않는다.

최소 probe bitstream은 다음 명령으로 다시 만들 수 있다.

```powershell
vivado -mode batch -source fpga/arty-a7-100t/vivado/build_ov7670_probe.tcl
```

- top: `risk_zero_ov7670_probe_top`
- XCLK: 첫 breadboard 시험용 12.5MHz
- JA1: XCLK, JA2: SIOC/SCL, JA3: open-drain SIOD/SDA
- BTN0: reset 후 자동 재검사
- LD4: PID/VER 일치, LD5: PID `0xFF`(SDA high 고정), LD6: PID `0x00`(SDA low 고정), LD7: 그 밖의 ID 불일치 또는 내부 timeout
- PID/VER 기대값: `0x76`/`0x73`

2026-09-03 Windows Vivado 2025.2에서 최신 PID 분류 top의 합성·배치·배선·
bitstream 생성과 DRC가 통과했고 내부 100MHz 경로의 route WNS는 `+4.790ns`였다.
Arty A7-100T `xc7a100t` JTAG programming도 startup status `HIGH`로 성공했다.
Camera 실측 timing 전이므로 외부 I/O delay는 아직 sign-off하지 않았다.

Windows에서 Vivado 사용자 Tcl app 오류 `Common 17-356`이 발생하면 해당
프로세스에 `XILINX_LOCAL_USER_DATA=no`를 설정한다. 경로 정규화가 Windows
known-folder를 잘못 처리하면 build Tcl에는 FPGA 디렉터리, program Tcl에는
bitstream 절대 경로를 각각 `-tclargs`로 전달한다.

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
- 하드웨어 상태: 보호 저항 기반 최소 SCCB probe까지 진행했으며, 아래 최신 진단 결과 판독 대기

### 2026-09-03 OV7670 최소 SCCB 실기 진단

- 사용자 보고 기준 2.1의 저항 보호 배선을 완료했다. level shifter와 측정 장비가 없는 임시 시험이다.
- Arty A7-100T JTAG target `Digilent/210319B9B31CA`, `xc7a100t` programming 성공
- 기존 probe 판독: LD4 OFF, LD5 ON, LD6 OFF. PID `0x76` 불일치이며 LD6 OFF는 SCCB 상태 머신 완료만 뜻하고 Camera ACK를 증명하지 않는다.
- PID `0xFF`, `0x00`, 기타 불일치를 LD5/LD6/LD7로 분류하는 진단 top으로 갱신했다.
- 최신 진단 bitstream 합성·route·DRC 통과(WNS `+4.790ns`) 및 programming 성공
- 마지막 상태: 새 bitstream의 LD4~LD7 사용자 판독 대기
