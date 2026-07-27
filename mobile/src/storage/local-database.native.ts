import * as SQLite from "expo-sqlite";
import type {
  ModuleDevice,
  ModuleEvent,
  ModuleSyncState,
} from "../module/contracts";
import type {
  EventLogItem,
  RiskLevel,
  SensorReading,
  SystemSnapshot,
} from "../types";
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

    await transaction.runAsync(
      `INSERT INTO sync_states
         (device_id, last_received_sequence, last_acknowledged_sequence,
          last_connected_at, sync_status, updated_at)
       VALUES (?, 0, 0, NULL, 'idle', ?)
       ON CONFLICT(device_id) DO UPDATE SET updated_at = excluded.updated_at`,
      device.deviceId,
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
  }>(
    `SELECT se.id,
            se.captured_at,
            i.title,
            COALESCE(NULLIF(ra.summary, ''), se.event_type) AS detail,
            COALESCE(ra.risk_level, 'pending') AS risk_level,
            ra.risk_score
       FROM sensor_events se
       JOIN incidents i ON i.id = se.incident_id
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
    occurredAt: formatEventTime(row.captured_at),
    title: row.title,
    detail: row.detail,
    level: row.risk_level,
    score: row.risk_score,
  }));
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
