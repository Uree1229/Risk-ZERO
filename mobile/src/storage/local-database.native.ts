import * as SQLite from "expo-sqlite";
import type {
  ModuleDevice,
  ModuleEvent,
  ModuleSyncState,
} from "../module/contracts";
import {
  DEFAULT_VIDEO_STORAGE_LIMIT_BYTES,
  type StoredVideoRecord,
} from "../media/video-retention";
import type {
  DeviceRegistrationInput,
  DeviceSummary,
  DoorHubSnapshot,
  EventCategory,
  EventLogItem,
  EventReview,
  NotificationPreferences,
  RiskLevel,
  SensorReading,
  SystemSnapshot,
  VideoStorageSummary,
} from "../types";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "../notifications/notification-policy";
import { formatEventTime } from "./event-log";
import { doorHubSnapshotToEventLogItems } from "../door-hub";
import {
  MOBILE_DATABASE_NAME,
  MOBILE_SCHEMA_SQL,
  MOBILE_SCHEMA_VERSION,
} from "./schema";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function incidentIdFor(snapshot: SystemSnapshot) {
  return `incident:${snapshot.sensorEvent.id}`;
}

function assessmentIdFor(snapshot: SystemSnapshot) {
  return `assessment:${snapshot.sensorEvent.id}`;
}

function decisionFromRiskLevel(level: RiskLevel) {
  if (level === "normal") return "pass" as const;
  if (level === "watch") return "inconclusive" as const;
  if (level === "warning" || level === "critical") return "block" as const;
  return "pending" as const;
}

function readingValues(reading: SensorReading) {
  if (typeof reading.value === "number") {
    return ["number", reading.value, null, null] as const;
  }
  if (typeof reading.value === "boolean") {
    return ["boolean", null, null, reading.value ? 1 : 0] as const;
  }
  return ["text", null, reading.value, null] as const;
}

