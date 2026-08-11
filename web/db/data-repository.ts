import type { EventLogItem, ResponseAction, SensorReading, SystemSnapshot } from "@/lib/domain";
import type {
  IncomingSensorEvent,
  IncomingSensorValue,
  IncomingVerificationAttempt,
  ReadingQuality,
} from "@/lib/api-contract";
import { DEMO_HOUSEHOLD_ID } from "@/lib/api-contract";

interface DeviceRow {
  id: string;
  household_id: string;
  external_device_id: string;
  name: string;
  type: string;
  provider: string;
  transport: string;
  status: string;
  firmware_version: string | null;
  capabilities_json: string | null;
  last_seen_at: string | null;
}

interface IncidentRow {
  id: string;
  household_id: string;
  scenario_key: string | null;
  title: string;
  status: string;
  max_risk_level: string;
  max_risk_score: number | null;
  classification: string;
  is_demo: number;
  started_at: string;
  ended_at: string | null;
  assessment_id?: string | null;
  assessment_status?: string | null;
  score?: number | null;
  level?: string | null;
  summary?: string | null;
  evaluated_at?: string | null;
}

interface EventRow {
  id: string;
  household_id: string;
  incident_id: string | null;
  device_id: string;
  event_type: string;
  sequence: number | null;
  dedupe_key: string;
  payload_version: number;
  data_quality: string;
  raw_payload_json: string | null;
  captured_at: string;
  received_at: string;
  provider?: string;
  external_device_id?: string;
  transport?: string;
}

interface ReadingRow {
  id: string;
  event_id: string;
  metric: string;
  label: string;
  value_type: "number" | "text" | "boolean" | "json";
  value_number: number | null;
  value_text: string | null;
  value_boolean: number | null;
  value_json: string | null;
  unit: string | null;
  confidence: number | null;
  quality: string;
  captured_at: string;
}

interface AssessmentRow {
  id: string;
  incident_id: string;
  trigger_event_id: string | null;
  engine_version_id: string | null;
  status: string;
  engine_name: string;
  algorithm_version: string | null;
  score: number | null;
  level: string;
  confidence: number | null;
  summary: string;
  reasons_json: string | null;
  input_window_start: string | null;
  input_window_end: string | null;
  evaluated_at: string;
}

