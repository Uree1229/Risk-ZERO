# RISK-ZERO MVP

현관 센서 계층, 데이터 저장 계층, 위험도 판정 계층, 웹·모바일 모니터링을 느슨하게 분리한 캡스톤 디자인 시제품입니다.

## 현재 구현 범위

- `web/`: 시나리오 선택, 장치 상태, 최근 사건, 위험 단계와 대응 미리보기를 제공하는 웹 모니터
- `mobile/`: 웹 API를 소비하고 연결 실패 시 내장 시연 데이터로 전환하는 Expo 기반 모바일 MVP
- `web/app/api/`: 센서 이벤트 수신, 사건·장치 조회, 보호자 피드백, 스냅샷 API
- `web/db/`, `web/drizzle/`: Cloudflare D1용 스키마, 저장소 계층, 마이그레이션과 시연 데이터
- `docs/database-design.md`: ERD, 센서 확장 모델, 보존기간과 조회 흐름
- `docs/`: 제안서·발표자료와 아래 설계 문서
  - [운영·데이터·위험 대응 정책 v0.2](docs/RISK-ZERO_Policy_Document_초안_v0.2.md)
  - [위험도 산정 및 검증 방안 v0.1](docs/RISK-ZERO_위험도_산정_및_검증_방안_초안_v0.1.md)
  - [시나리오 및 Use Case 정의서 v0.1](docs/RISK-ZERO_시나리오_Use_Case_정의서_v0.1.md)
  - [소프트웨어 다이어그램 7종](docs/Diagram/README.md)

아직 실제 위험도 계산식은 구현하지 않았습니다. `DemoPassThroughRiskEngine`이 고정 시연 결과만 전달하며, 새로 들어온 실제 센서 사건은 `pending`으로 저장됩니다. 카메라, 실제 보호자 알림, 도어락 제어, 112 신고도 실행하지 않고 화면 미리보기만 제공합니다.

## 구조

```text
외부 센서 계층
    ↓ SensorGateway / POST /api/sensor-events
SensorEvent 정규화
    ↓
D1: sensor_events + sensor_readings + incidents
    ↓ RiskEngine
RiskAssessment (현재: 고정 더미 또는 pending)
    ↓
웹 / 모바일 모니터링 + 보호자 피드백
```

실제 센서를 연결할 때는 `web/lib/domain.ts`의 `SensorGateway` 계약과 `POST /api/sensor-events` 형식에 맞춰 변환합니다. 위험도 정책이 확정되면 `RiskEngine` 구현체를 추가하고 `risk_engine_versions`에 버전을 기록합니다.

## 주요 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `POST`, `GET` | `/api/sensor-events` | 센서 이벤트 저장·조회 |
| `GET` | `/api/incidents` | 사건 목록 |
| `GET` | `/api/incidents/latest` | 최근 사건 상세 |
| `GET` | `/api/incidents/{id}` | 사건·측정값·평가·대응 상세 |
| `POST` | `/api/incidents/{id}/feedback` | 보호자 사후 분류 |
| `GET` | `/api/devices` | 등록 장치와 연결 상태 |
| `GET` | `/api/snapshot` | 웹·모바일 공용 스냅샷 |

요청·응답 예시는 `web/docs/api.md`를 참고하세요.

## 웹 실행

Node.js 22.13 이상과 pnpm이 필요합니다.

```powershell
cd web
pnpm install
pnpm dev
```

로컬 D1이 준비되지 않으면 화면과 스냅샷 API는 메모리 시연 데이터로 전환됩니다.

## 모바일 실행

```powershell
cd mobile
pnpm install
$env:EXPO_PUBLIC_API_BASE_URL="http://개발-PC의-LAN-IP:웹-포트"
pnpm start
```

실기기 테스트 시 휴대폰과 개발 PC는 같은 네트워크에 있어야 합니다. API 연결에 실패하면 앱은 자동으로 내장 시연 데이터로 전환됩니다.

## 검증

```powershell
cd web
pnpm test

cd ../mobile
pnpm typecheck
```

## 현재 보안 제한

현재 배포는 캡스톤 데모 범위이며 API 사용자·장치 인증이 별도로 구현되지 않았습니다. 실제 센서, 실제 주소 또는 외부 보호자 계정을 연결하기 전에 장치별 자격증명, 요청 서명, 역할 기반 접근제어와 비밀키 관리를 추가해야 합니다.