async function getDatabase() {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync(MOBILE_DATABASE_NAME);
      await database.execAsync(MOBILE_SCHEMA_SQL);
      await database.runAsync(
        `INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
        MOBILE_SCHEMA_VERSION,
        new Date().toISOString(),
      );
      return database;
    })();
  }
  return databasePromise;
}

export async function initializeLocalDatabase() {
  await getDatabase();
}

export async function saveDoorHubSnapshotLocally(snapshot: DoorHubSnapshot) {
  const database = await getDatabase();
  const eventId = `${snapshot.deviceId}:${snapshot.session.eventId}`;
  const updatedAt = new Date().toISOString();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO devices
         (id, display_name, provider, transport, created_at, updated_at)
       VALUES (?, ?, 'DoorHubAPI', 'wifi', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider = excluded.provider,
         transport = excluded.transport,
         updated_at = excluded.updated_at`,
      snapshot.deviceId,
      snapshot.deviceId,
      snapshot.generatedAt,
      updatedAt,
    );
    await transaction.runAsync(
      `INSERT INTO device_status
         (device_id, battery_percent, storage_used_bytes, storage_capacity_bytes, last_seen_at)
       VALUES (?, NULL, NULL, NULL, ?)
       ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      snapshot.deviceId,
      snapshot.generatedAt,
    );
    await transaction.runAsync(
      `INSERT INTO door_hub_events
         (id, device_id, external_event_id, stage, safety_decision,
          captured_at, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id, external_event_id) DO UPDATE SET
         stage = excluded.stage,
         safety_decision = excluded.safety_decision,
         captured_at = excluded.captured_at,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at`,
      eventId,
      snapshot.deviceId,
      snapshot.session.eventId,
      snapshot.session.stage,
      snapshot.safety.decision,
      snapshot.generatedAt,
      JSON.stringify(snapshot),
      updatedAt,
    );
  });
}

export async function saveSnapshotLocally(snapshot: SystemSnapshot) {
  const database = await getDatabase();

  const device = snapshot.sensorEvent.source;
  const incidentId = incidentIdFor(snapshot);
  const assessmentId = assessmentIdFor(snapshot);
  const receivedAt = new Date().toISOString();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO devices
         (id, display_name, provider, transport, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider = excluded.provider,
         transport = excluded.transport,
         updated_at = excluded.updated_at`,
      device.deviceId,
      device.deviceId,
      device.provider,
      device.transport,
      snapshot.generatedAt,
      receivedAt,
    );

    await transaction.runAsync(
      `INSERT INTO device_status
         (device_id, battery_percent, storage_used_bytes,
          storage_capacity_bytes, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         battery_percent = COALESCE(excluded.battery_percent, battery_percent),
         storage_used_bytes = COALESCE(excluded.storage_used_bytes, storage_used_bytes),
         storage_capacity_bytes = COALESCE(excluded.storage_capacity_bytes, storage_capacity_bytes),
         last_seen_at = excluded.last_seen_at`,
      device.deviceId,
      device.batteryPercent ?? null,
      device.storageUsedBytes ?? null,
      device.storageCapacityBytes ?? null,
      snapshot.generatedAt,
    );

    await transaction.runAsync(
      `INSERT INTO incidents
         (id, device_id, scenario_key, title, status, max_risk_level,
          max_risk_score, started_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         scenario_key = excluded.scenario_key,
         title = excluded.title,
         max_risk_level = excluded.max_risk_level,
         max_risk_score = excluded.max_risk_score,
         updated_at = excluded.updated_at`,
      incidentId,
      device.deviceId,
      snapshot.scenarioId,
      snapshot.scenarioLabel,
      snapshot.assessment.level,
      snapshot.assessment.score,
      snapshot.generatedAt,
      receivedAt,
    );

    await transaction.runAsync(
      `INSERT INTO sensor_events
         (id, incident_id, device_id, event_type, sequence, dedupe_key,
          captured_at, received_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         incident_id = excluded.incident_id,
         event_type = excluded.event_type,
         captured_at = excluded.captured_at,
         received_at = excluded.received_at`,
      snapshot.sensorEvent.id,
      incidentId,
      device.deviceId,
      `scenario:${snapshot.scenarioId}`,
      snapshot.sensorEvent.id,
      snapshot.generatedAt,
      receivedAt,
    );

    await transaction.runAsync(
      `DELETE FROM sensor_readings WHERE event_id = ?`,
      snapshot.sensorEvent.id,
    );

    for (const reading of snapshot.sensorEvent.readings) {
      const [valueType, valueNumber, valueText, valueBoolean] = readingValues(reading);
      await transaction.runAsync(
        `INSERT INTO sensor_readings
           (id, event_id, metric, label, value_type, value_number, value_text,
            value_boolean, unit, quality, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        `${snapshot.sensorEvent.id}:${reading.id}`,
        snapshot.sensorEvent.id,
        reading.metric,
        reading.label,
        valueType,
        valueNumber,
        valueText,
        valueBoolean,
        reading.unit ?? null,
        reading.quality,
        reading.capturedAt,
      );
    }

    if (snapshot.controlRequest.challengeId) {
      await transaction.runAsync(
        `INSERT INTO challenge_sessions
           (id, phrase, nonce, issued_at, expires_at, used_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           expires_at = excluded.expires_at,
           used_at = excluded.used_at`,
        snapshot.controlRequest.challengeId,
        snapshot.controlRequest.challengePhrase ?? snapshot.controlRequest.transcript,
        snapshot.controlRequest.nonce,
        snapshot.controlRequest.requestedAt,
        snapshot.controlRequest.expiresAt,
        snapshot.verification.evaluatedAt,
      );
    }

    await transaction.runAsync(
      `INSERT INTO control_requests
         (id, device_id, intent, transcript, asr_confidence, requested_at,
          expires_at, challenge_id, nonce)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         transcript = excluded.transcript,
         asr_confidence = excluded.asr_confidence,
         expires_at = excluded.expires_at`,
      snapshot.controlRequest.id,
      device.deviceId,
      snapshot.controlRequest.intent,
      snapshot.controlRequest.transcript,
      snapshot.controlRequest.asrConfidence,
      snapshot.controlRequest.requestedAt,
      snapshot.controlRequest.expiresAt,
      snapshot.controlRequest.challengeId,
      snapshot.controlRequest.nonce,
    );

    await transaction.runAsync(
      `INSERT INTO verification_attempts
         (id, event_id, request_id, schema_version, decision, confidence,
          reason_codes_json, summary, policy_version, evaluated_at,
          processing_time_ms, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         decision = excluded.decision,
         confidence = excluded.confidence,
         reason_codes_json = excluded.reason_codes_json,
         summary = excluded.summary,
         policy_version = excluded.policy_version,
         evaluated_at = excluded.evaluated_at,
         processing_time_ms = excluded.processing_time_ms,
         is_demo = excluded.is_demo`,
      snapshot.verification.id,
      snapshot.sensorEvent.id,
      snapshot.controlRequest.id,
      snapshot.verification.schemaVersion,
      snapshot.verification.decision,
      snapshot.verification.confidence,
      JSON.stringify(snapshot.verification.reasonCodes),
      snapshot.verification.summary,
      snapshot.verification.policyVersion,
      snapshot.verification.evaluatedAt,
      snapshot.verification.processingTimeMs,
      snapshot.verification.isDemo ? 1 : 0,
    );

    const evidence = snapshot.verification.evidence;
    await transaction.runAsync(
      `INSERT INTO verification_evidence
         (attempt_id, person_present, face_count, mouth_visible, audio_detected,
          av_offset_ms, sync_confidence, active_speaker_score,
          audio_spoof_score, visual_spoof_score, challenge_matched,
          audio_quality, video_quality, clock_synchronized, model_versions_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(attempt_id) DO UPDATE SET
         person_present = excluded.person_present,
         face_count = excluded.face_count,
         mouth_visible = excluded.mouth_visible,
         audio_detected = excluded.audio_detected,
         av_offset_ms = excluded.av_offset_ms,
         sync_confidence = excluded.sync_confidence,
         active_speaker_score = excluded.active_speaker_score,
         audio_spoof_score = excluded.audio_spoof_score,
         visual_spoof_score = excluded.visual_spoof_score,
         challenge_matched = excluded.challenge_matched,
         audio_quality = excluded.audio_quality,
         video_quality = excluded.video_quality,
         clock_synchronized = excluded.clock_synchronized,
         model_versions_json = excluded.model_versions_json`,
      snapshot.verification.id,
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
    );

    await transaction.runAsync(
      `INSERT INTO actuation_logs
         (id, attempt_id, request_id, allowed, output, reason, valid_until, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         allowed = excluded.allowed,
         output = excluded.output,
         reason = excluded.reason,
         valid_until = excluded.valid_until,
         executed_at = excluded.executed_at`,
      `actuation:${snapshot.verification.id}`,
      snapshot.verification.id,
      snapshot.controlRequest.id,
      snapshot.gate.allowed ? 1 : 0,
      snapshot.gate.output,
      snapshot.gate.reason,
      snapshot.gate.validUntil,
      null,
    );

    await transaction.runAsync(
      `INSERT INTO risk_assessments
         (id, incident_id, trigger_event_id, engine_name, engine_version,
          policy_version, risk_score, risk_level, summary, reasons_json,
          is_dummy, evaluated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         engine_name = excluded.engine_name,
         engine_version = excluded.engine_version,
         risk_score = excluded.risk_score,
         risk_level = excluded.risk_level,
         summary = excluded.summary,
         reasons_json = excluded.reasons_json,
         is_dummy = excluded.is_dummy,
         evaluated_at = excluded.evaluated_at`,
      assessmentId,
      incidentId,
      snapshot.sensorEvent.id,
      snapshot.assessment.engine,
      snapshot.assessment.algorithmVersion,
      snapshot.assessment.score,
      snapshot.assessment.level,
      snapshot.assessment.summary,
      JSON.stringify(snapshot.assessment.reasons),
      snapshot.generatedAt,
    );

    await transaction.runAsync(
      `DELETE FROM response_actions WHERE incident_id = ? AND assessment_id = ?`,
      incidentId,
      assessmentId,
    );

    for (const action of snapshot.response.actions) {
      await transaction.runAsync(
        `INSERT INTO response_actions
           (id, incident_id, assessment_id, action_type, status, message, executed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        `action:${snapshot.sensorEvent.id}:${action}`,
        incidentId,
        assessmentId,
        action,
        snapshot.response.status,
        snapshot.response.message,
        snapshot.generatedAt,
      );
    }

    for (const recentEvent of snapshot.recentEvents) {
      if (recentEvent.id === snapshot.sensorEvent.id) continue;
      const recentCapturedAt = recentEvent.capturedAt ?? snapshot.generatedAt;
      const recentIncidentId = `incident:history:${recentEvent.id}`;
      const recentAssessmentId = `assessment:history:${recentEvent.id}`;
      await transaction.runAsync(
        `INSERT INTO incidents
           (id, device_id, scenario_key, title, status, max_risk_level,
            max_risk_score, started_at, updated_at)
         VALUES (?, ?, 'history', ?, 'resolved', ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           max_risk_level = excluded.max_risk_level,
           max_risk_score = excluded.max_risk_score,
           updated_at = excluded.updated_at`,
        recentIncidentId,
        device.deviceId,
        recentEvent.title,
        recentEvent.level,
        recentEvent.score,
        recentCapturedAt,
        receivedAt,
      );
      await transaction.runAsync(
        `INSERT INTO sensor_events
           (id, incident_id, device_id, event_type, sequence, dedupe_key,
            captured_at, received_at)
         VALUES (?, ?, ?, 'history', NULL, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           captured_at = excluded.captured_at,
           received_at = excluded.received_at`,
        recentEvent.id,
        recentIncidentId,
        device.deviceId,
        recentEvent.id,
        recentCapturedAt,
        receivedAt,
      );
      await transaction.runAsync(
        `INSERT INTO risk_assessments
           (id, incident_id, trigger_event_id, engine_name, engine_version,
            policy_version, risk_score, risk_level, summary, reasons_json,
            is_dummy, evaluated_at)
         VALUES (?, ?, ?, 'DemoHistory', NULL, NULL, ?, ?, ?, '[]', 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           risk_score = excluded.risk_score,
           risk_level = excluded.risk_level,
           summary = excluded.summary,
           evaluated_at = excluded.evaluated_at`,
        recentAssessmentId,
        recentIncidentId,
        recentEvent.id,
        recentEvent.score,
        recentEvent.level,
        recentEvent.detail,
        recentCapturedAt,
      );
    }

    await transaction.runAsync(
      `INSERT INTO sync_states
         (device_id, last_received_sequence, last_acknowledged_sequence,
          last_connected_at, sync_status, updated_at)
       VALUES (?, 0, 0, ?, 'idle', ?)
       ON CONFLICT(device_id) DO UPDATE SET
         last_connected_at = excluded.last_connected_at,
         updated_at = excluded.updated_at`,
      device.deviceId,
      snapshot.generatedAt,
      receivedAt,
    );
  });
}

export async function loadRecentEvents(limit = 50): Promise<EventLogItem[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer between 1 and 100.");
  }

  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    captured_at: string;
    title: string;
    detail: string;
    risk_level: RiskLevel;
    risk_score: number | null;
    video_local_uri: string | null;
    video_file_name: string | null;
    video_mime_type: string | null;
    video_size_bytes: number | null;
    video_duration_ms: number | null;
    video_checksum_sha256: string | null;
    review_category: EventCategory | null;
    review_is_false_alarm: number | null;
    review_is_important: number | null;
    review_memo: string | null;
    review_reviewed_at: string | null;
    verification_decision: "pending" | "pass" | "block" | "inconclusive" | null;
    verification_confidence: number | null;
    verification_reason_codes_json: string | null;
  }>(
    `SELECT se.id,
            se.captured_at,
            i.title,
            COALESCE(NULLIF(ra.summary, ''), se.event_type) AS detail,
            COALESCE(ra.risk_level, 'pending') AS risk_level,
            ra.risk_score,
            pv.local_uri AS video_local_uri,
            pv.file_name AS video_file_name,
            pv.mime_type AS video_mime_type,
            pv.size_bytes AS video_size_bytes,
            pv.duration_ms AS video_duration_ms,
            pv.checksum_sha256 AS video_checksum_sha256,
            er.category AS review_category,
            er.is_false_alarm AS review_is_false_alarm,
            er.is_important AS review_is_important,
            er.memo AS review_memo,
            er.reviewed_at AS review_reviewed_at
            ,va.decision AS verification_decision
            ,va.confidence AS verification_confidence
            ,va.reason_codes_json AS verification_reason_codes_json
       FROM sensor_events se
       JOIN incidents i ON i.id = se.incident_id
       LEFT JOIN processed_videos pv ON pv.event_id = se.id
       LEFT JOIN event_reviews er ON er.event_id = se.id
       LEFT JOIN verification_attempts va ON va.event_id = se.id
       LEFT JOIN risk_assessments ra ON ra.id = (
         SELECT latest_ra.id
           FROM risk_assessments latest_ra
          WHERE latest_ra.trigger_event_id = se.id
          ORDER BY latest_ra.evaluated_at DESC
          LIMIT 1
       )
      ORDER BY se.captured_at DESC, se.sequence DESC
      LIMIT ?`,
    limit,
  );

  const legacyEvents = rows.map((row) => ({
    id: row.id,
    capturedAt: row.captured_at,
    occurredAt: formatEventTime(row.captured_at),
    title: row.title,
    detail: row.detail,
    level: row.risk_level,
    score: row.risk_score,
    decision: row.verification_decision ?? decisionFromRiskLevel(row.risk_level),
    confidence: row.verification_confidence ?? (row.risk_score === null ? null : Math.max(0, Math.min(1, row.risk_score / 100))),
    reasonCodes: row.verification_reason_codes_json
      ? JSON.parse(row.verification_reason_codes_json) as string[]
      : undefined,
    review: row.review_category
      ? {
          category: row.review_category,
          isFalseAlarm: row.review_is_false_alarm === 1,
          isImportant: row.review_is_important === 1,
          memo: row.review_memo ?? "",
          reviewedAt: row.review_reviewed_at ?? undefined,
        }
      : undefined,
    video:
      row.video_local_uri &&
      row.video_file_name &&
      row.video_mime_type &&
      row.video_size_bytes !== null &&
      row.video_duration_ms !== null
        ? {
            localUri: row.video_local_uri,
            fileName: row.video_file_name,
            mimeType: row.video_mime_type,
            sizeBytes: row.video_size_bytes,
            durationMs: row.video_duration_ms,
            checksumSha256: row.video_checksum_sha256 ?? undefined,
          }
        : undefined,
  }));

  const doorHubRows = await database.getAllAsync<{
    id: string;
    captured_at: string;
    payload_json: string;
    review_category: EventCategory | null;
    review_is_false_alarm: number | null;
    review_is_important: number | null;
    review_memo: string | null;
    review_reviewed_at: string | null;
  }>(
    `SELECT dhe.id, dhe.captured_at, dhe.payload_json,
            dher.category AS review_category,
            dher.is_false_alarm AS review_is_false_alarm,
            dher.is_important AS review_is_important,
            dher.memo AS review_memo,
            dher.reviewed_at AS review_reviewed_at
       FROM door_hub_events dhe
       LEFT JOIN door_hub_event_reviews dher ON dher.event_id = dhe.id
      ORDER BY dhe.captured_at DESC
      LIMIT ?`,
    limit,
  );
  const doorHubEvents = doorHubRows.flatMap((row) => {
    try {
      const snapshot = JSON.parse(row.payload_json) as DoorHubSnapshot;
      const event = doorHubSnapshotToEventLogItems(snapshot)[0];
      if (!event) return [];
      return [{
        ...event,
        id: row.id,
        capturedAt: row.captured_at,
        review: row.review_category ? {
          category: row.review_category,
          isFalseAlarm: row.review_is_false_alarm === 1,
          isImportant: row.review_is_important === 1,
          memo: row.review_memo ?? "",
          reviewedAt: row.review_reviewed_at ?? undefined,
        } : undefined,
      }];
    } catch {
      return [];
    }
  });

  return [...doorHubEvents, ...legacyEvents]
    .sort((left, right) => (right.capturedAt ?? "").localeCompare(left.capturedAt ?? ""))
    .slice(0, limit);
}

export async function saveEventReview(eventId: string, review: EventReview) {
  const database = await getDatabase();
  const reviewedAt = new Date().toISOString();
  const doorHubEvent = await database.getFirstAsync<{ id: string }>(
    `SELECT id FROM door_hub_events WHERE id = ? LIMIT 1`,
    eventId,
  );
  if (doorHubEvent) {
    await database.runAsync(
      `INSERT INTO door_hub_event_reviews
         (event_id, category, is_false_alarm, is_important, memo, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id) DO UPDATE SET
         category = excluded.category,
         is_false_alarm = excluded.is_false_alarm,
         is_important = excluded.is_important,
         memo = excluded.memo,
         reviewed_at = excluded.reviewed_at`,
      eventId,
      review.category,
      review.isFalseAlarm ? 1 : 0,
      review.isImportant ? 1 : 0,
      review.memo.trim(),
      reviewedAt,
    );
    return { ...review, memo: review.memo.trim(), reviewedAt };
  }
  const result = await database.runAsync(
    `INSERT INTO event_reviews
       (event_id, category, is_false_alarm, is_important, memo, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(event_id) DO UPDATE SET
       category = excluded.category,
       is_false_alarm = excluded.is_false_alarm,
       is_important = excluded.is_important,
       memo = excluded.memo,
       reviewed_at = excluded.reviewed_at`,
    eventId,
    review.category,
    review.isFalseAlarm ? 1 : 0,
    review.isImportant ? 1 : 0,
    review.memo.trim(),
    reviewedAt,
  );
  if (result.changes < 1) {
    throw new Error(`Event review was not saved: ${eventId}`);
  }
  return { ...review, memo: review.memo.trim(), reviewedAt };
}

export async function listStoredVideoRecords(): Promise<StoredVideoRecord[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    local_uri: string;
    size_bytes: number;
    captured_at: string;
  }>(
    `SELECT id, local_uri, size_bytes, captured_at
       FROM processed_videos
      ORDER BY captured_at ASC`,
  );
  return rows.map((row) => ({
    id: row.id,
    localUri: row.local_uri,
    sizeBytes: row.size_bytes,
    capturedAt: row.captured_at,
  }));
}

export async function deleteProcessedVideoRecord(videoId: string) {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM processed_videos WHERE id = ?`, videoId);
}

export async function loadVideoStorageSummary(): Promise<VideoStorageSummary> {
  const database = await getDatabase();
  const summary = await database.getFirstAsync<{
    file_count: number;
    total_bytes: number;
  }>(
    `SELECT COUNT(*) AS file_count,
            COALESCE(SUM(size_bytes), 0) AS total_bytes
       FROM processed_videos`,
  );
  return {
    fileCount: summary?.file_count ?? 0,
    totalBytes: summary?.total_bytes ?? 0,
    limitBytes: DEFAULT_VIDEO_STORAGE_LIMIT_BYTES,
  };
}

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'notification_preferences'`,
  );
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  try {
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...(JSON.parse(row.value) as Partial<NotificationPreferences>),
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences,
) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('notification_preferences', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
    JSON.stringify(preferences),
    new Date().toISOString(),
  );
}

