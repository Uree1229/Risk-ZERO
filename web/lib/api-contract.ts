export const DEMO_HOUSEHOLD_ID = "demo-household-01";
export const DEMO_GUARDIAN_USER_ID = "demo-guardian-01";

export type ReadingQuality = "good" | "uncertain" | "bad" | "missing";
export type IncomingSensorValue = boolean | number | string | Record<string, unknown> | unknown[];

export interface IncomingSensorReading {
  metric: string;
  label: string;
  value: IncomingSensorValue;
  unit?: string;
  confidence?: number;
  quality: ReadingQuality;
  capturedAt: string;
}

export interface IncomingSensorEvent {
  eventId?: string;
  householdId: string;
  incidentId?: string;
  deviceId: string;
  eventType: string;
  sequence?: number;
  capturedAt: string;
  dedupeKey: string;
  payloadVersion: number;
  readings: IncomingSensorReading[];
  rawPayload?: Record<string, unknown>;
}

export interface IncomingVerificationAttempt {
  householdId: string;
  eventId: string;
  controlRequest: {
    id: string;
    deviceId: string;
    intent: "unlock" | "lock" | "status";
    transcript: string;
    asrConfidence: number | null;
    requestedAt: string;
    expiresAt: string;
    challengeId: string | null;
    nonce: string;
    challengePhrase?: string;
  };
  verification: {
    id: string;
    schemaVersion: "av-verification/1";
    decision: "pending" | "pass" | "block" | "inconclusive";
    confidence: number | null;
    reasonCodes: string[];
    summary: string;
    policyVersion: string;
    evaluatedAt: string;
    processingTimeMs: number;
    isDemo: boolean;
    evidence: {
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
    };
  };
  gate: {
    allowed: boolean;
    output: "unlock_pulse" | "lock_pulse" | "none";
    reason: string;
    validUntil: string;
  };
}

export interface IncomingDoorHubEvent {
  householdId: string;
  deviceId: string;
  schemaVersion: "door-hub-event/1";
  generatedAt: string;
  isDemo: boolean;
  session: {
    eventId: number;
    stage: "idle" | "vision-wake" | "camera-init" | "capture" | "end-background" | "result-ready" | "vision-sleep" | "fault";
    pirActive: boolean;
    startedAt: string;
    endedAt: string | null;
  };
  vision: {
    status: "ready" | "capturing" | "sleeping" | "fault";
    visitorPresent: boolean;
    objectCount: number;
    primaryZone: number | null;
    zoneMask: number;
    dwellMs: number;
    backgroundChangeRatio: number;
    backgroundChanged: boolean;
    snapshotReady: boolean;
    snapshotRef: string | null;
  };
  safety: {
    heartbeatOk: boolean;
    authArmed: boolean;
    decision: "none" | "allow" | "block" | "abort";
    blockReason: string | null;
    faultLatched: boolean;
    doorClosed: boolean;
    tamperDetected: boolean;
    emergencyStop: boolean;
    outputTarget: "led";
    outputActive: boolean;
  };
}

export class PayloadValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message);
    this.name = "PayloadValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  field: string,
  options: { required?: boolean; maxLength?: number } = {}
): string | undefined {
  const value = record[field];
  if (value === undefined || value === null || value === "") {
    if (options.required) throw new PayloadValidationError(`${field} 값이 필요합니다.`, field);
    return undefined;
  }
  if (typeof value !== "string") throw new PayloadValidationError(`${field}는 문자열이어야 합니다.`, field);
  const trimmed = value.trim();
  if (!trimmed) throw new PayloadValidationError(`${field}는 빈 문자열일 수 없습니다.`, field);
  if (trimmed.length > (options.maxLength ?? 200)) {
    throw new PayloadValidationError(`${field}가 너무 깁니다.`, field);
  }
  return trimmed;
}

function readIsoDate(record: Record<string, unknown>, field: string, fallback?: string): string {
  const value = readString(record, field) ?? fallback;
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new PayloadValidationError(`${field}는 ISO-8601 날짜 형식이어야 합니다.`, field);
  }
  return new Date(value).toISOString();
}

function readRecord(record: Record<string, unknown>, field: string) {
  const value = record[field];
  if (!isRecord(value)) throw new PayloadValidationError(`${field}는 JSON 객체여야 합니다.`, field);
  return value;
}

function readBoolean(record: Record<string, unknown>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") throw new PayloadValidationError(`${field}는 true 또는 false여야 합니다.`, field);
  return value;
}

