# RISK-ZERO 현재 구현 현황

- 기준일: 2026-08-28
- 범위: 대학 캡스톤 MVP
- 현재 아키텍처: ESP32-S3 Door Hub + 외부 Parallel DVP Camera + Arty A7 Safety/Vision Domain
- 유지 기능: 웹·모바일 동선 DEMO와 음성·입모양 검증 정책 DEMO

## 이번에 반영된 결정

- XIAO ESP32-S3 Sense와 AI Thinker ESP32-CAM을 현재 Camera 경로에서 제거
- Camera DVP pixel stream을 Arty FPGA가 직접 수신
- FPGA 전체는 상시 구성, Camera·Vision만 event sleep/wake
- ESP32-S3 DevKitC는 PIR·event_id·Wi-Fi·authorization·result/Snapshot 중계 담당
- Safety와 Vision의 clock/reset/책임 분리
- Safety 제어는 toggle/GPIO, Vision result/Snapshot은 SPI 우선 검토
- 첫 수직 통합은 Solenoid가 아니라 LED

## 현재 구현 상태

| 영역 | source·PC 상태 | 실장 상태 |
| --- | --- | --- |
| Safety Gate | auth/request/heartbeat toggle, 2-FF sync, auth 만료·1회 소비, Reed·Tamper·E-stop, pulse 상한 RTL과 self-checking testbench | 새 interface Vivado simulation·보드 미검증 |
| DVP RX | Camera PCLK domain GRAY8 byte·좌표·frame geometry RTL과 정상/오류 testbench | Camera·핀·XDC·ILA 미검증 |
| Motion core | background difference, threshold, count·sum·bbox 기존 RTL | DVP stream 직접 연결 미구현 |
| Camera control | 요구 신호와 시험 순서 문서화 | 모델 미정, XCLK/SCCB/PWDN/RESET·async FIFO 미구현 |
| Vision 기능 | 기존 중심점·동선 정책 DEMO 유지 | 3×3 zone·timeline·B_end·Snapshot의 FPGA 통합 미구현 |
| Door Hub | 책임·상태·안전/데이터면 분리 문서화 | PIR·SPI·GPIO firmware source 미작성 |
| Result/Snapshot link | packet 필드 초안 | SPI register·CRC·DATA_READY 미결정·미구현 |
| Web/Mobile | DEMO, 캘린더·상세·영상 자리, DB/API 기존 구현 | 새 Door Hub 결과·Snapshot 미연결 |
| AV 검증 | challenge·정책·MockActuator·수집 DEMO | 실제 SyncNet/TalkNet/ASVspoof/ASR 미연결 |

## 이전 구조에서 검증된 참고 자산

- ESP32 카메라 JPEG/MJPEG와 160×120 GRAY8 RZFP UDP source
- MicroBlaze lwIP UDP 재조립·AXI motion·HTTP JSON source
- Vivado 2025.2 BRAM·DDR profile bitstream/XSA와 Vitis DDR ELF PC build
- 기존 motion/AXI simulation과 Python protocol/reference 테스트
- Edge 41개, 웹 렌더·API 11개, 모바일 단위·schema 검사 기록

이 결과들은 삭제하지 않는다. 단, 새 DVP 직접 입력과 Door Hub SPI 구조의 실장 검증으로 계산하지 않는다.

## 이번 변경의 검증

- FPGA Python protocol/reference/asset 테스트 15개 통과
- 새 RTL source와 testbench가 Vivado runner에 포함됨
- 현재 PC 셸에는 Vivado/iverilog가 없어 새 Safety·DVP behavioral simulation 미실행
- 실제 Camera와 Arty board 미연결

## 다음 우선순위

1. Vivado에서 `run_rtl_tests.tcl`을 실행해 Safety/DVP testbench를 실제 검증한다.
2. Parallel DVP Camera 모델·모듈 회로도·전압·핀맵·출력 포맷을 확정한다.
3. XCLK·SCCB Camera ID·PCLK·VSYNC·HREF와 frame geometry를 측정한다.
4. Camera controller, grayscale와 async pixel FIFO를 구현한다.
5. DVP stream을 motion core에 연결하고 `B_ref`를 검증한다.
6. noise filter·3×3 zone·timeline·B_end·Snapshot buffer를 구현한다.
7. Door Hub PIR event와 Safety GPIO·Vision SPI 통신을 구현한다.
8. LED로 전체 경로를 통합한 뒤 앱 결과·Snapshot을 연결한다.

## 주장하지 않는 범위

- FPGA가 사람·신원·범죄 의도를 AI로 판정한다.
- 여러 사람을 안정적으로 분리·재식별한다.
- 실제 도어락과 상용 안전 성능이 검증됐다.
- 새 DVP 구조의 FPS·latency·전력·정확도가 측정됐다.

APK는 사용자가 다시 요청할 때까지 빌드하거나 업로드하지 않는다.
