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
