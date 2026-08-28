# Arty A7-100T 보드 구동 순서

> **이전 UDP 경로:** 이 문서는 `ESP32-CAM → UDP → MicroBlaze → HTTP` 참고 구현의 구동 순서다. 현재 외부 DVP Camera 직접 입력은 [DIRECT_CAMERA_BRINGUP.md](DIRECT_CAMERA_BRINGUP.md)를 따른다.

이 문서는 실제 보드에서 `ESP32-CAM → UDP → MicroBlaze → motion RTL → HTTP` 경로를 처음 확인하는 절차다. BRAM profile로 RTL과 주변장치를 먼저 검증하고, 전체 lwIP 애플리케이션은 측정된 크기 때문에 DDR3L profile에 올린다.

AMD Vivado/Vitis 2025.2는 x86-64 Windows와 지정 Linux 배포판을 지원하며 macOS는 지원 OS 목록에 없다. Mac에서는 ESP32와 일반 소프트웨어 작업만 진행하고, 이 문서의 Vivado/Vitis·Arty programming 단계는 지원되는 Windows/Linux PC에서 실행한다.

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

## 4. BRAM 크기 확인

생성된 BRAM XSA, lwIP raw API, Vitis lwIP echo server template의 `platform.c`/`platform.h`, `software/src`, 64KB heap을 사용해 먼저 크기를 확인한다. Vivado/Vitis 2025.2 실측에서는 256KB local BRAM을 107,864byte 초과했다.

따라서 기능을 삭제하거나 heap을 임의로 줄이지 않고 아래 DDR3L profile로 전환한다. BRAM bitstream/XSA는 Block Design과 주변장치 검증 산출물로 유지한다.

## 5. DDR3L Block Design·bitstream·XSA

Windows에서 저장소 경로에 공백이 있으면 Vivado/Vitis의 경로 길이 제한을 피하도록 임시 드라이브를 매핑한다. 다음 예시는 저장소 루트에서 실행한다.

```powershell
subst R: "$PWD"
Set-Location R:\
vivado -mode batch -source fpga/arty-a7-100t/vivado/create_arty_ddr_system.tcl
vivado -mode batch -source fpga/arty-a7-100t/vivado/build_arty_ddr_system.tcl
```

DDR profile은 다음을 추가한다.

- 256MB DDR3L MIG, 주소 `0x80000000`–`0x8fffffff`
- MicroBlaze 32KB instruction/data cache와 128KB local BRAM
- cached AXI SmartConnect 경로
- 100MHz CPU·peripheral clock과 25MHz Ethernet PHY reference clock

통과하면 `fpga/arty-a7-100t/build/risk_zero_arty_a7_100t_ddr.xsa`와 `build/reports-ddr`가 생성된다. Vivado 2025.2 검증 기준 route WNS는 `+0.998833ns`였다.

## 6. Vitis DDR 애플리케이션

Vitis Python 스크립트가 standalone MicroBlaze/lwIP platform, BSP와 애플리케이션을 생성한다. Windows 경로 처리 최종 수정 후 빈 workspace에서 전체 자동 build와 ELF 생성을 재현했다.

```powershell
vitis -s R:/fpga/arty-a7-100t/vitis/build_ddr_app.py
```

스크립트는 lwIP echo server template의 `platform.c`, `platform.h`와 linker 지원을 유지하고 `software/src`를 가져온다. 예외 vector는 local BRAM에, `.text`, `.data`, `.bss`, 64KB heap과 8KB stack은 DDR에 배치한다. 기본 workspace에 이미 같은 component가 있다면 비어 있는 경로를 지정한다.

```powershell
$env:RISK_ZERO_VITIS_WORKSPACE = 'R:/fpga/arty-a7-100t/build/vitis-workspace-ddr-rebuild'
vitis -s R:/fpga/arty-a7-100t/vitis/build_ddr_app.py
```

성공 기준은 `build/vitis-workspace-ddr/risk_zero_app_ddr/build/risk_zero_app_ddr.elf` 생성이다. Vitis 2025.2 최종 자동 build의 ELF 할당 크기는 text 187,752byte, data 2,166byte, bss 3,984,346byte였다.

작업을 마치면 저장소 원래 경로로 돌아간 뒤 임시 매핑을 해제할 수 있다.

```powershell
Set-Location C:\
subst R: /D
```

## 7. 보드 단독 시험

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

## 8. ESP32-CAM 연결

ESP32-CAM의 `risk_zero_config.h`에서 다음 값을 설정하고 다시 업로드한다.

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
| Vitis가 긴 경로에서 멈춤·실패 | 저장소 루트를 `subst`로 짧은 드라이브에 매핑 |
| DDR 실행 직후 멈춤 | MIG calibration, reset, linker section 주소 확인 |
| UDP frame이 완성되지 않음 | ESP32 `/health`, IP 대역, 16개 chunk 손실 확인 |

물리 보드에서 위 결과가 확인되기 전에는 `FPGA 실시간 동선 추적 완료`라고 발표하지 않는다.