function readNullableNumber(
  record: Record<string, unknown>,
  field: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number | null {
  const value = record[field];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PayloadValidationError(`${field}는 숫자 또는 null이어야 합니다.`, field);
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new PayloadValidationError(`${field}는 정수여야 합니다.`, field);
  }
  if ((options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max)) {
    throw new PayloadValidationError(`${field} 값이 허용 범위를 벗어났습니다.`, field);
  }
  return value;
}

function readEnum<const T extends readonly string[]>(
  record: Record<string, unknown>,
  field: string,
  values: T
): T[number] {
  const value = readString(record, field, { required: true, maxLength: 64 });
  if (!values.includes(value as T[number])) {
    throw new PayloadValidationError(`${field} 값이 허용 목록에 없습니다.`, field);
  }
  return value as T[number];
}

function parseReading(value: unknown, eventCapturedAt: string, index: number): IncomingSensorReading {
  if (!isRecord(value)) throw new PayloadValidationError(`readings[${index}] 형식이 올바르지 않습니다.`, "readings");

  const metric = readString(value, "metric", { required: true, maxLength: 64 })!;
  if (!/^[a-z][a-z0-9_]*$/.test(metric)) {
    throw new PayloadValidationError("metric은 영문 소문자와 숫자, 밑줄만 사용할 수 있습니다.", `readings[${index}].metric`);
  }

  const sensorValue = value.value;
  const validValue =
    typeof sensorValue === "boolean" ||
    (typeof sensorValue === "number" && Number.isFinite(sensorValue)) ||
    typeof sensorValue === "string" ||
    Array.isArray(sensorValue) ||
    isRecord(sensorValue);
  if (!validValue) {
    throw new PayloadValidationError("센서 값은 숫자, 문자열, 불리언 또는 JSON이어야 합니다.", `readings[${index}].value`);
  }

  const confidence = value.confidence;
  if (confidence !== undefined && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) {
    throw new PayloadValidationError("confidence는 0과 1 사이여야 합니다.", `readings[${index}].confidence`);
  }

  const quality = value.quality ?? "good";
  if (!(["good", "uncertain", "bad", "missing"] as unknown[]).includes(quality)) {
    throw new PayloadValidationError("지원하지 않는 quality 값입니다.", `readings[${index}].quality`);
  }

  return {
    metric,
    label: readString(value, "label", { maxLength: 80 }) ?? metric,
    value: sensorValue as IncomingSensorValue,
    unit: readString(value, "unit", { maxLength: 24 }),
    confidence: confidence as number | undefined,
    quality: quality as ReadingQuality,
    capturedAt: readIsoDate(value, "capturedAt", eventCapturedAt),
  };
}

export function parseSensorEventPayload(value: unknown): IncomingSensorEvent {
  if (!isRecord(value)) throw new PayloadValidationError("요청 본문은 JSON 객체여야 합니다.");

  const householdId = readString(value, "householdId", { required: true, maxLength: 128 })!;
  const deviceId = readString(value, "deviceId", { required: true, maxLength: 128 })!;
  const eventType = readString(value, "eventType", { required: true, maxLength: 64 })!;
  const capturedAt = readIsoDate(value, "capturedAt");

  const sequence = value.sequence;
  if (sequence !== undefined && (!Number.isSafeInteger(sequence) || (sequence as number) < 0)) {
    throw new PayloadValidationError("sequence는 0 이상의 정수여야 합니다.", "sequence");
  }

  const payloadVersion = value.payloadVersion ?? 1;
  if (!Number.isSafeInteger(payloadVersion) || (payloadVersion as number) < 1) {
    throw new PayloadValidationError("payloadVersion은 1 이상의 정수여야 합니다.", "payloadVersion");
  }

  if (!Array.isArray(value.readings) || value.readings.length === 0 || value.readings.length > 64) {
    throw new PayloadValidationError("readings는 1개 이상 64개 이하이어야 합니다.", "readings");
  }

  const eventId = readString(value, "eventId", { maxLength: 128 });
  const explicitDedupeKey = readString(value, "dedupeKey", { maxLength: 180 });
  const dedupeKey = explicitDedupeKey ?? eventId ?? `${sequence ?? "none"}:${capturedAt}:${eventType}`;
  const rawPayload = value.rawPayload;
  if (rawPayload !== undefined && !isRecord(rawPayload)) {
    throw new PayloadValidationError("rawPayload는 JSON 객체여야 합니다.", "rawPayload");
  }

  return {
    eventId,
    householdId,
    incidentId: readString(value, "incidentId", { maxLength: 128 }),
    deviceId,
    eventType,
    sequence: sequence as number | undefined,
    capturedAt,
    dedupeKey,
    payloadVersion: payloadVersion as number,
    readings: value.readings.map((reading, index) => parseReading(reading, capturedAt, index)),
    rawPayload: rawPayload as Record<string, unknown> | undefined,
  };
}

