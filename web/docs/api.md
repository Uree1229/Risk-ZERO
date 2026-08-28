# RISK-ZERO 데이터 API

현재 API는 Door Hub가 묶은 FPGA Vision·Safety 결과와 이전 시청각 검증 결과를 Cloudflare D1에 저장하는 개발 경로다. 모바일은 같은 `door-hub-event/1` 계약을 읽고 SQLite v5에 보관한다.

## 시연 식별자

- 주거: `demo-household-01`
- Door Hub 장치: `RZ-DOOR-HUB-DEMO-01`
- 검증 스키마: `av-verification/1`
- 정책: `av-policy/0.1`

## 1. Door Hub 이벤트

`POST /api/door-hub-events`

```json
{
  "householdId": "demo-household-01",
  "deviceId": "RZ-DOOR-HUB-DEMO-01",
  "schemaVersion": "door-hub-event/1",
  "generatedAt": "2026-08-28T10:42:18Z",
  "isDemo": true,
  "session": {
    "eventId": 1042,
    "stage": "result-ready",
    "pirActive": false,
    "startedAt": "2026-08-28T10:41:57Z",
    "endedAt": "2026-08-28T10:42:17Z"
  },
  "vision": {
    "status": "ready",
    "visitorPresent": false,
    "objectCount": 0,
    "primaryZone": 6,
    "zoneMask": 32,
    "dwellMs": 18200,
    "backgroundChangeRatio": 0.12,
    "backgroundChanged": true,
    "snapshotReady": true,
    "snapshotRef": null
  },
  "safety": {
    "heartbeatOk": true,
    "authArmed": false,
    "decision": "none",
    "blockReason": null,
    "faultLatched": false,
    "doorClosed": true,
    "tamperDetected": false,
    "emergencyStop": false,
    "outputTarget": "led",
    "outputActive": false
  }
}
```

같은 장치의 같은 `eventId`를 다시 보내면 새 행을 만들지 않고 최신 stage·Vision·Safety 상태로 갱신한다. `ALLOW`가 아닌데 LED가 켜졌거나 Safety fault와 LED 활성 상태가 함께 들어오면 `409`로 거부한다.

## 2. 이전 후처리 이벤트

`POST /api/sensor-events`

```json
{
  "eventId": "av-event-1042",
  "householdId": "demo-household-01",
  "deviceId": "RZ-DEMO-01",
  "eventType": "voice_control_attempt",
  "sequence": 1042,
  "capturedAt": "2026-08-11T10:30:21+09:00",
  "payloadVersion": 1,
  "readings": [
    { "metric": "av_offset_ms", "label": "시청각 오프셋", "value": 42, "unit": "ms", "confidence": 0.93, "quality": "good" },
    { "metric": "active_speaker_score", "label": "활성 화자", "value": 0.91, "confidence": 0.91, "quality": "good" }
  ]
}
```

## 3. 이전 시청각 검증 결과

센서 이벤트를 먼저 저장한 뒤 같은 `eventId`로 전송한다.

`POST /api/verification-attempts`

```json
{
  "householdId": "demo-household-01",
  "eventId": "av-event-1042",
  "controlRequest": {
    "id": "request-1042",
    "deviceId": "RZ-DEMO-01",
    "intent": "unlock",
    "transcript": "초록 우산 문 열어",
    "asrConfidence": 0.94,
    "requestedAt": "2026-08-11T01:30:21Z",
    "expiresAt": "2026-08-11T01:30:36Z",
    "challengeId": "challenge-1042",
    "nonce": "random-one-time-value-1042",
    "challengePhrase": "초록 우산 문 열어"
  },
  "verification": {
    "id": "verification-1042",
    "schemaVersion": "av-verification/1",
    "decision": "pass",
    "confidence": 0.91,
    "reasonCodes": ["verified_live_speech"],
    "summary": "현재 발화와 입술 움직임이 일치합니다.",
    "policyVersion": "av-policy/0.1",
    "evaluatedAt": "2026-08-11T01:30:22Z",
    "processingTimeMs": 428,
    "isDemo": true,
    "evidence": {
      "personPresent": true,
      "faceCount": 1,
      "mouthVisible": true,
      "audioDetected": true,
      "avOffsetMs": 42,
      "syncConfidence": 0.93,
      "activeSpeakerScore": 0.91,
      "audioSpoofScore": 0.08,
      "visualSpoofScore": 0.05,
      "challengeMatched": true,
      "audioQuality": "good",
      "videoQuality": "good",
      "clockSynchronized": true,
      "modelVersions": { "avSync": "DemoSyncAdapter/0.1" }
    }
  },
  "gate": {
    "allowed": true,
    "output": "unlock_pulse",
    "reason": "verified",
    "validUntil": "2026-08-11T01:30:25Z"
  }
}
```

`PASS`가 아닌데 `allowed=true`이거나, 차단 요청의 `output`이 `none`이 아니면 `409 UNSAFE_GATE_RESULT`로 거부한다. nonce와 이벤트는 중복 저장하지 않는다. `allowed`는 출력 가능 상태일 뿐 실제 실행을 뜻하지 않으며, 실제 실행 확인 전 `executed_at`은 비워둔다.

## 4. 조회

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/door-hub-events?householdId=...&limit=30` | 최근 Door Hub 결과 |
| `GET` | `/api/verification-attempts?householdId=...&limit=50` | 최근 검증 결과 |
| `GET` | `/api/sensor-events?householdId=...&limit=50` | 최근 후처리 이벤트 |
| `GET` | `/api/snapshot?scenario=pass` | DEMO 스냅샷 |
| `GET` | `/api/trajectory-snapshot?scenario=hidden-after-delivery` | ESP32-CAM 동선 DEMO 스냅샷 |
| `GET` | `/api/devices?householdId=...` | 등록 장치 |
| `GET` | `/api/incidents` | 이전 사건 모델 호환 조회 |

동선 DEMO의 `scenario`는 `normal-delivery`, `hidden-after-delivery`, `quick-return`, `multiple-persons`, `long-dwell`, `tracking-lost` 중 하나다. 응답은 `trajectory-observation/1` 관찰값과 `trajectory-policy/0.1` 판정값을 함께 반환한다. 실제 ESP32-CAM 입력을 받는 POST API와 DB 저장은 사람 탐지기 연결 뒤 추가한다.

`/trajectory`의 Arty HTTP 직접 조회는 이전 구조 확인용이다. 현재 기본 흐름은 Door Hub가 FPGA 결과를 읽어 이 API로 보내는 방식이다.

## 5. 오류

```json
{
  "error": {
    "code": "INVALID_PAYLOAD",
    "message": "verification.schemaVersion은 av-verification/1이어야 합니다.",
    "field": "verification.schemaVersion"
  }
}
```

입력 오류 `400`, 안전 게이트 불일치 `409`, 장치·이벤트 없음 `404`, DB 오류 `503`을 사용한다.

## 6. 보안 제한

현재 API에는 장치 인증과 요청 서명이 없다. 실제 현관 장치와 사람의 영상·음성을 연결하기 전에 장치별 키, 재전송 방지, 사용자 권한, 전송 암호화와 보존·삭제 정책을 구현해야 한다.
