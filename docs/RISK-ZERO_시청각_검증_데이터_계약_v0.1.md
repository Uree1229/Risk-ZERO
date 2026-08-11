# RISK-ZERO 시청각 검증 데이터 계약

- 버전: v0.1
- 작성일: 2026-08-11
- 스키마 버전: `av-verification/1`

## 1. 목적

외부 음성 제어 AI, 엣지 검증기, 문 모형 제어 게이트, 모바일과 웹이 같은 제어 요청과 검증 결과를 식별하기 위한 계약이다. 원본 영상 프레임이나 PCM을 JSON으로 전달하지 않고, 파일 참조와 후처리 수치만 전달한다.

## 2. ControlRequest

```ts
interface ControlRequest {
  id: string;
  deviceId: string;
  intent: "unlock" | "lock" | "status";
  transcript: string;
  asrConfidence: number | null;
  requestedAt: string;
  expiresAt: string;
  challengeId: string | null;
  nonce: string;
  challengePhrase?: string | null;
}
```

- `id`, `nonce`는 재사용할 수 없다.
- `expiresAt`이 지난 요청은 모델 결과와 관계없이 차단한다.
- `transcript`는 제어 요청을 이해하기 위한 값이며 사람의 신원을 증명하지 않는다.

## 3. ChallengeSession

```ts
interface ChallengeSession {
  id: string;
  phrase: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
}
```

challenge는 한 번만 사용할 수 있다. 같은 문구를 사용하더라도 `id`와 `nonce`는 매번 새로 만든다.

## 4. AnalysisEvidence

```ts
interface AnalysisEvidence {
  personPresent: boolean;
  faceCount: number;
  mouthVisible: boolean;
  audioDetected: boolean;
  avOffsetMs: number | null;
  syncConfidence: number | null;
  activeSpeakerScore: number | null;
  audioSpoofScore: number | null;
  visualSpoofScore: number | null;
  challengeMatched: boolean | null;
  audioQuality: "good" | "degraded" | "bad" | "missing";
  videoQuality: "good" | "degraded" | "bad" | "missing";
  clockSynchronized: boolean;
  modelVersions: Record<string, string>;
}
```

점수 범위는 `0..1`이다. 점수를 만들지 못했다면 `0`이 아니라 `null`을 사용한다.

## 5. VerificationResult

```ts
type VerificationDecision = "pending" | "pass" | "block" | "inconclusive";

interface VerificationResult {
  id: string;
  schemaVersion: "av-verification/1";
  decision: VerificationDecision;
  confidence: number | null;
  reasonCodes: string[];
  summary: string;
  policyVersion: string;
  evaluatedAt: string;
  processingTimeMs: number;
  isDemo: boolean;
  evidence: AnalysisEvidence;
}
```

요청과 결과의 연결은 전송 envelope의 `eventId`, `controlRequest.id`, `verification.id`로 관리한다. 영상은 `ModuleEvent.video` 또는 이벤트의 `processed_videos` 레코드로 연결한다.

## 6. reason code

| 코드 | 의미 |
| --- | --- |
| `verified_live_speech` | 현재 발화 조건 통과 |
| `no_visible_person` | 화면에 사람이 없음 |
| `multiple_faces` | 얼굴이 두 명 이상 |
| `mouth_not_visible` | 입술 판독 불가 |
| `audio_missing` | 발화 구간 없음 |
| `av_sync_mismatch` | 시청각 오프셋 초과 |
| `sync_confidence_low` | 싱크 신뢰도 부족 |
| `active_speaker_mismatch` | 화면 속 발화자와 음성 불일치 |
| `audio_spoof_suspected` | 녹음·합성 음성 의심 |
| `visual_spoof_suspected` | 화면·인쇄물 재생 공격 의심 |
| `challenge_mismatch` | 랜덤 문구 불일치 |
| `challenge_expired` | challenge 만료 |
| `request_expired` | 제어 요청 만료 |
| `nonce_replayed` | 이미 사용한 nonce |
| `capture_quality_low` | 음성 또는 영상 품질 부족 |
| `clock_unsynchronized` | 카메라·마이크 시간 불일치 |
| `model_error` | 모델 추론 실패 |
| `gateway_offline` | 게이트웨이 통신 단절 |

## 7. ActuationDecision

```ts
interface ActuationDecision {
  id: string;
  attemptId: string;
  requestId: string;
  allowed: boolean;
  output: "unlock_pulse" | "lock_pulse" | "none";
  reason: string;
  validUntil: string;
  executedAt: string | null;
}
```

`decision === "pass"`만으로 출력하지 않는다. request ID 일치, nonce 미사용, 유효시간, heartbeat와 게이트 상태를 다시 확인한다.

## 8. ModuleEvent 확장

기존 `ModuleEvent`의 sequence·dedupe·영상 구조는 유지하고 아래 필드를 추가한다.

```ts
interface ModuleEventDraft {
  eventType: "verification_attempt" | string;
  capturedAt: string;
  metrics: ProcessedMetric[];
  video?: ProcessedVideoFile;
  controlRequest?: ControlRequest;
  verification?: VerificationResult;
  actuation?: ActuationGateResult;
  dedupeKey?: string;
}
```

실제 어댑터는 `verification.decision`, `request.id`, `request.nonce`, `policyVersion`, `modelVersions`를 누락하면 안 된다.

## 9. 저장 테이블

| 테이블 | 내용 |
| --- | --- |
| `control_requests` | 음성 AI가 생성한 제어 요청과 만료·nonce |
| `challenge_sessions` | 일회용 문구와 사용 여부 |
| `verification_attempts` | 판정, 점수, 근거, 모델·정책 버전 |
| `verification_evidence` | 시청각 수치와 품질 |
| `actuation_logs` | 문 모형 출력 허용·차단 결과 |
| `processed_videos` | 기존 후처리 영상 참조 재사용 |

## 10. 호환성

- 기존 `sensor_events`, `sensor_readings`, `risk_assessments`는 바로 삭제하지 않는다.
- 새 앱은 `verification_attempts`를 우선 읽고, 이전 데이터만 있을 때 기존 위험도 레코드를 읽기 전용으로 보여준다.
- 검증 데이터는 `schemaVersion`과 `policyVersion`을 반드시 저장한다.
- 알 수 없는 필드는 무시할 수 있지만 알 수 없는 스키마 버전은 자동 PASS로 처리하지 않는다.
