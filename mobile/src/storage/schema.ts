export const MOBILE_DATABASE_NAME = "risk-zero.db";
export const MOBILE_SCHEMA_VERSION = 5;

export const MOBILE_SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  transport TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  scenario_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved')),
  max_risk_level TEXT NOT NULL DEFAULT 'pending'
    CHECK (max_risk_level IN ('pending', 'normal', 'watch', 'warning', 'critical')),
  max_risk_score REAL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensor_events (
  id TEXT PRIMARY KEY NOT NULL,
  incident_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  sequence INTEGER,
  dedupe_key TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE (device_id, dedupe_key),
  UNIQUE (device_id, sequence)
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  label TEXT NOT NULL,
  value_type TEXT NOT NULL
    CHECK (value_type IN ('number', 'text', 'boolean')),
  value_number REAL,
  value_text TEXT,
  value_boolean INTEGER,
  unit TEXT,
  quality TEXT NOT NULL
    CHECK (quality IN ('good', 'degraded', 'unknown')),
  captured_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES sensor_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processed_videos (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  local_uri TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL
    CHECK (size_bytes >= 0),
  duration_ms INTEGER NOT NULL
    CHECK (duration_ms >= 0),
  checksum_sha256 TEXT,
  captured_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES sensor_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS challenge_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  phrase TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

CREATE TABLE IF NOT EXISTS control_requests (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  intent TEXT NOT NULL
    CHECK (intent IN ('unlock', 'lock', 'status')),
  transcript TEXT NOT NULL,
  asr_confidence REAL
    CHECK (asr_confidence IS NULL OR (asr_confidence >= 0 AND asr_confidence <= 1)),
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  challenge_id TEXT,
  nonce TEXT NOT NULL UNIQUE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  FOREIGN KEY (challenge_id) REFERENCES challenge_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS verification_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  decision TEXT NOT NULL
    CHECK (decision IN ('pending', 'pass', 'block', 'inconclusive')),
  confidence REAL
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  reason_codes_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  processing_time_ms INTEGER NOT NULL
    CHECK (processing_time_ms >= 0),
  is_demo INTEGER NOT NULL DEFAULT 0
    CHECK (is_demo IN (0, 1)),
  FOREIGN KEY (event_id) REFERENCES sensor_events(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES control_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_evidence (
  attempt_id TEXT PRIMARY KEY NOT NULL,
  person_present INTEGER NOT NULL CHECK (person_present IN (0, 1)),
  face_count INTEGER NOT NULL CHECK (face_count >= 0),
  mouth_visible INTEGER NOT NULL CHECK (mouth_visible IN (0, 1)),
  audio_detected INTEGER NOT NULL CHECK (audio_detected IN (0, 1)),
  av_offset_ms REAL,
  sync_confidence REAL,
  active_speaker_score REAL,
  audio_spoof_score REAL,
  visual_spoof_score REAL,
  challenge_matched INTEGER CHECK (challenge_matched IS NULL OR challenge_matched IN (0, 1)),
  audio_quality TEXT NOT NULL CHECK (audio_quality IN ('good', 'degraded', 'bad', 'missing')),
  video_quality TEXT NOT NULL CHECK (video_quality IN ('good', 'degraded', 'bad', 'missing')),
  clock_synchronized INTEGER NOT NULL CHECK (clock_synchronized IN (0, 1)),
  model_versions_json TEXT NOT NULL,
  FOREIGN KEY (attempt_id) REFERENCES verification_attempts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actuation_logs (
  id TEXT PRIMARY KEY NOT NULL,
  attempt_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  allowed INTEGER NOT NULL CHECK (allowed IN (0, 1)),
  output TEXT NOT NULL CHECK (output IN ('unlock_pulse', 'lock_pulse', 'none')),
  reason TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  executed_at TEXT,
  FOREIGN KEY (attempt_id) REFERENCES verification_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES control_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_reviews (
  event_id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (category IN (
      'unclassified', 'resident', 'visitor', 'delivery',
      'suspicious', 'intrusion', 'other'
    )),
  is_false_alarm INTEGER NOT NULL DEFAULT 0
    CHECK (is_false_alarm IN (0, 1)),
  is_important INTEGER NOT NULL DEFAULT 0
    CHECK (is_important IN (0, 1)),
  memo TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES sensor_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS door_hub_events (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  external_event_id INTEGER NOT NULL,
  stage TEXT NOT NULL
    CHECK (stage IN (
      'idle', 'vision-wake', 'camera-init', 'capture',
      'end-background', 'result-ready', 'vision-sleep', 'fault'
    )),
  safety_decision TEXT NOT NULL
    CHECK (safety_decision IN ('none', 'allow', 'block', 'abort')),
  captured_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
  UNIQUE (device_id, external_event_id)
);

CREATE TABLE IF NOT EXISTS door_hub_event_reviews (
  event_id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL DEFAULT 'unclassified'
    CHECK (category IN (
      'unclassified', 'resident', 'visitor', 'delivery',
      'suspicious', 'intrusion', 'other'
    )),
  is_false_alarm INTEGER NOT NULL DEFAULT 0 CHECK (is_false_alarm IN (0, 1)),
  is_important INTEGER NOT NULL DEFAULT 0 CHECK (is_important IN (0, 1)),
  memo TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES door_hub_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS risk_assessments (
  id TEXT PRIMARY KEY NOT NULL,
  incident_id TEXT NOT NULL,
  trigger_event_id TEXT NOT NULL,
  engine_name TEXT NOT NULL,
  engine_version TEXT,
  policy_version TEXT,
  risk_score REAL,
  risk_level TEXT NOT NULL
    CHECK (risk_level IN ('pending', 'normal', 'watch', 'warning', 'critical')),
  summary TEXT NOT NULL,
  reasons_json TEXT NOT NULL,
  is_dummy INTEGER NOT NULL DEFAULT 1
    CHECK (is_dummy IN (0, 1)),
  evaluated_at TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (trigger_event_id) REFERENCES sensor_events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS response_actions (
  id TEXT PRIMARY KEY NOT NULL,
  incident_id TEXT NOT NULL,
  assessment_id TEXT,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  executed_at TEXT NOT NULL,
  FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE,
  FOREIGN KEY (assessment_id) REFERENCES risk_assessments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_states (
  device_id TEXT PRIMARY KEY NOT NULL,
  last_received_sequence INTEGER NOT NULL DEFAULT 0,
  last_acknowledged_sequence INTEGER NOT NULL DEFAULT 0,
  last_connected_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'idle'
    CHECK (sync_status IN ('idle', 'syncing', 'error')),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS device_status (
  device_id TEXT PRIMARY KEY NOT NULL,
  battery_percent REAL,
  storage_used_bytes INTEGER,
  storage_capacity_bytes INTEGER,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL UNIQUE,
  risk_level TEXT NOT NULL
    CHECK (risk_level IN ('watch', 'warning', 'critical')),
  status TEXT NOT NULL
    CHECK (status IN ('reserved', 'delivered', 'acknowledged')),
  notification_identifier TEXT,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  FOREIGN KEY (event_id) REFERENCES sensor_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS incidents_device_started_idx
  ON incidents(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS sensor_events_device_captured_idx
  ON sensor_events(device_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS sensor_readings_event_metric_idx
  ON sensor_readings(event_id, metric);
CREATE INDEX IF NOT EXISTS processed_videos_captured_idx
  ON processed_videos(captured_at DESC);
CREATE INDEX IF NOT EXISTS control_requests_device_requested_idx
  ON control_requests(device_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS verification_attempts_decision_evaluated_idx
  ON verification_attempts(decision, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS actuation_logs_request_idx
  ON actuation_logs(request_id, valid_until DESC);
CREATE INDEX IF NOT EXISTS event_reviews_category_idx
  ON event_reviews(category, is_important);
CREATE INDEX IF NOT EXISTS door_hub_events_device_captured_idx
  ON door_hub_events(device_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS door_hub_events_decision_captured_idx
  ON door_hub_events(safety_decision, captured_at DESC);
CREATE INDEX IF NOT EXISTS risk_assessments_incident_evaluated_idx
  ON risk_assessments(incident_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS response_actions_incident_executed_idx
  ON response_actions(incident_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS notification_deliveries_created_idx
  ON notification_deliveries(risk_level, created_at DESC);
`;