export async function reserveRiskNotification(
  eventId: string,
  level: RiskLevel,
  cooldownMinutes: number,
) {
  if (!["watch", "warning", "critical"].includes(level)) return false;
  const database = await getDatabase();
  let reserved = false;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await transaction.getFirstAsync<{ id: string }>(
      `SELECT id FROM notification_deliveries WHERE event_id = ?`,
      eventId,
    );
    if (existing) return;

    const latest = await transaction.getFirstAsync<{ created_at: string }>(
      `SELECT created_at
         FROM notification_deliveries
        WHERE risk_level = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      level,
    );
    const now = new Date();
    if (
      latest &&
      now.getTime() - new Date(latest.created_at).getTime() <
        cooldownMinutes * 60_000
    ) {
      return;
    }

    await transaction.runAsync(
      `INSERT INTO notification_deliveries
         (id, event_id, risk_level, status, notification_identifier, created_at)
       VALUES (?, ?, ?, 'reserved', NULL, ?)`,
      `notification:${eventId}`,
      eventId,
      level,
      now.toISOString(),
    );
    reserved = true;
  });
  return reserved;
}

export async function markRiskNotificationDelivered(
  eventId: string,
  notificationIdentifier: string,
) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE notification_deliveries
        SET status = 'delivered', notification_identifier = ?
      WHERE event_id = ?`,
    notificationIdentifier,
    eventId,
  );
}

