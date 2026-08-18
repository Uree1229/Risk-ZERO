# RISK-ZERO 현관 동선·시청각 검증 MVP

ESP32-CAM으로 현관 영상을 수집해 사람의 진입·체류·이탈 경로를 확인하고, 음성 도어락 제어 요청의 음성과 입술 움직임을 함께 검증하는 캡스톤 시제품입니다. 현재 개발 우선순위는 현관 동선 추적입니다.

## 현재 동작하는 범위

- `firmware/esp32-cam/`: QVGA JPEG 사진·MJPEG 스트림을 제공하는 AI Thinker ESP32-CAM 펌웨어
- `edge/risk_zero_trajectory/`: 장치 확인, 사람별 중심점 추적, 동선 판정과 6개 DEMO
- `edge/risk_zero_av/`: challenge 문구, PASS/BLOCK/INCONCLUSIVE 정책, nonce 재사용 차단, 제어 게이트
- `web/`: 현관 동선 모니터, 기존 시청각 검증 모니터, 카메라·마이크 수집 시험
- `mobile/`: 시청각 검증 홈, 캘린더·이벤트 상세, 영상 재생, SQLite v4 저장
- `web/db/`, `web/drizzle/`: 웹 D1 검증 테이블과 마이그레이션
- `docs/`: 주제 정의, 공격 시나리오, 데이터 계약, 정책, DB, 다이어그램

현재 실제 사람 탐지 모델, SyncNet·TalkNet·위조 음성 탐지 모델은 연결하지 않았습니다. 화면 결과는 정책과 데이터 흐름을 시험하는 결정론적 DEMO이며 범죄 의도, 실제 신원 또는 상용 도어락 안전 성능을 뜻하지 않습니다.

## 처리 흐름

```text
ESP32-CAM → 로컬 Wi-Fi 영상 → 노트북 사람 탐지 → 사람별 좌표열 → 동선 정책 → 웹 모니터

카메라 + 마이크 → 시청각 분석 → PASS / BLOCK / INCONCLUSIVE → 모형 제어 게이트
```

안전 기본값은 차단입니다. 입력 누락, 낮은 품질, 여러 얼굴, 시간 동기화 실패, 만료·재사용 요청은 문을 열지 않습니다.

## 주요 문서

- [ESP32-CAM 현관 동선 추적 설계](docs/RISK-ZERO_ESP32-CAM_현관_동선_추적_설계_v0.1.md)
- [주제 정의서](docs/RISK-ZERO_시청각_발화_검증_주제_정의서_v0.1.md)
- [공격 시나리오와 판정 기준](docs/RISK-ZERO_시청각_검증_공격_시나리오_v0.1.md)
- [데이터 계약](docs/RISK-ZERO_시청각_검증_데이터_계약_v0.1.md)
- [운영·개인정보·제어 정책](docs/RISK-ZERO_Policy_Document_초안_v0.2.md)
- [검증 지표와 평가 방안](docs/RISK-ZERO_위험도_산정_및_검증_방안_초안_v0.1.md)
- [데이터베이스 설계](docs/database-design.md)
- [소프트웨어 다이어그램](docs/Diagram/README.md)
- [현재 구현 현황](docs/implementation-status.md)

이전 현관 위험 센서 문서는 주제 변경 이력 확인용으로 남겨두며 현재 구현 기준으로 사용하지 않습니다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `POST`, `GET` | `/api/sensor-events` | 하드웨어 후처리 이벤트 저장·조회 |
| `POST`, `GET` | `/api/verification-attempts` | 제어 요청·검증 근거·게이트 결과 저장·조회 |
| `GET` | `/api/snapshot` | 웹·모바일 시연 스냅샷 |
| `GET` | `/api/trajectory-snapshot` | 현관 동선 DEMO 스냅샷 |
| `GET` | `/api/incidents` | 이전 사건 이력 호환 조회 |
| `GET` | `/api/devices` | 장치 상태 조회 |

요청 예시는 [웹 API 문서](web/docs/api.md)에 있습니다.

## 실행

웹:

```powershell
cd web
pnpm install
pnpm dev
```

모바일 개발 모드:

```powershell
cd mobile
pnpm install
$env:EXPO_PUBLIC_API_BASE_URL="http://개발-PC의-LAN-IP:웹-포트"
pnpm start
```

Edge 정책 데모:

```powershell
python -m edge.risk_zero_trajectory --scenario hidden-after-delivery
python -m edge.risk_zero_trajectory --probe-camera http://ESP32-CAM-IP
python -m edge.risk_zero_av --scenario live-pass
python -m edge.risk_zero_av --scenario audio-replay
python -m edge.risk_zero_av --scenario sync-mismatch
```

## 검증

```powershell
python -m unittest discover -s edge/tests -v

cd web
pnpm test
pnpm lint

cd ../mobile
pnpm test
pnpm typecheck
pnpm verify:schema
```

## 배포 주의

기존 APK 링크는 이전 주제 버전입니다. 이번 변경에서는 APK를 새로 만들거나 배포하지 않습니다. 실제 사람을 촬영하거나 문 모형을 연결하기 전에 참여 동의, 촬영 범위, 보존기간, 장치 인증, 요청 서명, 비밀키 관리와 비상 해제 절차를 먼저 확정해야 합니다.
