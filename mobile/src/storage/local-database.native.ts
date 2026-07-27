import * as SQLite from "expo-sqlite";
import type { SensorReading, SystemSnapshot } from "../types";
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
