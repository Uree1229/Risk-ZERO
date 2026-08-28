# RISK-ZERO 저장소 작업 지침

## 시작 순서

1. `docs/RISK-ZERO_하드웨어_아키텍처_2026-08-28.md`를 끝까지 읽는다.
2. `docs/CODEX_HANDOFF.md`와 `docs/implementation-status.md`를 읽는다.
3. FPGA 작업 전 `fpga/arty-a7-100t/DIRECT_CAMERA_BRINGUP.md`를 읽는다.
4. `git status --short`, 현재 브랜치와 최신 커밋을 확인한다.

## 현재 기준

- Door Hub는 ESP32-S3 DevKitC다. PIR·Wi-Fi·authorization·FPGA control/result 중계를 담당한다.
- Camera는 외부 Parallel DVP 모듈을 Arty A7-100T에 직접 연결한다.
- XIAO ESP32-S3 Sense와 AI Thinker ESP32-CAM 영상 전송 경로는 현재 아키텍처가 아니라 참고 구현이다.
- FPGA part는 `xc7a100tcsg324-1`이다. 35T 설정이나 `A100` 명칭으로 바꾸지 않는다.
- FPGA 전체는 상시 구성 상태를 유지한다. Safety Domain은 always-on이고 Camera/Vision만 이벤트 기반으로 sleep/wake한다.
- Safety와 Vision의 clock/reset/책임을 분리한다. Vision 결과에서 actuator pulse로 직접 연결하지 않는다.
- 웹·모바일에는 하드웨어 결과와 선택된 후처리 Snapshot만 전달한다. 원시 영상 분석을 앱으로 옮기지 않는다.
- 현재 영상 결과는 움직임 전경 후보다. 사람·신원·범죄 의도를 판정한다고 표현하지 않는다.

## 결정하지 않은 값

실제 모듈 회로도·데이터시트·측정 없이 다음을 임의로 고정하지 않는다.

- Camera 모델·I/O 전압·핀맵·XCLK/PCLK·출력 포맷
- Arty header와 XDC input delay
- Door Hub GPIO·SPI mode·clock·register offset
- frame rate, threshold, PIR debounce·이벤트 종료 시간
- Snapshot 포맷과 CRC

## 완료 표시 기준

- source 작성, 정적/단위 테스트, Vivado simulation, 합성·timing, 실물 시험을 별도로 기록한다.
- 새 DVP·Safety testbench를 Vivado에서 실행하기 전에는 RTL simulation 완료라고 쓰지 않는다.
- Camera SCCB ACK·ID·PCLK·VSYNC·HREF·frame geometry를 측정하기 전에는 Camera 연결 완료라고 쓰지 않는다.
- `PIR → Door Hub → FPGA Camera/Vision → result → Door Hub → 앱` 실장 경로 전에는 엔드투엔드 완료라고 쓰지 않는다.
- 실제 로그·측정값 없이 성능·정확도·전력·latency를 추정하지 않는다.
- 과거 UDP/Ethernet build 결과를 현재 DVP 구조의 검증으로 사용하지 않는다.

## 안전·보안 규칙

- Wi-Fi 비밀번호, 장치 키, 개인정보와 실제 촬영 영상은 커밋하지 않는다.
- 생성 폴더, Vivado build, `node_modules`, `.env`는 커밋하지 않는다.
- 첫 수직 통합은 actuator 대신 LED를 사용한다.
- 실제 actuator는 external pulldown, MOSFET driver, flyback, 별도 전원, E-stop ABORT 측정 후에만 연결한다.
- 실제 도어락은 `MockActuator`를 대체하지 않는다.
- APK는 사용자가 명시적으로 요청할 때만 빌드·태그·Release 업로드한다.

## 기본 검증

```powershell
python -m unittest discover -s edge/tests -v
python -m unittest discover -s fpga/arty-a7-100t/tests -v

cd web
pnpm install --frozen-lockfile
pnpm test
pnpm lint

cd ../mobile
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm verify:schema
```

Vivado가 있는 PC에서는 `fpga/arty-a7-100t/vivado/run_rtl_tests.tcl`을 실행한다. 실물 작업은 `DIRECT_CAMERA_BRINGUP.md`의 결정 게이트와 중단 기준을 따른다.
