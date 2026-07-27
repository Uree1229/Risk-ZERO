# RISK-ZERO 데이터 API

현재 API는 Cloudflare D1에 센서 이벤트와 사건 이력을 저장하는 개발·시연 경로다. 고객 모바일의 주 저장소는 기기 내부 SQLite이며 모듈 동기화는 이 REST API가 아니라 `ModuleGateway` 계약을 사용한다. 위험도 계산식은 아직 실행하지 않으며 배포 마이그레이션의 네 가지 시연 평가는 고정 더미 값이다.

## 시연 식별자

- 주거: `demo-household-01`
- 센서 허브: `RZ-DEMO-01`
- 보호자: `demo-guardian-01`
- 시나리오: `normal`, `watch`, `warning`, `critical`

## 센서 이벤트 수신

`POST /api/sensor-events`

```json
{
  "eventId": "esp32-event-1042",
  "householdId": "demo-household-01",
  "deviceId": "RZ-DEMO-01",
  "eventType": "entrance_observation",
  "sequence": 1042,
  "capturedAt": "2026-07-23T10:30:21+09:00",
  "readings": [
    {
      "metric": "presence",
      "label": "사람 감지",
      "value": true,
      "confidence": 0.99
    },
    {
      "metric": "dwell_seconds",
      "label": "체류 시간",
      "value": 32,
      "unit": "초",
      "confidence": 0.95
    }
  ]
}
```

응답:

```json
{
  "data": {
    "eventId": "esp32-event-1042",
    "incidentId": "inc_...",
    "duplicate": false
  }
}
```

`eventId` 또는 `dedupeKey`가 같으면 새 행을 만들지 않고 기존 이벤트를 반환한다. 사건 ID를 보내지 않으면 2분 이내에 생성된 실제 사건에 합치고, 없으면 새 사건을 만든다. 새로 수신한 실제 센서 사건의 위험도는 계산식이 없으므로 `pending` 상태다.

## 조회 API

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/sensor-events?householdId=...&limit=50` | 최신 센서 이벤트 |
| `GET` | `/api/incidents?householdId=...&status=monitoring` | 사건 목록 |
| `GET` | `/api/incidents/latest?householdId=...` | 가장 최근 사건 상세 |
| `GET` | `/api/incidents/{id}` | 이벤트·측정값·평가·대응을 포함한 사건 상세 |
| `GET` | `/api/devices?householdId=...` | 등록 장치와 연결 상태 |
| `GET` | `/api/snapshot?scenario=critical` | 기존 웹·모바일 호환 스냅샷 |

`householdId`를 생략하면 시연용 `demo-household-01`을 사용한다. 목록 API의 `limit` 최대값은 100이다.

## 보호자 피드백

`POST /api/incidents/{id}/feedback`

```json
{
  "userId": "demo-guardian-01",
  "label": "false_alarm",
  "note": "예약된 택배 기사로 확인"
}
```

지원 라벨:

- `normal_visit`
- `confirmed_risk`
- `false_alarm`
- `test`
- `unsure`

## 오류 형식

```json
{
  "error": {
    "code": "INVALID_PAYLOAD",
    "message": "householdId 값이 필요합니다.",
    "field": "householdId"
  }
}
```

주요 상태 코드는 잘못된 요청 `400`, 없는 장치·사건 `404`, DB 사용 불가 `503`이다.

## 현재 보안 범위

현재 배포 사이트는 소유자 전용이며 API 인증은 별도로 구현하지 않았다. 실제 센서와 외부 보호자 계정을 연결하기 전에는 장치별 인증키, 요청 서명 또는 게이트웨이 인증을 추가해야 한다.

## 모바일 로컬 기능과의 구분

다음 기능은 현재 웹 API가 아니라 모바일 SQLite에서 처리한다.

- 후처리 영상의 앱 파일 저장소 복사와 `processed_videos` 기록
- 이벤트 카테고리·오탐·중요 표시·메모
- 단계별 기기 알림 설정, 중복·10분 반복 제한, 확인 완료
- 여러 장치 프로필, 배터리·저장공간·동기화 상태

향후 서버 동기화가 필요하면 모바일 레코드에 사용자·가구 범위, 변경 시각, 동기화 버전과 충돌 정책을 추가한 뒤 별도 API를 설계한다.