export function parseVerificationAttemptPayload(value: unknown): IncomingVerificationAttempt {
  if (!isRecord(value)) throw new PayloadValidationError("요청 본문은 JSON 객체여야 합니다.");

  const control = readRecord(value, "controlRequest");
  const verification = readRecord(value, "verification");
  const evidence = readRecord(verification, "evidence");
  const gate = readRecord(value, "gate");
  const schemaVersion = readString(verification, "schemaVersion", { required: true, maxLength: 40 });
  if (schemaVersion !== "av-verification/1") {
    throw new PayloadValidationError("schemaVersion은 av-verification/1이어야 합니다.", "verification.schemaVersion");
  }

  const reasonCodesValue = verification.reasonCodes;
  if (!Array.isArray(reasonCodesValue) || reasonCodesValue.length > 20 || reasonCodesValue.some((item) => typeof item !== "string" || item.length > 80)) {
    throw new PayloadValidationError("reasonCodes는 최대 20개의 문자열 배열이어야 합니다.", "verification.reasonCodes");
  }

  const modelVersionsValue = evidence.modelVersions;
  if (!isRecord(modelVersionsValue) || Object.entries(modelVersionsValue).some(([key, item]) => !key || typeof item !== "string" || item.length > 120)) {
    throw new PayloadValidationError("modelVersions는 문자열 키·값 객체여야 합니다.", "verification.evidence.modelVersions");
  }

  const challengeIdValue = control.challengeId;
  const challengeId = challengeIdValue === null
    ? null
    : readString(control, "challengeId", { required: true, maxLength: 128 })!;
  const challengeMatchedValue = evidence.challengeMatched;
  if (challengeMatchedValue !== null && typeof challengeMatchedValue !== "boolean") {
    throw new PayloadValidationError("challengeMatched는 true, false 또는 null이어야 합니다.", "verification.evidence.challengeMatched");
  }

  const asrConfidence = readNullableNumber(control, "asrConfidence", { min: 0, max: 1 });
  const confidence = readNullableNumber(verification, "confidence", { min: 0, max: 1 });
  const faceCount = readNullableNumber(evidence, "faceCount", { min: 0, integer: true });
  const processingTimeMs = readNullableNumber(verification, "processingTimeMs", { min: 0, integer: true });
  if (faceCount === null || processingTimeMs === null) {
    throw new PayloadValidationError("faceCount와 processingTimeMs는 null일 수 없습니다.");
  }

  return {
    householdId: readString(value, "householdId", { required: true, maxLength: 128 })!,
    eventId: readString(value, "eventId", { required: true, maxLength: 128 })!,
    controlRequest: {
      id: readString(control, "id", { required: true, maxLength: 128 })!,
      deviceId: readString(control, "deviceId", { required: true, maxLength: 128 })!,
      intent: readEnum(control, "intent", ["unlock", "lock", "status"] as const),
      transcript: readString(control, "transcript", { required: true, maxLength: 500 })!,
      asrConfidence,
      requestedAt: readIsoDate(control, "requestedAt"),
      expiresAt: readIsoDate(control, "expiresAt"),
      challengeId,
      nonce: readString(control, "nonce", { required: true, maxLength: 180 })!,
      challengePhrase: readString(control, "challengePhrase", { maxLength: 120 }),
    },
    verification: {
      id: readString(verification, "id", { required: true, maxLength: 128 })!,
      schemaVersion: "av-verification/1",
      decision: readEnum(verification, "decision", ["pending", "pass", "block", "inconclusive"] as const),
      confidence,
      reasonCodes: reasonCodesValue as string[],
      summary: readString(verification, "summary", { required: true, maxLength: 500 })!,
      policyVersion: readString(verification, "policyVersion", { required: true, maxLength: 80 })!,
      evaluatedAt: readIsoDate(verification, "evaluatedAt"),
      processingTimeMs,
      isDemo: readBoolean(verification, "isDemo"),
      evidence: {
        personPresent: readBoolean(evidence, "personPresent"),
        faceCount,
        mouthVisible: readBoolean(evidence, "mouthVisible"),
        audioDetected: readBoolean(evidence, "audioDetected"),
        avOffsetMs: readNullableNumber(evidence, "avOffsetMs"),
        syncConfidence: readNullableNumber(evidence, "syncConfidence", { min: 0, max: 1 }),
        activeSpeakerScore: readNullableNumber(evidence, "activeSpeakerScore", { min: 0, max: 1 }),
        audioSpoofScore: readNullableNumber(evidence, "audioSpoofScore", { min: 0, max: 1 }),
        visualSpoofScore: readNullableNumber(evidence, "visualSpoofScore", { min: 0, max: 1 }),
        challengeMatched: challengeMatchedValue as boolean | null,
        audioQuality: readEnum(evidence, "audioQuality", ["good", "degraded", "bad", "missing"] as const),
        videoQuality: readEnum(evidence, "videoQuality", ["good", "degraded", "bad", "missing"] as const),
        clockSynchronized: readBoolean(evidence, "clockSynchronized"),
        modelVersions: modelVersionsValue as Record<string, string>,
      },
    },
    gate: {
      allowed: readBoolean(gate, "allowed"),
      output: readEnum(gate, "output", ["unlock_pulse", "lock_pulse", "none"] as const),
      reason: readString(gate, "reason", { required: true, maxLength: 180 })!,
      validUntil: readIsoDate(gate, "validUntil"),
    },
  };
}

