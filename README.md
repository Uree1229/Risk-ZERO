# RISK-ZERO MVP v0.2.0

현관 하드웨어의 후처리 결과, 데이터 저장, 위험도 판정, 웹·모바일 모니터링을 느슨하게 분리한 캡스톤 디자인 시제품입니다.

## 현재 구현 범위

- `web/`: 시나리오 선택, 장치 상태, 최근 사건, 위험 단계와 대응 미리보기를 제공하는 웹 모니터
- `mobile/`: SQLite 로컬 저장, 이벤트 분류·검색, 영상 보관·재생, 위험 알림, 장치 관리를 포함한 Expo 기반 모바일 MVP
- `web/app/api/`: 센서 이벤트 수신, 사건·장치 조회, 보호자 피드백, 스냅샷 API
- `web/db/`, `web/drizzle/`: Cloudflare D1용 스키마, 저장소 계층, 마이그레이션과 시연 데이터
- `docs/database-design.md`: ERD, 센서 확장 모델, 보존기간과 조회 흐름
- `docs/module-sync.md`: 모듈 임시 버퍼, 이벤트 순번, ACK와 재연결 규칙
- `docs/`: 제안서·발표자료와 아래 설계 문서
  - [운영·데이터·위험 대응 정책 v0.3](docs/RISK-ZERO_Policy_Document_초안_v0.2.md)
  - [위험도 산정 및 검증 방안 v0.2](docs/RISK-ZERO_위험도_산정_및_검증_방안_초안_v0.1.md)
  - [시나리오 및 Use Case 정의서 v0.2](docs/RISK-ZERO_시나리오_Use_Case_정의서_v0.1.md)
  - [소프트웨어 다이어그램 7종](docs/Diagram/README.md)
  - [현재 구현 현황](docs/implementation-status.md)

아직 실제 위험도 계산식과 하드웨어 통신 어댑터는 구현하지 않았습니다. `DemoPassThroughRiskEngine`이 고정 시연 결과만 전달하며, 실제 모듈 사건은 계산식이 연결되기 전까지 `pending`으로 저장됩니다. 모바일 기기 내부 알림은 구현했지만 원격 푸시, 도어락 제어, 112 신고는 실행하지 않습니다.

## 구조

```text
하드웨어 센서 분석·영상 후처리
    ├─ 수치형 지표 + 후처리 영상 → 모듈 임시 버퍼
    ├─ 모듈 임시 버퍼 → 모바일 SQLite·파일 저장소 → 모바일 모니터링
    └─ 동일한 후처리 수치 → 개발 API → 웹 DB → 웹 모니터링

위험도 판정: 현재 고정 더미 또는 pending
```

실제 하드웨어를 연결할 때는 `mobile/src/module/contracts.ts`의 `ModuleGateway` 계약에 맞춰 수치형 지표와 후처리 영상 파일을 전달합니다. 웹의 센서 API는 개발·시연용으로 유지합니다. 위험도 정책이 확정되면 `RiskEngine` 구현체를 추가하고 버전을 기록합니다.

### 모바일 이벤트 조회

- 최근 이벤트 카드를 누르면 위험 단계, 점수, 판정 내용과 후처리 영상을 확인할 수 있습니다.
- `상세 조회`에서는 월간 캘린더의 날짜를 선택한 뒤 시간대별 또는 위험 단계별로 기록을 나눠 볼 수 있습니다.
- 영상 파일의 `localUri`가 있으면 재생·일시정지·10초 이동·전체 화면 기능이 활성화됩니다.
- 모바일은 모듈의 임시 영상 파일을 앱 전용 저장소로 복사하고 크기를 검증한 뒤 DB에 최종 경로를 기록합니다.
- 사용자는 이벤트 종류, 오탐, 중요 표시와 메모를 저장하고 검색·필터링할 수 있습니다.
- 주의·경고·고위험 알림을 각각 설정하며 같은 단계의 반복 알림은 기본 10분 동안 제한합니다.
- 설정 화면에서 여러 장치의 배터리·저장 공간·동기화 상태를 확인하고 장치 프로필을 등록하거나 해제할 수 있습니다.
- 현재 시연 데이터에는 영상 파일을 넣지 않았기 때문에 영상 재생 영역은 입력 대기 화면으로 표시됩니다.

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

### APK 바로 설치

[RISK-ZERO Mobile v0.2.0 APK 다운로드](https://github.com/Uree1229/Risk-ZERO/releases/download/mobile-v0.2.0/RISK-ZERO-v0.2.0.apk)

Android에서 파일을 내려받은 뒤 설치하면 서버 없이 `OFFLINE DEMO` 모드로 바로 실행됩니다. Android가 설치를 차단하면 브라우저 또는 파일 앱의 `알 수 없는 앱 설치` 권한을 이번 설치에만 허용해야 합니다.

v0.2.0은 Android `versionCode 3`입니다. 새 태그를 푸시하면 GitHub Actions가 release APK를 빌드해 같은 버전의 GitHub Release에 첨부합니다.

### 개발 모드

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
pnpm test
pnpm typecheck
```

## 현재 보안 제한

현재 배포는 캡스톤 데모 범위이며 API 사용자·장치 인증이 별도로 구현되지 않았습니다. 실제 센서, 실제 주소 또는 외부 보호자 계정을 연결하기 전에 장치별 자격증명, 요청 서명, 역할 기반 접근제어와 비밀키 관리를 추가해야 합니다.