interface ActionRow {
  id: string;
  incident_id: string;
  assessment_id: string | null;
  target_user_id: string | null;
  action_type: string;
  status: string;
  requires_confirmation: number;
  payload_json: string | null;
  requested_at: string;
  completed_at: string | null;
  error_message: string | null;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asIso(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function asClock(value: string): string {
  const iso = asIso(value);
  return iso.length >= 19 ? iso.slice(11, 19) : value;
}

function asReadingQuality(value: string): SensorReading["quality"] {
  if (value === "good") return "good";
  if (value === "uncertain") return "degraded";
  return "unknown";
}

function decisionFromLegacyLevel(level: string | null | undefined): EventLogItem["decision"] {
  if (level === "normal") return "pass";
  if (level === "watch") return "inconclusive";
  if (level === "warning" || level === "critical") return "block";
  return "pending";
}

function valueFromReading(row: ReadingRow): boolean | number | string {
  if (row.value_type === "number") return row.value_number ?? 0;
  if (row.value_type === "boolean") return row.value_boolean === 1;
  if (row.value_type === "json") return JSON.stringify(parseJson(row.value_json, null));
  return row.value_text ?? "";
}

function serializeValue(value: IncomingSensorValue) {
  if (typeof value === "number") {
    return { type: "number", number: value, text: null, boolean: null, json: null } as const;
  }
  if (typeof value === "boolean") {
    return { type: "boolean", number: null, text: null, boolean: value ? 1 : 0, json: null } as const;
  }
  if (typeof value === "string") {
    return { type: "text", number: null, text: value, boolean: null, json: null } as const;
  }
  return { type: "json", number: null, text: null, boolean: null, json: JSON.stringify(value) } as const;
}

async function results<T>(statement: D1PreparedStatement): Promise<T[]> {
  const response = await statement.all<T>();
  return response.results ?? [];
}

async function findDevice(db: D1Database, householdId: string, externalDeviceId: string) {
  return db
    .prepare(
      `SELECT id, household_id, external_device_id, name, type, provider, transport,
              status, firmware_version, capabilities_json, last_seen_at
       FROM devices
       WHERE household_id = ? AND external_device_id = ? AND status != 'retired'
       LIMIT 1`
    )
    .bind(householdId, externalDeviceId)
    .first<DeviceRow>();
}

async function findOpenIncident(db: D1Database, householdId: string, cutoff: string) {
  return db
    .prepare(
      `SELECT i.id
       FROM incidents i
       LEFT JOIN sensor_events e ON e.incident_id = i.id
       WHERE i.household_id = ? AND i.status IN ('open', 'monitoring') AND i.is_demo = 0
       GROUP BY i.id
       HAVING MAX(e.captured_at) IS NULL OR MAX(e.captured_at) >= ?
       ORDER BY i.started_at DESC
       LIMIT 1`
    )
    .bind(householdId, cutoff)
    .first<{ id: string }>();
}

export async function ingestSensorEvent(db: D1Database, input: IncomingSensorEvent) {
  const device = await findDevice(db, input.householdId, input.deviceId);
  if (!device) {
    throw new RepositoryError("등록된 장치를 찾을 수 없습니다.", 404, "DEVICE_NOT_FOUND");
  }

  const duplicate = await db
    .prepare("SELECT id, incident_id FROM sensor_events WHERE device_id = ? AND dedupe_key = ? LIMIT 1")
    .bind(device.id, input.dedupeKey)
    .first<{ id: string; incident_id: string | null }>();
  if (duplicate) {
    return { eventId: duplicate.id, incidentId: duplicate.incident_id, duplicate: true };
  }

  let incidentId = input.incidentId;
  if (incidentId) {
    const incident = await db
      .prepare("SELECT id FROM incidents WHERE id = ? AND household_id = ? LIMIT 1")
      .bind(incidentId, input.householdId)
      .first<{ id: string }>();
    if (!incident) throw new RepositoryError("해당 주거의 사건을 찾을 수 없습니다.", 404, "INCIDENT_NOT_FOUND");
  } else {
    const cutoff = new Date(Date.now() - 120_000).toISOString();
    incidentId = (await findOpenIncident(db, input.householdId, cutoff))?.id;
  }

  const now = new Date().toISOString();
  const eventId = input.eventId ?? `evt_${crypto.randomUUID()}`;
  const isNewIncident = !incidentId;
  incidentId ??= `inc_${crypto.randomUUID()}`;

  const statements: D1PreparedStatement[] = [];
  if (isNewIncident) {
    statements.push(
      db
        .prepare(
          `INSERT INTO incidents
             (id, household_id, scenario_key, title, status, max_risk_level, classification,
              is_demo, started_at, created_at, updated_at)
           VALUES (?, ?, NULL, ?, 'monitoring', 'pending', 'unknown', 0, ?, ?, ?)`
        )
        .bind(incidentId, input.householdId, "센서 수신 사건", input.capturedAt, now, now)
    );
  } else {
    statements.push(
      db.prepare("UPDATE incidents SET status = 'monitoring', updated_at = ? WHERE id = ?").bind(now, incidentId)
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO sensor_events
           (id, household_id, incident_id, device_id, event_type, sequence, dedupe_key,
            payload_version, data_quality, raw_payload_json, captured_at, received_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        eventId,
        input.householdId,
        incidentId,
        device.id,
        input.eventType,
        input.sequence ?? null,
        input.dedupeKey,
        input.payloadVersion,
        input.readings.some((reading) => reading.quality !== "good") ? "uncertain" : "good",
        input.rawPayload ? JSON.stringify(input.rawPayload) : null,
        input.capturedAt,
        now,
        now
      )
  );

  input.readings.forEach((reading) => {
    const value = serializeValue(reading.value);
    statements.push(
      db
        .prepare(
          `INSERT INTO sensor_readings
             (id, event_id, metric, label, value_type, value_number, value_text, value_boolean,
              value_json, unit, confidence, quality, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          `reading_${crypto.randomUUID()}`,
          eventId,
          reading.metric,
          reading.label,
          value.type,
          value.number,
          value.text,
          value.boolean,
          value.json,
          reading.unit ?? null,
          reading.confidence ?? null,
          reading.quality,
          reading.capturedAt
        )
    );
  });

  try {
    await db.batch(statements);
  } catch (error) {
    const racedDuplicate = await db
      .prepare("SELECT id, incident_id FROM sensor_events WHERE device_id = ? AND dedupe_key = ? LIMIT 1")
      .bind(device.id, input.dedupeKey)
      .first<{ id: string; incident_id: string | null }>();
    if (racedDuplicate) {
      return { eventId: racedDuplicate.id, incidentId: racedDuplicate.incident_id, duplicate: true };
    }
    throw error;
  }

  return { eventId, incidentId, duplicate: false };
}

export async function ingestVerificationAttempt(db: D1Database, input: IncomingVerificationAttempt) {
  const device = await findDevice(db, input.householdId, input.controlRequest.deviceId);
  if (!device) throw new RepositoryError("등록된 장치를 찾을 수 없습니다.", 404, "DEVICE_NOT_FOUND");

  const event = await db
    .prepare("SELECT id FROM sensor_events WHERE id = ? AND household_id = ? AND device_id = ? LIMIT 1")
    .bind(input.eventId, input.householdId, device.id)
    .first<{ id: string }>();
  if (!event) throw new RepositoryError("검증에 연결할 이벤트를 찾을 수 없습니다.", 404, "EVENT_NOT_FOUND");

  const duplicate = await db
    .prepare("SELECT id FROM verification_attempts WHERE id = ? OR event_id = ? LIMIT 1")
    .bind(input.verification.id, input.eventId)
    .first<{ id: string }>();
  if (duplicate) return { verificationId: duplicate.id, eventId: input.eventId, duplicate: true };

  if (input.gate.allowed && input.verification.decision !== "pass") {
    throw new RepositoryError("PASS가 아닌 검증 결과에는 제어를 허용할 수 없습니다.", 409, "UNSAFE_GATE_RESULT");
  }
  if (!input.gate.allowed && input.gate.output !== "none") {
    throw new RepositoryError("차단된 요청의 출력은 none이어야 합니다.", 409, "UNSAFE_GATE_RESULT");
  }
  const expectedOutput = input.controlRequest.intent === "status"
    ? "none"
    : `${input.controlRequest.intent}_pulse`;
  if (input.gate.allowed && input.gate.output !== expectedOutput) {
    throw new RepositoryError("요청 의도와 제어 출력이 일치하지 않습니다.", 409, "UNSAFE_GATE_RESULT");
  }
  if (Date.parse(input.controlRequest.expiresAt) < Date.parse(input.controlRequest.requestedAt)) {
    throw new RepositoryError("제어 요청 만료시각이 요청시각보다 빠릅니다.", 409, "UNSAFE_GATE_RESULT");
  }
  if (input.gate.allowed && Date.parse(input.gate.validUntil) <= Date.parse(input.verification.evaluatedAt)) {
    throw new RepositoryError("이미 만료된 제어 게이트는 허용할 수 없습니다.", 409, "UNSAFE_GATE_RESULT");
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const request = input.controlRequest;
  const verification = input.verification;
  const evidence = verification.evidence;

  if (request.challengeId) {
    statements.push(
      db
        .prepare(
          `INSERT INTO challenge_sessions
             (id, household_id, phrase, nonce, issued_at, expires_at, used_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          request.challengeId,
          input.householdId,
          request.challengePhrase ?? request.transcript,
          request.nonce,
          request.requestedAt,
          request.expiresAt,
          verification.evaluatedAt,
          now
        )
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO control_requests
           (id, household_id, device_id, intent, transcript, asr_confidence,
            requested_at, expires_at, challenge_id, nonce, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        request.id,
        input.householdId,
        device.id,
        request.intent,
        request.transcript,
        request.asrConfidence,
        request.requestedAt,
        request.expiresAt,
        request.challengeId,
        request.nonce,
        now
      ),
    db
      .prepare(
        `INSERT INTO verification_attempts
           (id, household_id, event_id, request_id, schema_version, decision,
            confidence, reason_codes_json, summary, policy_version, evaluated_at,
            processing_time_ms, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        verification.id,
        input.householdId,
        input.eventId,
        request.id,
        verification.schemaVersion,
        verification.decision,
        verification.confidence,
        JSON.stringify(verification.reasonCodes),
        verification.summary,
        verification.policyVersion,
        verification.evaluatedAt,
        verification.processingTimeMs,
        verification.isDemo ? 1 : 0,
        now
      ),
    db
      .prepare(
        `INSERT INTO verification_evidence
           (attempt_id, person_present, face_count, mouth_visible, audio_detected,
            av_offset_ms, sync_confidence, active_speaker_score, audio_spoof_score,
            visual_spoof_score, challenge_matched, audio_quality, video_quality,
            clock_synchronized, model_versions_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        verification.id,
        evidence.personPresent ? 1 : 0,
        evidence.faceCount,
        evidence.mouthVisible ? 1 : 0,
        evidence.audioDetected ? 1 : 0,
        evidence.avOffsetMs,
        evidence.syncConfidence,
        evidence.activeSpeakerScore,
        evidence.audioSpoofScore,
        evidence.visualSpoofScore,
        evidence.challengeMatched === null ? null : evidence.challengeMatched ? 1 : 0,
        evidence.audioQuality,
        evidence.videoQuality,
        evidence.clockSynchronized ? 1 : 0,
        JSON.stringify(evidence.modelVersions),
        now
      ),
    db
      .prepare(
        `INSERT INTO actuation_logs
           (id, household_id, attempt_id, request_id, allowed, output, reason,
            valid_until, executed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`
      )
      .bind(
        `actuation:${verification.id}`,
        input.householdId,
        verification.id,
        request.id,
        input.gate.allowed ? 1 : 0,
        input.gate.output,
        input.gate.reason,
        input.gate.validUntil,
        now
      )
  );

  try {
    await db.batch(statements);
  } catch (error) {
    const racedDuplicate = await db
      .prepare("SELECT id FROM verification_attempts WHERE id = ? OR event_id = ? LIMIT 1")
      .bind(verification.id, input.eventId)
      .first<{ id: string }>();
    if (racedDuplicate) return { verificationId: racedDuplicate.id, eventId: input.eventId, duplicate: true };
    throw error;
  }

  return { verificationId: verification.id, eventId: input.eventId, duplicate: false };
}

export async function listVerificationAttempts(db: D1Database, householdId: string, limit = 50) {
  const rows = await results<{
    id: string;
    event_id: string;
    request_id: string;
    intent: string;
    transcript: string;
    decision: string;
    confidence: number | null;
    reason_codes_json: string;
    summary: string;
    policy_version: string;
    evaluated_at: string;
    processing_time_ms: number;
    is_demo: number;
    allowed: number | null;
    output: string | null;
  }>(
    db
      .prepare(
        `SELECT va.id, va.event_id, va.request_id, cr.intent, cr.transcript,
                va.decision, va.confidence, va.reason_codes_json, va.summary,
                va.policy_version, va.evaluated_at, va.processing_time_ms, va.is_demo,
                al.allowed, al.output
           FROM verification_attempts va
           JOIN control_requests cr ON cr.id = va.request_id
           LEFT JOIN actuation_logs al ON al.attempt_id = va.id
          WHERE va.household_id = ?
          ORDER BY va.evaluated_at DESC
          LIMIT ?`
      )
      .bind(householdId, limit)
  );

  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    requestId: row.request_id,
    intent: row.intent,
    transcript: row.transcript,
    decision: row.decision,
    confidence: row.confidence,
    reasonCodes: parseJson<string[]>(row.reason_codes_json, []),
    summary: row.summary,
    policyVersion: row.policy_version,
    evaluatedAt: asIso(row.evaluated_at),
    processingTimeMs: row.processing_time_ms,
    isDemo: row.is_demo === 1,
    gate: row.allowed === null ? null : { allowed: row.allowed === 1, output: row.output },
  }));
}

export async function listSensorEvents(db: D1Database, householdId: string, limit = 50) {
  const rows = await results<EventRow>(
    db
      .prepare(
        `SELECT e.id, e.household_id, e.incident_id, e.device_id, e.event_type, e.sequence,
                e.dedupe_key, e.payload_version, e.data_quality, e.raw_payload_json,
                e.captured_at, e.received_at, d.provider, d.external_device_id, d.transport
         FROM sensor_events e
         JOIN devices d ON d.id = e.device_id
         WHERE e.household_id = ?
         ORDER BY e.captured_at DESC
         LIMIT ?`
      )
      .bind(householdId, limit)
  );
  return rows.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    incidentId: row.incident_id,
    eventType: row.event_type,
    sequence: row.sequence,
    dataQuality: row.data_quality,
    capturedAt: asIso(row.captured_at),
    receivedAt: asIso(row.received_at),
    source: {
      provider: row.provider,
      deviceId: row.external_device_id,
      transport: row.transport,
    },
  }));
}

export async function listIncidents(
  db: D1Database,
  householdId: string,
  options: { limit?: number; status?: string } = {}
) {
  const limit = options.limit ?? 30;
  const status = options.status ?? null;
  const rows = await results<IncidentRow>(
    db
      .prepare(
        `SELECT i.id, i.household_id, i.scenario_key, i.title, i.status, i.max_risk_level,
                i.max_risk_score, i.classification, i.is_demo, i.started_at, i.ended_at,
                ra.id AS assessment_id, ra.status AS assessment_status, ra.score, ra.level,
                ra.summary, ra.evaluated_at
         FROM incidents i
         LEFT JOIN risk_assessments ra ON ra.id = (
           SELECT latest.id FROM risk_assessments latest
           WHERE latest.incident_id = i.id
           ORDER BY latest.evaluated_at DESC LIMIT 1
         )
         WHERE i.household_id = ? AND (? IS NULL OR i.status = ?)
         ORDER BY i.started_at DESC
         LIMIT ?`
      )
      .bind(householdId, status, status, limit)
  );
  return rows.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    scenarioKey: row.scenario_key,
    title: row.title,
    status: row.status,
    classification: row.classification,
    isDemo: row.is_demo === 1,
    startedAt: asIso(row.started_at),
    endedAt: row.ended_at ? asIso(row.ended_at) : null,
    risk: {
      score: row.score ?? row.max_risk_score,
      level: row.level ?? row.max_risk_level,
      status: row.assessment_status ?? "pending",
      summary: row.summary ?? "위험도 평가 대기 중",
      evaluatedAt: row.evaluated_at ? asIso(row.evaluated_at) : null,
    },
  }));
}

