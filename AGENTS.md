# RISK-ZERO 저장소 작업 지침

이 파일은 새 PC나 새 Codex 작업에서 가장 먼저 읽는 저장소 인수인계 지침이다.

## 시작할 때

1. `docs/CODEX_HANDOFF.md`를 끝까지 읽는다.
2. `docs/implementation-status.md`에서 구현과 실장치 미검증 항목을 구분한다.
3. FPGA 작업 전에는 `fpga/arty-a7-100t/BOARD_BRINGUP.md`를 읽는다.
4. 작업 시작 전에 `git status --short`, 현재 브랜치와 최신 커밋을 확인한다.

## 현재 목표와 경계

- 주 장치는 AI Thinker ESP32-CAM과 Digilent Arty A7-100T다.
- FPGA 부품은 `xc7a100tcsg324-1`이다. `A100`, `Arty A100`으로 부르거나 35T 설정으로 바꾸지 않는다.
- ESP32-CAM은 영상을 수집하고 160×120 GRAY8 프레임을 FPGA로 보낸다.
- Arty의 MicroBlaze와 motion RTL이 프레임 재조립, 움직임 중심점, 경계 상자와 동선 수치를 처리한다.
- 웹·모바일 SW에는 하드웨어가 만든 수치와 추후 제공될 후처리 영상만 전달한다. 원시 영상 분석을 웹·모바일로 옮기지 않는다.
- 현재 FPGA 결과는 사람 AI 판별이 아니라 움직임 전경 후보다. 범죄 의도·신원·실제 사람 여부를 판정한다고 표현하지 않는다.
- 음성·입모양 검증은 유지 기능이다. 현재 모델 어댑터와 도어락 액추에이터는 DEMO다.

## 완료로 표시하는 기준

- Python·웹·모바일 테스트 통과와 실제 하드웨어 검증을 별도로 기록한다.
- Vivado simulation, synthesis, implementation, timing, bitstream 생성과 실물 보드 시험 전에는 FPGA 완료로 표시하지 않는다.
- ESP32-CAM은 PlatformIO 빌드·업로드·30분 연속 시험 전에는 펌웨어 실증 완료로 표시하지 않는다.
- `ESP32-CAM → Arty → HTTP → 웹` 전체 경로가 실제 장치에서 확인되기 전에는 엔드투엔드 완료로 표시하지 않는다.
- 실제 측정값, 로그, 스크린샷이 없으면 정확도나 프레임률을 추정해 쓰지 않는다.

## 변경 규칙

- Wi-Fi 비밀번호, 장치 비밀키, 참여자 개인정보와 실제 촬영 영상은 커밋하지 않는다.
- `firmware/esp32-cam/include/config.h`는 로컬 전용이며 `config.example.h`만 저장소에 둔다.
- 생성 폴더, Vivado build 산출물, `node_modules`, `.env`는 커밋하지 않는다.
- 기존 동선 기능과 시청각 검증 기능을 임의로 삭제하지 않는다.
- APK는 사용자가 명시적으로 요청할 때만 빌드·태그·Release 업로드한다.
- 실제 도어락 대신 `MockActuator`를 유지한다. 물리 제어는 별도 안전 승인과 비상 해제 설계가 필요하다.

## 기본 검증

코드 변경 범위에 해당하는 명령을 실행하고 결과를 보고한다.

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

Vivado가 설치된 PC의 다음 단계와 중단 기준은 `fpga/arty-a7-100t/BOARD_BRINGUP.md`를 그대로 따른다.
