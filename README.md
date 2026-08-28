# RISK-ZERO FPGA 현관 모니터·Safety Gate MVP

PIR로 방문 이벤트를 시작하고, 외부 Parallel DVP Camera의 픽셀을 Arty A7-100T가 직접 받아 움직임·동선을 계산하는 캡스톤 시제품입니다. ESP32-S3 Door Hub는 PIR·Wi-Fi·승인·결과 중계를 담당하고, FPGA Safety Domain은 영상처리와 독립적으로 문 개방 조건을 최종 검사합니다.

## 현재 아키텍처

```text
PIR → ESP32-S3 Door Hub → EVENT_START
                              ↓
External DVP Camera → Arty A7 Vision Domain → result/Snapshot → Door Hub → 앱

Door Hub heartbeat/auth/request ─┐
Reed #2 · Tamper · E-stop ───────┴→ Arty Safety Domain → 제한 pulse → LED
```

- Arty FPGA는 상시 구성 상태를 유지합니다.
- Safety Domain은 계속 동작하고 Camera·Vision Domain만 이벤트 기반으로 활성화합니다.
- Camera frame은 ESP32를 거치지 않고 FPGA에 직접 들어갑니다.
- Vision 결과는 문을 직접 열 수 없습니다.
- 첫 시연은 실제 actuator 대신 LED를 사용합니다.

카메라 모델, 전압, 핀맵, SPI mode·clock과 현장 임계값은 아직 결정하지 않았습니다. 실제 모듈 회로도·데이터시트와 측정 결과 없이 임의로 확정하지 않습니다.

## 현재 코드

| 경로 | 내용 |
| --- | --- |
| `fpga/arty-a7-100t/rtl/risk_zero_safety_gate_fsm.sv` | auth/request/heartbeat toggle, Reed·Tamper·E-stop, default-deny pulse |
| `fpga/arty-a7-100t/rtl/risk_zero_camera_dvp_rx.sv` | Camera PCLK domain DVP GRAY8 byte·frame geometry 수신 골격 |
| `fpga/arty-a7-100t/rtl/risk_zero_motion_core.sv` | 배경 차분, threshold, 픽셀 누적과 bbox |
| `firmware/door-hub/` | 핀·SPI와 분리된 event id·stale result·Safety 상태 코어 |
| `edge/risk_zero_door_hub/` | `door-hub-event/1` 기준 구현과 DEMO |
| `edge/risk_zero_trajectory/` | 동선 정책과 PC DEMO |
| `edge/risk_zero_av/` | 음성·입모양 검증 정책 DEMO |
| `web/` | Door Hub 모니터, D1 저장 API, 이전 동선·시청각 DEMO |
| `mobile/` | Door Hub 홈, 이벤트 캘린더·상세·영상·SQLite v5 MVP |

## 구현 경계

현재 DVP RX와 새 Safety 계약은 GitHub Actions Icarus Verilog simulation까지 통과했습니다. 새 아키텍처 기준 AMD Vivado XSIM·Block Design·합성·실물 보드 통합은 아직 수행하지 않았습니다.

이전 XIAO ESP32-S3 Sense/AI Thinker ESP32-CAM → RZFP UDP → MicroBlaze Ethernet 경로는 참고 구현으로 저장소에 남겨둡니다. 해당 구조의 Vivado/Vitis PC build 결과가 새 외부 Camera 직접 입력 구조를 검증한 것은 아닙니다.

실제 사람 분류, 범죄 의도·신원 판정, 다중 객체 re-ID와 상용 도어락 안전 성능은 현재 범위가 아닙니다. 화면 결과와 시청각 점수는 데이터 흐름 확인용 DEMO입니다.

## 주요 문서

- [2026-08-28 현재 하드웨어 아키텍처](docs/RISK-ZERO_하드웨어_아키텍처_2026-08-28.md)
- [Door Hub 소프트웨어 설계](docs/RISK-ZERO_Door_Hub_소프트웨어_설계_2026-08-28.md)
- [현재 구현 현황](docs/implementation-status.md)
- [새 PC·Codex 인수인계](docs/CODEX_HANDOFF.md)
- [외부 DVP Camera 구동 순서](fpga/arty-a7-100t/DIRECT_CAMERA_BRINGUP.md)
- [FPGA Safety Gate 설계](docs/RISK-ZERO_FPGA_Safety_Gate_FSM_설계_v0.1.md)
- [데이터베이스 설계](docs/database-design.md)
- [운영·개인정보·제어 정책](docs/RISK-ZERO_Policy_Document_초안_v0.2.md)
- [다이어그램](docs/Diagram/README.md)

## 소프트웨어 실행

웹:

```powershell
cd web
pnpm install --frozen-lockfile
pnpm dev
```

모바일 개발 모드:

```powershell
cd mobile
pnpm install --frozen-lockfile
$env:EXPO_PUBLIC_API_BASE_URL="http://개발-PC의-LAN-IP:웹-포트"
pnpm start
```

정책 DEMO:

```powershell
python -m edge.risk_zero_trajectory --scenario hidden-after-delivery
python -m edge.risk_zero_door_hub
python -m edge.risk_zero_av --scenario live-pass
python -m edge.risk_zero_av --scenario audio-replay
```

## 검증

```powershell
python -m unittest discover -s edge/tests -v
python -m unittest discover -s fpga/arty-a7-100t/tests -v

vivado -mode batch -source fpga/arty-a7-100t/vivado/run_rtl_tests.tcl
```

실제 사람 촬영과 물리 제어 전에는 참여 동의, 촬영 범위, 보존기간, 장치 인증, 요청 서명, 비밀키 관리, external pulldown, flyback 보호와 비상 차단 절차를 확정해야 합니다. APK는 사용자가 다시 요청할 때만 빌드·업로드합니다.
