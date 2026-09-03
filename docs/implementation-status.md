# RISK-ZERO 현재 구현 현황

- 기준일: 2026-09-03
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
| Safety Gate | auth/request/heartbeat toggle, 2-FF sync, auth 만료·1회 소비, Reed·Tamper·E-stop, pulse 상한 RTL과 self-checking Icarus·Vivado XSIM 통과 | 보드 미검증 |
| DVP RX | Camera PCLK domain GRAY8 byte·좌표·frame geometry 정상/오류 Icarus·Vivado XSIM 통과 | Camera·핀·XDC·ILA 미검증 |
| Motion core | background difference, threshold, count·sum·bbox 기존 RTL | DVP stream 직접 연결 미구현 |
| Camera control | Voltly `VLT-CAM003` OV7670 실물 식별. parameterized 25 MHz XCLK, SCCB read/write, PID/VER probe, YUV422 Y 추출, async FIFO RTL·Vivado XSIM 통과 | 12.5MHz 저항 보호 probe를 Arty에 프로그램. 기존 판독은 ID 불일치였고 PID 분류용 진단 bitstream의 최종 LED 판독 대기 중. level shifting·전압 실측·init table·DVP 연결은 미완료 |
| Vision 기능 | 기존 중심점·동선 정책 DEMO 유지 | 3×3 zone·timeline·B_end·Snapshot의 FPGA 통합 미구현 |
| Door Hub | C++ 상태 코어와 Python 기준 구현, event id·stale result·LED Safety 불변식 작성 | PIR·SPI·GPIO·Wi-Fi 어댑터 미작성 |
| Result/Snapshot link | packet 필드 초안 | SPI register·CRC·DATA_READY 미결정·미구현 |
| Web/Mobile | `door-hub-event/1`, Door Hub 화면, D1 API·migration, 모바일 SQLite v5·이벤트 변환 구현 | 실제 Door Hub와 Snapshot 파일 미연결 |
| AV 검증 | challenge·정책·MockActuator·수집 DEMO | 실제 SyncNet/TalkNet/ASVspoof/ASR 미연결 |

## 이전 구조에서 검증된 참고 자산

- ESP32 카메라 JPEG/MJPEG와 160×120 GRAY8 RZFP UDP source
- MicroBlaze lwIP UDP 재조립·AXI motion·HTTP JSON source
- Vivado 2025.2 BRAM·DDR profile bitstream/XSA와 Vitis DDR ELF PC build
- 기존 motion/AXI simulation과 Python protocol/reference 테스트
- Edge·웹·모바일의 이전 DEMO와 단위 검사 자산

이 결과들은 삭제하지 않는다. 단, 새 DVP 직접 입력과 Door Hub SPI 구조의 실장 검증으로 계산하지 않는다.

## 이번 변경의 검증

- FPGA Python protocol/reference/asset 테스트 18개 통과
- GitHub Actions Icarus Verilog에서 motion core·AXI wrapper·새 Safety Gate·DVP RX simulation 통과
- 성공 run: <https://github.com/Uree1229/Risk-ZERO/actions/runs/33165372737>
- Windows Vivado 2025.2에서 motion core·AXI wrapper·새 Safety Gate·DVP RX XSIM 4개 통과(2026-09-03, 기준 commit `f3a7619`)
- 같은 환경에서 parameterized 25 MHz Camera XCLK와 SCCB·OV7670 ID·YUV422·async FIFO를 포함한 전체 XSIM 9개 통과
- 신규 SCCB·OV7670 ID·YUV422·async FIFO primitive의 Artix-7 OOC synthesis 통과(오류·경고 0건, FIFO distributed RAM 추론 확인)
- 저항 보호용 12.5MHz XCLK·SCCB-only OV7670 ID probe top과 JA 전용 XDC 추가. 최신 PID 분류 build의 Vivado 합성·배치·배선·bitstream 생성 통과, 내부 100MHz WNS `+4.790ns`(외부 I/O delay는 실측 전)
- 팀원 Dashboard ZIP은 선별 검토했다. 상세 채택·제외 근거는 `docs/TEAM_CONTRIBUTION_REVIEW_2026-09-03.md`에 기록했다.
- 새 구조의 Camera top 연결·Block Design·전체 place/route/timing은 미실행
- 실제 Camera와 Arty board의 최소 저항 배선 및 JTAG programming 실행. 기존 결과는 LD4 OFF/LD5 ON/LD6 OFF였고, 새 PID 분류 bitstream 프로그램 성공 후 LD4~LD7 사용자 판독 대기 중
- Edge 전체 45개, 웹 13개, 모바일 24개 테스트와 SQLite schema 검사 통과

## 다음 우선순위

1. `VLT-CAM003` 모듈 I/O 전압·level shifting·Arty 핀맵·출력 포맷을 확정한다.
2. 보호 회로 준비 뒤 XCLK를 실측하고 SCCB Camera ID·PCLK·VSYNC·HREF와 frame geometry를 측정한다.
3. 현재 독립 검증된 SCCB ID·YUV422·async FIFO를 top에 연결하고 실측값으로 init table을 확정한다.
4. DVP stream을 motion core에 연결하고 `B_ref`를 검증한다.
5. noise filter·3×3 zone·timeline·B_end·Snapshot buffer를 구현한다.
6. Door Hub 상태 코어에 PIR·Safety GPIO·Vision SPI·Wi-Fi 어댑터를 연결한다.
7. LED로 전체 경로를 통합하고 실제 result/Snapshot을 현재 API에 전송한다.

## 주장하지 않는 범위

- FPGA가 사람·신원·범죄 의도를 AI로 판정한다.
- 여러 사람을 안정적으로 분리·재식별한다.
- 실제 도어락과 상용 안전 성능이 검증됐다.
- 새 DVP 구조의 FPS·latency·전력·정확도가 측정됐다.

APK는 사용자가 다시 요청할 때까지 빌드하거나 업로드하지 않는다.
