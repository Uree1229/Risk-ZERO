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
       FROM sensor_events se
       JOIN incidents i ON i.id = se.incident_id
       LEFT JOIN processed_videos pv ON pv.event_id = se.id
       LEFT JOIN event_reviews er ON er.event_id = se.id
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

  return rows.map((row) => ({
    id: row.id,
    capturedAt: row.captured_at,
    occurredAt: formatEventTime(row.captured_at),
    title: row.title,
    detail: row.detail,
    level: row.risk_level,
    score: row.risk_score,
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
}

export async function saveEventReview(eventId: string, review: EventReview) {
  const database = await getDatabase();
  const reviewedAt = new Date().toISOString();
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