export async function getIncidentDetail(db: D1Database, incidentId: string) {
  const incident = await db
    .prepare(
      `SELECT id, household_id, scenario_key, title, status, max_risk_level, max_risk_score,
              classification, is_demo, started_at, ended_at
       FROM incidents WHERE id = ? LIMIT 1`
    )
    .bind(incidentId)
    .first<IncidentRow>();
  if (!incident) throw new RepositoryError("사건을 찾을 수 없습니다.", 404, "INCIDENT_NOT_FOUND");

  const [events, readings, assessments, actions, feedback] = await Promise.all([
    results<EventRow>(
      db
        .prepare(
          `SELECT e.id, e.household_id, e.incident_id, e.device_id, e.event_type, e.sequence,
                  e.dedupe_key, e.payload_version, e.data_quality, e.raw_payload_json,
                  e.captured_at, e.received_at, d.provider, d.external_device_id, d.transport
           FROM sensor_events e JOIN devices d ON d.id = e.device_id
           WHERE e.incident_id = ? ORDER BY e.captured_at ASC`
        )
        .bind(incidentId)
    ),
    results<ReadingRow>(
      db
        .prepare(
          `SELECT r.* FROM sensor_readings r
           JOIN sensor_events e ON e.id = r.event_id
           WHERE e.incident_id = ? ORDER BY r.captured_at ASC, r.metric ASC`
        )
        .bind(incidentId)
    ),
    results<AssessmentRow>(
      db.prepare("SELECT * FROM risk_assessments WHERE incident_id = ? ORDER BY evaluated_at ASC").bind(incidentId)
    ),
    results<ActionRow>(
      db.prepare("SELECT * FROM response_actions WHERE incident_id = ? ORDER BY requested_at ASC").bind(incidentId)
    ),
    results<{ id: string; user_id: string | null; label: string; note: string | null; created_at: string }>(
      db.prepare("SELECT id, user_id, label, note, created_at FROM incident_feedback WHERE incident_id = ?").bind(incidentId)
    ),
  ]);

  const readingsByEvent = new Map<string, ReadingRow[]>();
  readings.forEach((reading) => {
    const current = readingsByEvent.get(reading.event_id) ?? [];
    current.push(reading);
    readingsByEvent.set(reading.event_id, current);
  });

  return {
    id: incident.id,
    householdId: incident.household_id,
    scenarioKey: incident.scenario_key,
    title: incident.title,
    status: incident.status,
    classification: incident.classification,
    isDemo: incident.is_demo === 1,
    maxRisk: { level: incident.max_risk_level, score: incident.max_risk_score },
    startedAt: asIso(incident.started_at),
    endedAt: incident.ended_at ? asIso(incident.ended_at) : null,
    events: events.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      sequence: event.sequence,
      dataQuality: event.data_quality,
      capturedAt: asIso(event.captured_at),
      receivedAt: asIso(event.received_at),
      source: {
        provider: event.provider,
        deviceId: event.external_device_id,
        transport: event.transport,
      },
      readings: (readingsByEvent.get(event.id) ?? []).map((reading) => ({
        id: reading.id,
        metric: reading.metric,
        label: reading.label,
        value: valueFromReading(reading),
        unit: reading.unit,
        confidence: reading.confidence,
        quality: reading.quality,
        capturedAt: asIso(reading.captured_at),
      })),
    })),
    assessments: assessments.map((assessment) => ({
      id: assessment.id,
      status: assessment.status,
      engine: assessment.engine_name,
      algorithmVersion: assessment.algorithm_version,
      score: assessment.score,
      level: assessment.level,
      confidence: assessment.confidence,
      summary: assessment.summary,
      reasons: parseJson<string[]>(assessment.reasons_json, []),
      evaluatedAt: asIso(assessment.evaluated_at),
    })),
    actions: actions.map((action) => ({
      id: action.id,
      type: action.action_type,
      status: action.status,
      targetUserId: action.target_user_id,
      requiresConfirmation: action.requires_confirmation === 1,
      requestedAt: asIso(action.requested_at),
      completedAt: action.completed_at ? asIso(action.completed_at) : null,
      errorMessage: action.error_message,
    })),
    feedback: feedback.map((item) => ({
      id: item.id,
      userId: item.user_id,
      label: item.label,
      note: item.note,
      createdAt: asIso(item.created_at),
    })),
  };
}

