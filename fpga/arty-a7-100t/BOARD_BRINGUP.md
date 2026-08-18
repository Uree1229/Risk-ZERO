# Arty A7-100T 보드 구동 순서

이 문서는 실제 보드에서 `ESP32-CAM → UDP → MicroBlaze → motion RTL → HTTP` 경로를 처음 확인하는 절차다. 첫 시험에서는 DDR3를 사용하지 않고 256KB local BRAM에 애플리케이션을 올린다.

## 준비물

- Digilent Arty A7-100T와 USB-JTAG 케이블
- Arty Ethernet 케이블과 ESP32-CAM이 접속할 같은 공유기
- Artix-7을 지원하는 Vivado와 Vitis
- [Digilent Vivado board files](https://github.com/Digilent/vivado-boards)
- UART terminal, 115200bps, 8-N-1

Vivado에서 `get_board_parts *arty-a7-100*`가 한 개 이상 출력되어야 한다. 아무것도 출력되지 않으면 board files 설치가 먼저다.

## 1. RTL simulation

저장소 루트에서 실행한다.

```powershell
vivado -mode batch -source fpga/arty-a7-100t/vivado/run_rtl_tests.tcl
```

두 항목이 모두 `PASS`여야 한다.

- 배경 차분·정지 전경·중심점·bbox
- AXI4-Lite address-first와 data-first 쓰기

실패하면 Block Design으로 넘어가지 않는다.

## 2. BRAM Block Design 생성

```powershell
vivado -mode batch -source fpga/arty-a7-100t/vivado/create_arty_bram_system.tcl
```

스크립트가 자동으로 구성하는 블록은 다음과 같다.

- Classic MicroBlaze, 100MHz, 256KB LMB
- AXI Ethernet Lite, MII, RX/TX ping-pong buffer
- AXI Timer와 interrupt controller
- AXI UART Lite, 115200bps
- RISK-ZERO motion AXI4-Lite IP
- Ethernet PHY 25MHz reference clock

Digilent board flow가 MII·UART 핀을 제약하고 `constraints/risk_zero_arty_a7_100.xdc`가 E3 시스템 클럭, C2 reset, G18 PHY reference clock을 제약한다.

## 3. 합성·구현·XSA

```powershell
vivado -mode batch -source fpga/arty-a7-100t/vivado/build_arty_system.tcl
```

통과 기준:

- synthesis와 implementation 완료
- timing WNS가 0 이상
- bitstream 생성
- `fpga/arty-a7-100t/build/risk_zero_arty_a7_100t.xsa` 생성

사용량과 timing report는 `fpga/arty-a7-100t/build/reports`에 생성된다. 이 폴더는 Git에 올리지 않는다.

## 4. Vitis 애플리케이션

1. 생성된 XSA로 MicroBlaze standalone platform을 만든다.
2. lwIP raw API를 포함한 domain을 만든다.
3. Vitis lwIP echo server template의 `platform.c`, `platform.h`와 linker script를 유지한다.
4. `software/src` 파일을 애플리케이션 source에 추가한다.
5. linker의 `.text`, `.data`, `.bss`, heap, stack을 `microblaze_0_local_memory`에 배치한다.
6. heap은 우선 64KB로 두고 전체 이미지가 256KB를 넘지 않는지 확인한다.

256KB를 넘으면 기능을 삭제하거나 heap을 임의로 줄이지 않고 DDR3L profile을 추가한다.

## 5. 보드 단독 시험

Arty를 program한 뒤 UART에서 다음 형태의 로그가 나와야 한다.

```text
RISK-ZERO Arty IP: 192.168.0.40
RISK-ZERO UDP 5005 / HTTP 80 ready
```

같은 공유기에서 다음 주소를 조회한다.

```text
http://192.168.0.40/trajectory
```

첫 응답은 `schemaVersion: fpga-motion/1`이고 `backgroundReady`는 영상이 오기 전까지 `false`다.

## 6. ESP32-CAM 연결

ESP32-CAM의 `config.h`에서 다음 값을 설정하고 다시 업로드한다.

```cpp
#define RISK_ZERO_FPGA_UDP_ENABLED 1
#define RISK_ZERO_FPGA_IP "192.168.0.40"
#define RISK_ZERO_FPGA_PORT 5005
```

`/health`에서 `fpgaUdp.ready=true`와 `framesSent` 증가를 확인한다. Arty HTTP 응답에서는 `completedFrames`가 증가해야 한다.

## 중단 기준

| 증상 | 먼저 확인할 것 |
| --- | --- |
| board part 없음 | Digilent board files 설치 위치 |
| RTL simulation 실패 | motion core 또는 AXI wrapper 수정 후 재시험 |
| MII validation 실패 | `eth_mii` board connection과 AXI Ethernet Lite 선택 여부 |
| Ethernet link LED 꺼짐 | 케이블, 공유기, PHY reset, G18 25MHz 출력 |
| UART 출력 없음 | 115200bps, USB 포트, `stdout`가 UARTLite인지 확인 |
| XSA는 생성되지만 C build 초과 | linker map 확인 후 DDR3L profile로 전환 |
| UDP frame이 완성되지 않음 | ESP32 `/health`, IP 대역, 16개 chunk 손실 확인 |

물리 보드에서 위 결과가 확인되기 전에는 `FPGA 실시간 동선 추적 완료`라고 발표하지 않는다.
