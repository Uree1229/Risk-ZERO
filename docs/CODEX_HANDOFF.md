# RISK-ZERO 새 PC·Codex 인수인계

- 인수인계 기준일: 2026-08-26
- GitHub: <https://github.com/Uree1229/Risk-ZERO>
- 기본 브랜치: `main`
- 프로젝트 단계: 캡스톤 MVP 소스 구현, FPGA PC toolchain 검증, XIAO 펌웨어 빌드·업로드 완료; OV3660 하드웨어 장애로 실물 통합 미검증

## 한 문장으로 설명

XIAO ESP32S3 Sense 또는 AI Thinker ESP32-CAM이 수집한 현관 영상을 Arty A7-100T로 전달하고, FPGA에서 움직임 중심점과 동선을 계산해 웹·모바일에서 이벤트와 후처리 영상을 확인하는 시스템이다. 현재 연결한 카메라 보드는 OV3660이 달린 XIAO ESP32S3 Sense다. 음성 도어락 요청의 음성·입모양 일치 검증 MVP도 저장소에 함께 유지한다.

## 새 Codex가 먼저 할 일

저장소 루트에서 다음 상태를 확인한다.

```powershell
git status --short
git branch --show-current
git log -5 --oneline
```

그다음 아래 문서를 순서대로 읽는다.

1. `AGENTS.md` — 작업 중 반드시 지킬 경계
2. `docs/implementation-status.md` — 구현·미구현 구분
3. `fpga/arty-a7-100t/README.md` — FPGA 구조와 레지스터
4. `fpga/arty-a7-100t/BOARD_BRINGUP.md` — 실제 보드 구동 순서
5. `firmware/esp32-cam/README.md` — 카메라 설정과 전송 규격
6. `docs/HARDWARE_TEST_2026-08-26.md` — Windows PC 검증과 XIAO 카메라 장애 로그

새 작업을 시작할 때는 문서의 완료 표시를 그대로 믿기보다 코드와 테스트 결과를 대조한다. 사용자에게 보고할 때는 `코드 작성`, `PC 테스트 통과`, `실장치 확인`을 구분한다.

## 현재 데이터 흐름

```text
XIAO ESP32S3 Sense (기본) 또는 AI Thinker ESP32-CAM
  ├─ /capture, :81/stream, /health
  └─ QVGA JPEG → 160×120 GRAY8 → RZFP/1 UDP 5005
                                     ↓
Arty A7-100T (xc7a100tcsg324-1)
  └─ MicroBlaze UDP 재조립 → motion RTL → 중심점·bbox·동선 정책
                                     ↓
HTTP /trajectory, schemaVersion=fpga-motion/1
                                     ↓
웹 모니터 → 추후 DB 저장 → 모바일 이벤트·캘린더·영상 화면
```

분석과 판정은 하드웨어 계층에서 끝내는 것이 현재 설계 원칙이다. 웹과 모바일에는 하드웨어가 만든 수치와 추후 생성될 후처리 영상 파일만 전달한다. 현재 구현된 FPGA HTTP 출력은 수치 JSON이며, 후처리 영상 파일을 DB와 모바일 상세 화면까지 연결하는 작업은 남아 있다.

## 저장소 구성

| 경로 | 역할 | 상태 |
| --- | --- | --- |
| `firmware/esp32-cam` | 카메라, 웹 스트림, GRAY8 UDP 송신 | XIAO build/upload·USB·PSRAM 통과, OV3660 probe 실패 |
| `fpga/arty-a7-100t/rtl` | 배경 차분·중심점용 AXI4-Lite RTL | Vivado 2025.2 RTL simulation 2개 통과 |
| `fpga/arty-a7-100t/software` | MicroBlaze lwIP·HTTP·동선 처리 | Vitis 2025.2 DDR ELF build 통과, 실물 미검증 |
| `fpga/arty-a7-100t/vivado` | BRAM·DDR Block Design, 합성·bitstream Tcl | 두 profile bitstream/XSA 및 timing 통과 |
| `edge/risk_zero_trajectory` | 동선 정책·PC DEMO·카메라 확인 | 단위 테스트 완료 |
| `edge/risk_zero_av` | 음성·입모양 검증 정책 DEMO | 실제 AI 모델 미연결 |
| `web` | 동선·시청각 모니터와 API | 빌드·렌더·API 테스트 완료 |
| `mobile` | 캘린더·이벤트·영상·설정·SQLite | MVP 코드와 단위 테스트 구성 |
| `docs` | 설계·정책·DB·다이어그램·스크린샷 | 현재 문서 모음 |