export async function releaseRiskNotification(eventId: string) {
  const database = await getDatabase();
  await database.runAsync(
    `DELETE FROM notification_deliveries
      WHERE event_id = ? AND status = 'reserved'`,
    eventId,
  );
}

export async function acknowledgeRiskNotification(eventId: string) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE notification_deliveries
        SET status = 'acknowledged', acknowledged_at = ?
      WHERE event_id = ?`,
    new Date().toISOString(),
    eventId,
  );
}

export async function loadDevices(): Promise<DeviceSummary[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    display_name: string;
    provider: string;
    transport: string;
    sync_status: DeviceSummary["syncStatus"] | null;
    last_connected_at: string | null;
    last_synced_at: string;
    battery_percent: number | null;
    storage_used_bytes: number | null;
    storage_capacity_bytes: number | null;
  }>(
    `SELECT d.id,
            d.display_name,
            d.provider,
            d.transport,
            ss.sync_status,
            ss.last_connected_at,
            COALESCE(ss.updated_at, d.updated_at) AS last_synced_at,
            ds.battery_percent,
            ds.storage_used_bytes,
            ds.storage_capacity_bytes
       FROM devices d
       LEFT JOIN sync_states ss ON ss.device_id = d.id
       LEFT JOIN device_status ds ON ds.device_id = d.id
      ORDER BY COALESCE(ss.last_connected_at, d.updated_at) DESC`,
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    provider: row.provider,
    transport: row.transport,
    syncStatus: row.sync_status ?? "idle",
    lastConnectedAt: row.last_connected_at,
    lastSyncedAt: row.last_synced_at,
    batteryPercent: row.battery_percent,
    storageUsedBytes: row.storage_used_bytes,
    storageCapacityBytes: row.storage_capacity_bytes,
  }));
}

export async function registerDeviceLocally(
  input: DeviceRegistrationInput,
): Promise<DeviceSummary> {
  const id = input.id.trim();
  const displayName = input.displayName.trim();
  if (!id || !displayName) {
    throw new Error("장치 ID와 이름을 입력해 주세요.");
  }
  const database = await getDatabase();
  const now = new Date().toISOString();
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO devices
         (id, display_name, provider, transport, created_at, updated_at)
       VALUES (?, ?, 'ManualRegistration', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         transport = excluded.transport,
         updated_at = excluded.updated_at`,
      id,
      displayName,
      input.transport,
      now,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO sync_states
         (device_id, last_received_sequence, last_acknowledged_sequence,
          last_connected_at, sync_status, updated_at)
       VALUES (?, 0, 0, NULL, 'idle', ?)
       ON CONFLICT(device_id) DO UPDATE SET updated_at = excluded.updated_at`,
      id,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO device_status
         (device_id, battery_percent, storage_used_bytes,
          storage_capacity_bytes, last_seen_at)
       VALUES (?, NULL, NULL, NULL, ?)
       ON CONFLICT(device_id) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      id,
      now,
    );
  });
  const registered = (await loadDevices()).find((device) => device.id === id);
  if (!registered) throw new Error(`등록된 장치를 찾을 수 없습니다: ${id}`);
  return registered;
}

export async function listDeviceStoredVideoRecords(deviceId: string) {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    id: string;
    local_uri: string;
    size_bytes: number;
    captured_at: string;
  }>(
    `SELECT pv.id, pv.local_uri, pv.size_bytes, pv.captured_at
       FROM processed_videos pv
       JOIN sensor_events se ON se.id = pv.event_id
      WHERE se.device_id = ?`,
    deviceId,
  );
  return rows.map((row) => ({
    id: row.id,
    localUri: row.local_uri,
    sizeBytes: row.size_bytes,
    capturedAt: row.captured_at,
  }));
}

export async function deleteDeviceRecord(deviceId: string) {
  const database = await getDatabase();
  await database.runAsync(`DELETE FROM devices WHERE id = ?`, deviceId);
}

function moduleIncidentId(event: ModuleEvent) {
  return `incident:module:${event.id}`;
}

export async function beginModuleSync(
  device: ModuleDevice,
): Promise<ModuleSyncState> {
  const database = await getDatabase();
  const now = new Date().toISOString();

  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO devices
         (id, display_name, provider, transport, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         provider = excluded.provider,
         transport = excluded.transport,
         updated_at = excluded.updated_at`,
      device.id,
      device.displayName,
      device.provider,
      device.transport,
      now,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO device_status
         (device_id, battery_percent, storage_used_bytes,
          storage_capacity_bytes, last_seen_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id) DO UPDATE SET
         battery_percent = COALESCE(excluded.battery_percent, battery_percent),
         storage_used_bytes = COALESCE(excluded.storage_used_bytes, storage_used_bytes),
         storage_capacity_bytes = COALESCE(excluded.storage_capacity_bytes, storage_capacity_bytes),
         last_seen_at = excluded.last_seen_at`,
      device.id,
      device.batteryPercent ?? null,
      device.storageUsedBytes ?? null,
      device.storageCapacityBytes ?? null,
      now,
    );
    await transaction.runAsync(
      `INSERT INTO sync_states
         (device_id, last_received_sequence, last_acknowledged_sequence,
          last_connected_at, sync_status, updated_at)
       VALUES (?, 0, 0, ?, 'syncing', ?)
       ON CONFLICT(device_id) DO UPDATE SET
         last_connected_at = excluded.last_connected_at,
         sync_status = 'syncing',
         updated_at = excluded.updated_at`,
      device.id,
      now,
      now,
    );
  });

  const state = await database.getFirstAsync<{
    device_id: string;
    last_received_sequence: number;
    last_acknowledged_sequence: number;
    sync_status: ModuleSyncState["status"];
  }>(
    `SELECT device_id, last_received_sequence, last_acknowledged_sequence, sync_status
       FROM sync_states
      WHERE device_id = ?`,
    device.id,
  );
  if (!state) throw new Error(`Sync state not found for ${device.id}.`);

  return {
    deviceId: state.device_id,
    lastReceivedSequence: state.last_received_sequence,
    lastAcknowledgedSequence: state.last_acknowledged_sequence,
    status: state.sync_status,
  };
}

export async function saveModuleEvents(
  device: ModuleDevice,
  events: ModuleEvent[],
) {
  if (events.length === 0) return 0;
  const database = await getDatabase();
  const receivedAt = new Date().toISOString();
  let storedEventCount = 0;

  await database.withExclusiveTransactionAsync(async (transaction) => {
    for (const event of events) {
      const incidentId = moduleIncidentId(event);
      await transaction.runAsync(
        `INSERT OR IGNORE INTO incidents
           (id, device_id, scenario_key, title, status, max_risk_level,
            max_risk_score, started_at, updated_at)
         VALUES (?, ?, 'module', ?, 'open', 'pending', NULL, ?, ?)`,
        incidentId,
        device.id,
        event.eventType,
        event.capturedAt,
        receivedAt,
      );

      const insertResult = await transaction.runAsync(
        `INSERT OR IGNORE INTO sensor_events
           (id, incident_id, device_id, event_type, sequence, dedupe_key,
            captured_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        event.id,
        incidentId,
        device.id,
        event.eventType,
        event.sequence,
        event.dedupeKey,
        event.capturedAt,
        receivedAt,
      );

      if (insertResult.changes === 0) continue;
      storedEventCount += 1;

      for (const metric of event.metrics) {
        await transaction.runAsync(
          `INSERT INTO sensor_readings
             (id, event_id, metric, label, value_type, value_number, value_text,
              value_boolean, unit, quality, captured_at)
           VALUES (?, ?, ?, ?, 'number', ?, NULL, NULL, ?, ?, ?)`,
          `${event.id}:${metric.id}`,
          event.id,
          metric.metric,
          metric.label,
          metric.value,
          metric.unit ?? null,
          metric.quality,
          metric.capturedAt,
        );
      }

      if (event.video) {
        await transaction.runAsync(
          `INSERT INTO processed_videos
             (id, event_id, file_name, local_uri, mime_type, size_bytes,
              duration_ms, checksum_sha256, captured_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             local_uri = excluded.local_uri,
             file_name = excluded.file_name,
             mime_type = excluded.mime_type,
             size_bytes = excluded.size_bytes,
             duration_ms = excluded.duration_ms,
             checksum_sha256 = excluded.checksum_sha256`,
          event.video.id,
          event.id,
          event.video.fileName,
          event.video.localUri,
          event.video.mimeType,
          event.video.sizeBytes,
          event.video.durationMs,
          event.video.checksumSha256 ?? null,
          event.video.capturedAt,
        );
      }

      if (event.controlRequest && event.verification) {
        const request = event.controlRequest;
        const verification = event.verification;

        if (request.challengeId) {
          await transaction.runAsync(
            `INSERT INTO challenge_sessions
               (id, phrase, nonce, issued_at, expires_at, used_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               expires_at = excluded.expires_at,
               used_at = excluded.used_at`,
            request.challengeId,
            request.challengePhrase ?? request.transcript,
            request.nonce,
            request.requestedAt,
            request.expiresAt,
            verification.evaluatedAt,
          );
        }

        await transaction.runAsync(
          `INSERT INTO control_requests
             (id, device_id, intent, transcript, asr_confidence, requested_at,
              expires_at, challenge_id, nonce)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             transcript = excluded.transcript,
             asr_confidence = excluded.asr_confidence,
             expires_at = excluded.expires_at`,
          request.id,
          device.id,
          request.intent,
          request.transcript,
          request.asrConfidence,
          request.requestedAt,
          request.expiresAt,
          request.challengeId,
          request.nonce,
        );

        await transaction.runAsync(
          `INSERT INTO verification_attempts
             (id, event_id, request_id, schema_version, decision, confidence,
              reason_codes_json, summary, policy_version, evaluated_at,
              processing_time_ms, is_demo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             decision = excluded.decision,
             confidence = excluded.confidence,
             reason_codes_json = excluded.reason_codes_json,
             summary = excluded.summary,
             policy_version = excluded.policy_version,
             evaluated_at = excluded.evaluated_at,
             processing_time_ms = excluded.processing_time_ms,
             is_demo = excluded.is_demo`,
          verification.id,
          event.id,
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
        );

        const evidence = verification.evidence;
        await transaction.runAsync(
          `INSERT INTO verification_evidence
             (attempt_id, person_present, face_count, mouth_visible, audio_detected,
              av_offset_ms, sync_confidence, active_speaker_score,
              audio_spoof_score, visual_spoof_score, challenge_matched,
              audio_quality, video_quality, clock_synchronized, model_versions_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(attempt_id) DO UPDATE SET
             person_present = excluded.person_present,
             face_count = excluded.face_count,
             mouth_visible = excluded.mouth_visible,
             audio_detected = excluded.audio_detected,
             av_offset_ms = excluded.av_offset_ms,
             sync_confidence = excluded.sync_confidence,
             active_speaker_score = excluded.active_speaker_score,
             audio_spoof_score = excluded.audio_spoof_score,
             visual_spoof_score = excluded.visual_spoof_score,
             challenge_matched = excluded.challenge_matched,
             audio_quality = excluded.audio_quality,
             video_quality = excluded.video_quality,
             clock_synchronized = excluded.clock_synchronized,
             model_versions_json = excluded.model_versions_json`,
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
        );

        if (event.actuation) {
          await transaction.runAsync(
            `INSERT INTO actuation_logs
               (id, attempt_id, request_id, allowed, output, reason, valid_until, executed_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               allowed = excluded.allowed,
               output = excluded.output,
               reason = excluded.reason,
               valid_until = excluded.valid_until,
               executed_at = excluded.executed_at`,
            `actuation:${verification.id}`,
            verification.id,
            request.id,
            event.actuation.allowed ? 1 : 0,
            event.actuation.output,
            event.actuation.reason,
            event.actuation.validUntil,
            null,
          );
        }
      }
    }

    const lastSequence = events[events.length - 1].sequence;
    await transaction.runAsync(
      `UPDATE sync_states
          SET last_received_sequence = max(last_received_sequence, ?),
              updated_at = ?
        WHERE device_id = ?`,
      lastSequence,
      receivedAt,
      device.id,
    );
  });

  return storedEventCount;
}

export async function markModuleEventsAcknowledged(
  deviceId: string,
  sequence: number,
) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE sync_states
        SET last_acknowledged_sequence = max(last_acknowledged_sequence, ?),
            updated_at = ?
      WHERE device_id = ?`,
    sequence,
    new Date().toISOString(),
    deviceId,
  );
}

export async function completeModuleSync(deviceId: string) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE sync_states
        SET sync_status = 'idle', updated_at = ?
      WHERE device_id = ?`,
    new Date().toISOString(),
    deviceId,
  );
}

export async function failModuleSync(deviceId: string, _message: string) {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE sync_states
        SET sync_status = 'error', updated_at = ?
      WHERE device_id = ?`,
    new Date().toISOString(),
    deviceId,
  );
}
