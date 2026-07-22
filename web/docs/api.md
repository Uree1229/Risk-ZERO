# RISK-ZERO 데이터 API

현재 API는 Cloudflare D1에 센서 이벤트와 사건 이력을 저장한다. 위험도 계산식은 아직 실행하지 않으며, 배포 마이그레이션에 포함된 네 가지 시연 평가는 고정 더미 값이다.

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