## 구현된 핵심 기능

- ESP32-CAM JPEG 캡처, MJPEG 스트림, 상태 API와 FPGA UDP 송신
- 160×120 GRAY8 프레임을 1,200byte씩 16개 RZFP/1 패킷으로 전송
- MicroBlaze의 out-of-order UDP 재조립과 완성 프레임 선별
- FPGA 선택적 배경 갱신, 차이 임계값, 픽셀 수, 좌표 합, bbox
- 중심점, 구역, 체류시간, 누락 프레임과 빠른 재접근 계산
- `fpga-motion/1` HTTP JSON과 웹의 1초 polling·동선 표시
- 정상 배송, 사각지대, 재접근, 인원 불일치, 장시간 체류, 추적 불가 DEMO
- 모바일 이벤트 캘린더·상세 조회·영상 재생 자리·설정과 SQLite v4
- 시청각 검증용 challenge, PASS/BLOCK/INCONCLUSIVE, nonce 재사용 차단과 `MockActuator`

## 구현되지 않았거나 검증되지 않은 것

- XIAO OV3660 카메라 초기화, Wi-Fi 연결, `/health`·capture·stream과 30분 연속 시험
- Arty에 DDR bitstream/ELF를 실제 program하고 MIG calibration·UART를 확인하는 작업
- `ESP32-CAM → Arty → HTTP → 웹` 실장치 엔드투엔드
- 후처리 동영상 파일의 자동 생성·전송·DB 저장·모바일 재생 연결
- 사람 분류, 다중 객체 분리·re-ID, 가림 대응
- 급격한 조명 변화·카메라 흔들림·택배와 사람의 정지 전경 구분
- SyncNet·TalkNet·ASVspoof·ASR 같은 실제 시청각 AI
- 실제 도어락 제어, 장치 인증·서명, 모델 정확도 측정
- 현재 주제 기준 APK 재빌드와 배포

현재 화면과 점수는 흐름 확인용 DEMO다. 이를 실제 사람 인식, 범죄 예측 또는 상용 보안 성능이라고 설명하면 안 된다.

## 새 노트북 준비

공통 개발에는 다음 도구가 필요하다.

- Git
- Python 3.11 이상
- Node.js 22.13 이상
- pnpm 11 계열
- VS Code 또는 다른 편집기

ESP32 하드웨어 작업에는 추가로 다음 도구가 필요하다.

- VS Code PlatformIO 또는 PlatformIO CLI

Arty FPGA vendor tool 작업에는 추가로 다음 도구가 필요하다.

- Artix-7을 지원하는 무료 Vivado
- Vivado와 호환되는 Vitis
- Digilent Vivado board files
- Arty A7-100T USB-JTAG 드라이버와 115200bps UART terminal