export function parseDoorHubEventPayload(value: unknown): IncomingDoorHubEvent {
  if (!isRecord(value)) throw new PayloadValidationError("요청 본문은 JSON 객체여야 합니다.");
  const schemaVersion = readString(value, "schemaVersion", { required: true, maxLength: 40 });
  if (schemaVersion !== "door-hub-event/1") {
    throw new PayloadValidationError("schemaVersion은 door-hub-event/1이어야 합니다.", "schemaVersion");
  }

  const session = readRecord(value, "session");
  const vision = readRecord(value, "vision");
  const safety = readRecord(value, "safety");
  const eventId = readNullableNumber(session, "eventId", { min: 0, integer: true });
  const objectCount = readNullableNumber(vision, "objectCount", { min: 0, integer: true });
  const primaryZone = readNullableNumber(vision, "primaryZone", { min: 1, max: 9, integer: true });
  const zoneMask = readNullableNumber(vision, "zoneMask", { min: 0, max: 511, integer: true });
  const dwellMs = readNullableNumber(vision, "dwellMs", { min: 0, integer: true });
  const backgroundChangeRatio = readNullableNumber(vision, "backgroundChangeRatio", { min: 0, max: 1 });
  if (eventId === null || objectCount === null || zoneMask === null || dwellMs === null || backgroundChangeRatio === null) {
    throw new PayloadValidationError("eventId와 Vision 수치 필드는 null일 수 없습니다.");
  }

  const endedAtValue = session.endedAt;
  const snapshotRefValue = vision.snapshotRef;
  const blockReasonValue = safety.blockReason;
  const outputTarget = readString(safety, "outputTarget", { required: true, maxLength: 16 });
  if (outputTarget !== "led") {
    throw new PayloadValidationError("첫 통합 출력은 led만 허용합니다.", "safety.outputTarget");
  }

  return {
    householdId: readString(value, "householdId", { required: true, maxLength: 128 })!,
    deviceId: readString(value, "deviceId", { required: true, maxLength: 128 })!,
    schemaVersion: "door-hub-event/1",
    generatedAt: readIsoDate(value, "generatedAt"),
    isDemo: readBoolean(value, "isDemo"),
    session: {
      eventId,
      stage: readEnum(session, "stage", ["idle", "vision-wake", "camera-init", "capture", "end-background", "result-ready", "vision-sleep", "fault"] as const),
      pirActive: readBoolean(session, "pirActive"),
      startedAt: readIsoDate(session, "startedAt"),
      endedAt: endedAtValue === null ? null : readIsoDate(session, "endedAt"),
    },
    vision: {
      status: readEnum(vision, "status", ["ready", "capturing", "sleeping", "fault"] as const),
      visitorPresent: readBoolean(vision, "visitorPresent"),
      objectCount,
      primaryZone,
      zoneMask,
      dwellMs,
      backgroundChangeRatio,
      backgroundChanged: readBoolean(vision, "backgroundChanged"),
      snapshotReady: readBoolean(vision, "snapshotReady"),
      snapshotRef: snapshotRefValue === null || snapshotRefValue === undefined ? null : readString(vision, "snapshotRef", { maxLength: 300 })!,
    },
    safety: {
      heartbeatOk: readBoolean(safety, "heartbeatOk"),
      authArmed: readBoolean(safety, "authArmed"),
      decision: readEnum(safety, "decision", ["none", "allow", "block", "abort"] as const),
      blockReason: blockReasonValue === null || blockReasonValue === undefined ? null : readString(safety, "blockReason", { maxLength: 120 })!,
      faultLatched: readBoolean(safety, "faultLatched"),
      doorClosed: readBoolean(safety, "doorClosed"),
      tamperDetected: readBoolean(safety, "tamperDetected"),
      emergencyStop: readBoolean(safety, "emergencyStop"),
      outputTarget: "led",
      outputActive: readBoolean(safety, "outputActive"),
    },
  };
}