export async function getLatestIncident(db: D1Database, householdId: string) {
  const [latest] = await listIncidents(db, householdId, { limit: 1 });
  if (!latest) throw new RepositoryError("등록된 사건이 없습니다.", 404, "INCIDENT_NOT_FOUND");
  return getIncidentDetail(db, latest.id);
}

export async function listDevices(db: D1Database, householdId: string) {
  const rows = await results<DeviceRow>(
    db
      .prepare(
        `SELECT id, household_id, external_device_id, name, type, provider, transport,
                status, firmware_version, capabilities_json, last_seen_at
         FROM devices WHERE household_id = ? ORDER BY name ASC`
      )
      .bind(householdId)
  );
  return rows.map((row) => ({
    id: row.id,
    householdId: row.household_id,
    externalDeviceId: row.external_device_id,
    name: row.name,
    type: row.type,
    provider: row.provider,
    transport: row.transport,
    status: row.status,
    firmwareVersion: row.firmware_version,
    capabilities: parseJson<string[]>(row.capabilities_json, []),
    lastSeenAt: row.last_seen_at ? asIso(row.last_seen_at) : null,
  }));
}

export async function saveIncidentFeedback(
  db: D1Database,
  incidentId: string,
  input: { userId: string; label: string; note?: string }
) {
  const allowed = ["normal_visit", "confirmed_risk", "false_alarm", "test", "unsure"];
  if (!allowed.includes(input.label)) {
    throw new RepositoryError("지원하지 않는 피드백 값입니다.", 400, "INVALID_FEEDBACK");
  }
  const incident = await db.prepare("SELECT id FROM incidents WHERE id = ?").bind(incidentId).first<{ id: string }>();
  if (!incident) throw new RepositoryError("사건을 찾을 수 없습니다.", 404, "INCIDENT_NOT_FOUND");
  const user = await db.prepare("SELECT id FROM users WHERE id = ?").bind(input.userId).first<{ id: string }>();
  if (!user) throw new RepositoryError("사용자를 찾을 수 없습니다.", 404, "USER_NOT_FOUND");

  const id = `feedback_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const classification = input.label === "unsure" ? "unknown" : input.label;
  await db.batch([
    db
      .prepare(
        `INSERT INTO incident_feedback (id, incident_id, user_id, label, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(incident_id, user_id)
         DO UPDATE SET label = excluded.label, note = excluded.note, created_at = excluded.created_at`
      )
      .bind(id, incidentId, input.userId, input.label, input.note ?? null, now),
    db.prepare("UPDATE incidents SET classification = ?, updated_at = ? WHERE id = ?").bind(classification, now, incidentId),
  ]);
  return { incidentId, userId: input.userId, label: input.label, savedAt: now };
}

const scenarioLabels: Record<string, string> = {
  pass: "현장 발화 통과",
  "audio-replay": "음성 재생 차단",
  "sync-mismatch": "싱크 불일치 차단",
  inconclusive: "판단 불가",
};

const scenarioAliases: Record<string, string> = {
  normal: "pass",
  watch: "inconclusive",
  warning: "sync-mismatch",
  critical: "audio-replay",
};

const legacyScenarioKeys: Record<string, string> = {
  pass: "normal",
  inconclusive: "watch",
  "sync-mismatch": "warning",
  "audio-replay": "critical",
};

const responseMessages: Record<string, string> = {
  pass: "제어 요청을 3초 동안 허용합니다.",
  "audio-replay": "문 제어를 차단하고 사건을 기록했습니다.",
  "sync-mismatch": "문 제어를 차단하고 재시도를 요청합니다.",
  inconclusive: "문 제어를 유지하고 앱 확인을 요청합니다.",
};

export async function buildDatabaseSnapshot(db: D1Database, requestedScenario: string): Promise<SystemSnapshot> {
  const normalizedScenario = scenarioAliases[requestedScenario] ?? requestedScenario;
  const scenarioId = scenarioLabels[normalizedScenario] ? normalizedScenario : "pass";
  const databaseScenarioKey = legacyScenarioKeys[scenarioId];
  const incident = await db
    .prepare(
      `SELECT id, household_id, scenario_key, title, status, max_risk_level, max_risk_score,
              classification, is_demo, started_at, ended_at
       FROM incidents WHERE household_id = ? AND scenario_key = ? LIMIT 1`
    )
    .bind(DEMO_HOUSEHOLD_ID, databaseScenarioKey)
    .first<IncidentRow>();
  if (!incident) throw new RepositoryError("DB 더미 시나리오가 없습니다.", 404, "DEMO_SCENARIO_NOT_FOUND");

  const event = await db
    .prepare(
      `SELECT e.id, e.household_id, e.incident_id, e.device_id, e.event_type, e.sequence,
              e.dedupe_key, e.payload_version, e.data_quality, e.raw_payload_json,
              e.captured_at, e.received_at, d.provider, d.external_device_id, d.transport
       FROM sensor_events e JOIN devices d ON d.id = e.device_id
       WHERE e.incident_id = ? ORDER BY e.captured_at DESC LIMIT 1`
    )
    .bind(incident.id)
    .first<EventRow>();
  const assessment = await db
    .prepare("SELECT * FROM risk_assessments WHERE incident_id = ? ORDER BY evaluated_at DESC LIMIT 1")
    .bind(incident.id)
    .first<AssessmentRow>();
  if (!event || !assessment) throw new RepositoryError("더미 이벤트 또는 평가가 없습니다.", 404, "DEMO_DATA_INCOMPLETE");

  const [readingRows, actionRows, recentRows] = await Promise.all([
    results<ReadingRow>(db.prepare("SELECT * FROM sensor_readings WHERE event_id = ? ORDER BY metric ASC").bind(event.id)),
    results<ActionRow>(
      db.prepare("SELECT * FROM response_actions WHERE incident_id = ? ORDER BY requested_at ASC").bind(incident.id)
    ),
    results<IncidentRow>(
      db
        .prepare(
          `SELECT i.id, i.title, i.started_at, i.max_risk_score, i.max_risk_level,
                  ra.score, ra.level, ra.summary
           FROM incidents i
           LEFT JOIN risk_assessments ra ON ra.id = (
             SELECT latest.id FROM risk_assessments latest
             WHERE latest.incident_id = i.id ORDER BY latest.evaluated_at DESC LIMIT 1
           )
           WHERE i.household_id = ? ORDER BY i.started_at DESC LIMIT 5`
        )
        .bind(DEMO_HOUSEHOLD_ID)
    ),
  ]);

  const actions = actionRows
    .map((row) => row.action_type)
    .filter((action): action is ResponseAction =>
      ["standby", "local_alert", "camera_preview", "guardian_notice", "confirm_emergency_call"].includes(action)
    );
  const recentEvents: EventLogItem[] = recentRows.map((row) => ({
    id: row.id,
    occurredAt: asClock(row.started_at),
    title: row.title,
    detail: row.summary ?? "이벤트 기록",
    level: (row.level ?? row.max_risk_level) as EventLogItem["level"],
    score: row.score ?? row.max_risk_score,
    decision: decisionFromLegacyLevel(row.level ?? row.max_risk_level),
    confidence: (row.score ?? row.max_risk_score) === null ? null : Math.max(0, Math.min(1, (row.score ?? row.max_risk_score ?? 0) / 100)),
  }));

  const decision = decisionFromLegacyLevel(assessment.level);
  const confidence = assessment.score === null ? null : Math.max(0, Math.min(1, assessment.score / 100));
  const generatedAt = new Date().toISOString();
  const requestId = `request-${event.id}`;
  const expiresAt = new Date(Date.now() + 15_000).toISOString();
  const validUntil = new Date(Date.now() + 3_000).toISOString();
  const reasonCodes = parseJson<string[]>(assessment.reasons_json, []);

  return {
    mode: "demo",
    scenarioId,
    scenarioLabel: scenarioLabels[scenarioId],
    generatedAt,
    controlRequest: {
      id: requestId,
      deviceId: event.external_device_id ?? "RZ-EDGE-DEMO-01",
      intent: "unlock",
      transcript: "초록 우산 문 열어",
      asrConfidence: 0.94,
      requestedAt: generatedAt,
      expiresAt,
      challengeId: `challenge-${event.id}`,
      nonce: `demo-nonce-${event.id}`,
      challengePhrase: "초록 우산 문 열어",
    },
    sensorEvent: {
      id: event.id,
      sequence: event.sequence ?? 0,
      capturedAt: asIso(event.captured_at),
      source: {
        provider: event.provider ?? "D1DemoSeed",
        deviceId: event.external_device_id ?? "RZ-DEMO-01",
        transport: (event.transport ?? "demo") as "demo",
      },
      readings: readingRows.map((row) => ({
        id: row.id,
        metric: row.metric,
        label: row.label,
        value: valueFromReading(row),
        ...(row.unit ? { unit: row.unit } : {}),
        quality: asReadingQuality(row.quality),
        capturedAt: asIso(row.captured_at),
      })),
    },
    assessment: {
      status: "demo",
      engine: assessment.engine_name,
      algorithmVersion: null,
      score: assessment.score,
      level: assessment.level as EventLogItem["level"],
      summary: assessment.summary,
      reasons: parseJson<string[]>(assessment.reasons_json, []),
      evaluatedAt: asIso(assessment.evaluated_at),
    },
    verification: {
      id: `verification-${event.id}`,
      schemaVersion: "av-verification/1",
      decision,
      confidence,
      reasonCodes,
      summary: assessment.summary,
      policyVersion: "av-policy/0.1",
      evaluatedAt: asIso(assessment.evaluated_at),
      processingTimeMs: 0,
      isDemo: true,
      evidence: {
        personPresent: true,
        faceCount: 1,
        mouthVisible: true,
        audioDetected: true,
        avOffsetMs: null,
        syncConfidence: confidence,
        activeSpeakerScore: null,
        audioSpoofScore: null,
        visualSpoofScore: null,
        challengeMatched: null,
        audioQuality: "degraded",
        videoQuality: "degraded",
        clockSynchronized: false,
        modelVersions: { compatibility: "legacy-d1" },
      },
    },
    gate: {
      allowed: decision === "pass",
      output: decision === "pass" ? "unlock_pulse" : "none",
      reason: decision === "pass" ? "verified" : `verification_${decision}`,
      validUntil,
    },
    response: {
      status: "preview",
      actions,
      message: responseMessages[scenarioId],
    },
    pipeline: [
      { id: "capture", label: "카메라·마이크", detail: "이전 D1 시드 호환 데이터", state: "pending" },
      { id: "normalize", label: "증거 정규화", detail: "av-verification/1 변환", state: "ready" },
      { id: "verify", label: "시청각 검증", detail: "이전 평가 데이터 호환 표시", state: "demo" },
      { id: "gate", label: "제어 게이트", detail: "실제 문 제어 없음", state: "demo" },
    ],
    recentEvents,
  };
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export function isRepositoryError(error: unknown): error is RepositoryError {
  return error instanceof RepositoryError;
}

export function normalizeLimit(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function normalizeQuality(value: string): ReadingQuality {
  return (["good", "uncertain", "bad", "missing"] as string[]).includes(value)
    ? (value as ReadingQuality)
    : "uncertain";
}