AMD Vivado/Vitis 2025.2는 x86-64 Windows와 지정 Linux 배포판을 지원하고 macOS는 지원 OS 목록에 없다. 따라서 Mac에서는 Git, Python, 웹·모바일, ESP32 작업을 진행하고, Vivado/Vitis 합성·구현과 Arty programming은 기존 Windows PC 또는 지원되는 x86-64 Linux PC에서 수행한다. 기준은 [AMD Vivado 2025.2 지원 OS](https://docs.amd.com/r/2025.2-English/ug973-vivado-release-notes-install-license/Supported-Operating-Systems)다.

macOS에서 저장소를 준비한다.

```bash
git clone https://github.com/Uree1229/Risk-ZERO.git
cd Risk-ZERO

cd web
pnpm install --frozen-lockfile

cd ../mobile
pnpm install --frozen-lockfile

cd ..
cp firmware/esp32-cam/include/config.example.h firmware/esp32-cam/include/risk_zero_config.h
```

`risk_zero_config.h`에는 로컬 Wi-Fi와 Arty IP만 기록하고 커밋하지 않는다. `.env`, 촬영 영상, 참여자 정보와 장치 비밀키도 GitHub에 올리지 않는다.

## PC에서 먼저 확인할 테스트

저장소 루트에서 실행한다.

```powershell
python -m unittest discover -s edge/tests -v
python -m unittest discover -s fpga/arty-a7-100t/tests -v

cd web
pnpm test
pnpm lint

cd ../mobile
pnpm test
pnpm typecheck
pnpm verify:schema
```

현재 보고 기준은 Edge 41개, FPGA 프로토콜·reference·asset 13개, 웹 렌더·API 11개 테스트 통과다. 새 노트북에서는 의존성이나 도구 버전이 다르므로 반드시 다시 실행해 결과를 갱신한다.

Arty 없이 웹 연결 화면만 확인할 때는 다음 에뮬레이터를 사용한다.

```powershell
python fpga/arty-a7-100t/tools/fpga_status_emulator.py
```

웹의 보드 주소에 `127.0.0.1:8081`을 입력한다.

## 2026-08-26 FPGA PC 검증 결과

- AMD Vivado/Vitis 2025.2와 Digilent Arty A7-100 board part 확인
- motion core와 AXI4-Lite 독립 address/data channel RTL simulation 통과
- BRAM profile synthesis·implementation·bitstream·XSA 통과, route WNS `+0.543579ns`
- 64KB heap을 유지한 BRAM Vitis link는 256KB를 107,864byte 초과함을 확인
- 기능·heap을 줄이지 않고 256MB DDR3L, 32KB I/D cache profile 추가
- DDR profile synthesis·implementation·bitstream·XSA 통과, route WNS `+0.998833ns`
- Vitis standalone/lwIP BSP와 RISK-ZERO ELF build 통과
- ELF 할당 크기: text 187,752byte, data 2,166byte, bss 3,984,346byte
- ELF vector는 local BRAM, 코드·데이터·BSS·64KB heap·8KB stack은 DDR `0x80000000` 영역에 배치

이 결과는 PC toolchain 검증이다. Arty 프로그램, MIG calibration, UART, Ethernet, ESP32 UDP는 아직 실장치 확인이 아니다.

`fpga/arty-a7-100t/vitis/build_ddr_app.py`는 성공한 수동 Vitis 세션을 자동화했다. Windows `subst` 경로가 긴 실제 경로로 되돌아가지 않도록 `Path.resolve()`를 사용하지 않는다. 최종 스크립트는 빈 `vitis-workspace-ddr-handoff`에서 platform/BSP/lwIP/application/ELF 전체 build를 재현했다.

## 2026-08-26 XIAO ESP32S3 Sense 실장치 결과

- PlatformIO Core 6.1.19, Espressif32 platform 7.0.1, Arduino-ESP32 2.0.17 설치
- `xiao-esp32s3-sense` build와 COM3 upload 통과, flash hash 확인
- ESP32-S3 USB Serial/JTAG 부팅과 8MB OPI PSRAM 확인
- 공식 XIAO 핀맵 사용: `PWDN=-1`, `RESET=-1`, `XCLK=10`, `SDA=40`, `SCL=39`
- B2B 커넥터와 OV3660 리본을 반복 재체결했으나 `Camera probe failed with error 0x105 (ESP_ERR_NOT_FOUND)` 반복
- 카메라 probe가 Wi-Fi보다 먼저 실패하므로 네트워크 문제는 아님
- XIAO 본체는 정상이고 OV3660 모듈/FPC/커넥터/Sense 확장보드 불량 가능성이 높음

다음 실장치 단계는 호환 카메라 모듈 교체, 그래도 실패하면 Sense 확장보드 교체다. 상세 로그와 Mac 명령은 `docs/HARDWARE_TEST_2026-08-26.md`에 있다. 실제 Wi-Fi 자격 증명과 장치 사진은 GitHub에 올리지 않았다.

## 다음 작업 순서

1. Mac에서 PlatformIO를 설치하고 `risk_zero_config.h`를 로컬로 다시 만든다.
2. 정상 OV3660 모듈을 XIAO에 연결하고 sensor PID, Wi-Fi, `/health`, `/capture`, stream을 확인한다.
3. 30분 연속 스트림을 확인한다.
4. Vivado/Vitis가 설치된 지원 Windows/Linux PC에서 아래 FPGA 자동화와 Arty 실물 시험을 진행한다.

아래 순서를 건너뛰지 않는다.

```powershell
vivado -mode batch -source fpga/arty-a7-100t/vivado/run_rtl_tests.tcl
vivado -mode batch -source fpga/arty-a7-100t/vivado/create_arty_bram_system.tcl
vivado -mode batch -source fpga/arty-a7-100t/vivado/build_arty_system.tcl
vivado -mode batch -source fpga/arty-a7-100t/vivado/create_arty_ddr_system.tcl
vivado -mode batch -source fpga/arty-a7-100t/vivado/build_arty_ddr_system.tcl
vitis -s fpga/arty-a7-100t/vitis/build_ddr_app.py
```

1. 재현이 필요할 때 RTL과 DDR build 명령이 PASS인지 확인한다.
2. DDR bitstream과 ELF로 Arty를 program한다.
3. MIG calibration과 MicroBlaze 실행을 확인한다.
4. UART에서 IP, UDP 5005, HTTP 80 준비 로그를 확인한다.
5. ESP32 카메라 보드의 `risk_zero_config.h`에서 FPGA UDP를 활성화하고 업로드한다.
6. ESP32 `/health`의 `framesSent`와 Arty `/trajectory`의 `completedFrames` 증가를 함께 확인한다.
7. 웹에서 실제 Arty IP를 입력하고 중심점 경로를 확인한다.

상세 연결과 장애별 점검은 `fpga/arty-a7-100t/BOARD_BRINGUP.md`를 따른다. Vivado `build/` 산출물은 용량과 재현성 때문에 커밋하지 않고, 성공한 커밋 SHA·Vivado 버전·명령·WNS·사용량·보드 사진·UART 로그를 별도 Markdown 시험 기록으로 남긴다.

## 실장치 확인 후 이어갈 개선 순서

1. 정상 이동·택배 놓기·숨기·재접근·2인 이동·조명 변화·카메라 흔들림을 각각 반복 촬영한다.
2. 실제 중심점 오차, UDP 완성 프레임률과 처리 FPS를 기록한다.
3. 3×3 노이즈 제거를 추가한다.
4. connected-component로 최소 두 움직임 후보를 분리한다.
5. AXI pixel write가 병목일 때만 AXI Stream/DMA로 교체한다.
6. 후처리 영상·동선 이벤트를 기존 API와 DB에 저장한다.
7. 모바일 상세 화면에서 실제 영상과 수치를 조회한다.
8. 데이터가 확보된 후 임계값과 구역·체류시간 정책을 조정한다.

YOLO나 복잡한 사람 분류부터 추가하지 않는다. A7-100T에서는 실측 병목과 오탐 원인을 먼저 확인한 뒤 기능을 늘린다.

## 유지해야 할 결정

- Block Design·주변장치 분리 검증은 256KB local BRAM profile로 시작한다.
- 전체 standalone/lwIP 애플리케이션은 실측 크기 때문에 256MB DDR3L profile과 32KB I/D cache를 사용하며, 기능이나 64KB heap을 임의로 줄이지 않는다.
- Ethernet은 DP83848J MII, 10/100Mbps, PHY 주소 1, 25MHz reference clock 설정이다.
- ESP32-CAM과 Arty는 같은 실험용 공유기에 연결하고 스트림을 인터넷에 공개하지 않는다.
- 입력 누락·낮은 품질·시간 동기화 실패·만료·재사용 요청은 문을 열지 않는 fail-closed 정책을 유지한다.
- 물리 도어락 대신 `MockActuator`를 유지한다.
- 사용자가 다시 요청하기 전까지 APK를 빌드하거나 GitHub Release에 업로드하지 않는다.

## 새 Codex에 전달할 시작 문장

다음 문장을 새 작업에 그대로 전달해도 된다.

> 이 저장소의 `AGENTS.md`, `docs/CODEX_HANDOFF.md`, `docs/HARDWARE_TEST_2026-08-26.md`를 먼저 전부 읽고 `git status`와 최신 커밋을 확인해줘. 기존 작업을 다시 만들지 말고 구현·PC 테스트·실장치 검증을 구분해서 이어가자. 이 Mac에서는 우선 PlatformIO 환경을 확인하고 정상 OV3660 모듈로 XIAO ESP32S3 Sense 카메라 probe부터 재시도해줘. Vivado/Vitis 2025.2는 macOS 지원 대상이 아니므로 FPGA vendor tool 작업은 지원 Windows/Linux PC로 넘겨줘. APK는 내가 명시적으로 요청하기 전에는 빌드하거나 업로드하지 마.
