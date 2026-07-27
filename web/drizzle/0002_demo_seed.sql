INSERT OR IGNORE INTO households
  (id, name, timezone, is_demo, created_at, updated_at)
VALUES
  ('demo-household-01', 'RISK-ZERO 시연 주거', 'Asia/Seoul', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO users
  (id, display_name, is_active, created_at, updated_at)
VALUES
  ('demo-resident-01', '시연 거주자', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-guardian-01', '시연 보호자', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO household_members
  (household_id, user_id, role, receives_alerts, created_at)
VALUES
  ('demo-household-01', 'demo-resident-01', 'resident', 1, CURRENT_TIMESTAMP),
  ('demo-household-01', 'demo-guardian-01', 'guardian', 1, CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO devices
  (id, household_id, external_device_id, name, type, provider, transport, status,
   firmware_version, capabilities_json, last_seen_at, created_at, updated_at)
VALUES
  ('demo-device-hub', 'demo-household-01', 'RZ-DEMO-01', '현관 센서 허브', 'hub',
   'D1DemoSeed', 'demo', 'online', 'demo-1.0',
   '["presence","dwell_seconds","vibration_count","door_state"]',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-device-pir', 'demo-household-01', 'RZ-PIR-01', '현관 PIR', 'pir',
   'D1DemoSeed', 'demo', 'online', 'demo-1.0', '["presence"]',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-device-mmwave', 'demo-household-01', 'RZ-MMWAVE-01', '현관 mmWave', 'mmwave',
   'D1DemoSeed', 'demo', 'online', 'demo-1.0', '["dwell_seconds","distance_cm"]',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-device-vibration', 'demo-household-01', 'RZ-VIB-01', '도어 진동 센서', 'vibration',
   'D1DemoSeed', 'demo', 'online', 'demo-1.0', '["vibration_count","impact_peak"]',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-device-door', 'demo-household-01', 'RZ-DOOR-01', '도어 접점 센서', 'door_contact',
   'D1DemoSeed', 'demo', 'online', 'demo-1.0', '["door_state","door_open_seconds"]',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO visit_expectations
  (id, household_id, created_by_user_id, kind, label, starts_at, ends_at, status, created_at, updated_at)
VALUES
  ('demo-visit-delivery', 'demo-household-01', 'demo-resident-01', 'delivery', '시연용 택배 예정',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+1 hour'),
   'expected', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO incidents
  (id, household_id, scenario_key, title, status, max_risk_level, max_risk_score,
   classification, is_demo, started_at, ended_at, created_at, updated_at)
VALUES
  ('demo-incident-normal', 'demo-household-01', 'normal', '정상 방문', 'closed', 'normal', 14,
   'test', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours', '+30 seconds'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-incident-watch', 'demo-household-01', 'watch', '주의 관찰', 'closed', 'watch', 46,
   'test', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours', '+1 minute'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-incident-warning', 'demo-household-01', 'warning', '위험 징후', 'closed', 'warning', 68,
   'test', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-43 minutes'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-incident-critical', 'demo-household-01', 'critical', '고위험', 'monitoring', 'critical', 88,
   'test', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'),
   NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO sensor_events
  (id, household_id, incident_id, device_id, event_type, sequence, dedupe_key,
   payload_version, data_quality, raw_payload_json, captured_at, received_at, created_at)
VALUES
  ('demo-event-normal', 'demo-household-01', 'demo-incident-normal', 'demo-device-hub',
   'entrance_observation', 101, 'seed-normal-v1', 1, 'good', '{"seed":true,"scenario":"normal"}',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours'), CURRENT_TIMESTAMP),
  ('demo-event-watch', 'demo-household-01', 'demo-incident-watch', 'demo-device-hub',
   'entrance_observation', 102, 'seed-watch-v1', 1, 'good', '{"seed":true,"scenario":"watch"}',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'), CURRENT_TIMESTAMP),
  ('demo-event-warning', 'demo-household-01', 'demo-incident-warning', 'demo-device-hub',
   'entrance_observation', 103, 'seed-warning-v1', 1, 'good', '{"seed":true,"scenario":"warning"}',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes'), CURRENT_TIMESTAMP),
  ('demo-event-critical', 'demo-household-01', 'demo-incident-critical', 'demo-device-hub',
   'entrance_observation', 104, 'seed-critical-v1', 1, 'good', '{"seed":true,"scenario":"critical"}',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'), CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO sensor_readings
  (id, event_id, metric, label, value_type, value_number, value_text, value_boolean,
   value_json, unit, confidence, quality, captured_at)
VALUES
  ('demo-reading-normal-presence', 'demo-event-normal', 'presence', '사람 감지', 'boolean', NULL, NULL, 1, NULL, NULL, 0.99, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours')),
  ('demo-reading-normal-dwell', 'demo-event-normal', 'dwell_seconds', '체류 시간', 'number', 7, NULL, NULL, NULL, '초', 0.97, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours')),
  ('demo-reading-normal-vibration', 'demo-event-normal', 'vibration_count', '진동 횟수', 'number', 0, NULL, NULL, NULL, '회', 0.99, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours')),
  ('demo-reading-normal-door', 'demo-event-normal', 'door_state', '문 상태', 'text', NULL, '닫힘', NULL, NULL, NULL, 0.99, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours')),

  ('demo-reading-watch-presence', 'demo-event-watch', 'presence', '사람 감지', 'boolean', NULL, NULL, 1, NULL, NULL, 0.99, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours')),
  ('demo-reading-watch-dwell', 'demo-event-watch', 'dwell_seconds', '체류 시간', 'number', 28, NULL, NULL, NULL, '초', 0.96, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours')),
  ('demo-reading-watch-vibration', 'demo-event-watch', 'vibration_count', '진동 횟수', 'number', 1, NULL, NULL, NULL, '회', 0.98, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours')),
  ('demo-reading-watch-door', 'demo-event-watch', 'door_state', '문 상태', 'text', NULL, '닫힘', NULL, NULL, NULL, 0.99, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours')),

  ('demo-reading-warning-presence', 'demo-event-warning', 'presence', '사람 감지', 'boolean', NULL, NULL, 1, NULL, NULL, 0.99, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes')),
  ('demo-reading-warning-dwell', 'demo-event-warning', 'dwell_seconds', '체류 시간', 'number', 49, NULL, NULL, NULL, '초', 0.95, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes')),
  ('demo-reading-warning-vibration', 'demo-event-warning', 'vibration_count', '진동 횟수', 'number', 3, NULL, NULL, NULL, '회', 0.97, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes')),
  ('demo-reading-warning-door', 'demo-event-warning', 'door_state', '문 상태', 'text', NULL, '닫힘', NULL, NULL, NULL, 0.99, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes')),

  ('demo-reading-critical-presence', 'demo-event-critical', 'presence', '사람 감지', 'boolean', NULL, NULL, 1, NULL, NULL, 0.99, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes')),
  ('demo-reading-critical-dwell', 'demo-event-critical', 'dwell_seconds', '체류 시간', 'number', 76, NULL, NULL, NULL, '초', 0.95, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes')),
  ('demo-reading-critical-vibration', 'demo-event-critical', 'vibration_count', '진동 횟수', 'number', 7, NULL, NULL, NULL, '회', 0.96, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes')),
  ('demo-reading-critical-door', 'demo-event-critical', 'door_state', '문 상태', 'text', NULL, '강한 충격 감지', NULL, NULL, NULL, 0.98, 'good', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'));
--> statement-breakpoint

INSERT OR IGNORE INTO risk_assessments
  (id, incident_id, trigger_event_id, engine_version_id, status, engine_name,
   algorithm_version, score, level, confidence, summary, reasons_json,
   input_window_start, input_window_end, evaluated_at, created_at)
VALUES
  ('demo-assessment-normal', 'demo-incident-normal', 'demo-event-normal', NULL, 'demo',
   'DemoPassThroughRiskEngine', NULL, 14, 'normal', NULL,
   '짧은 방문이 감지되었습니다.', '["짧은 체류","진동 없음"]',
   NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours'), CURRENT_TIMESTAMP),
  ('demo-assessment-watch', 'demo-incident-watch', 'demo-event-watch', NULL, 'demo',
   'DemoPassThroughRiskEngine', NULL, 46, 'watch', NULL,
   '현관 앞 체류가 길어지고 있습니다.', '["체류 시간 증가","일회성 진동"]',
   NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'), CURRENT_TIMESTAMP),
  ('demo-assessment-warning', 'demo-incident-warning', 'demo-event-warning', NULL, 'demo',
   'DemoPassThroughRiskEngine', NULL, 68, 'warning', NULL,
   '장시간 체류와 반복 진동이 감지되었습니다.', '["장시간 체류","반복 진동"]',
   NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes'), CURRENT_TIMESTAMP),
  ('demo-assessment-critical', 'demo-incident-critical', 'demo-event-critical', NULL, 'demo',
   'DemoPassThroughRiskEngine', NULL, 88, 'critical', NULL,
   '강한 반복 진동과 문 주변 충격이 감지되었습니다.', '["장시간 체류","반복적인 강한 진동","문 주변 충격"]',
   NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'), CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO risk_factor_observations
  (id, assessment_id, evidence_event_id, factor_code, source_kind, observed_value_json,
   normalized_value, contribution, confidence, explanation, created_at)
VALUES
  ('demo-factor-normal-dwell', 'demo-assessment-normal', 'demo-event-normal', 'dwell_seconds', 'sensor', '7', NULL, NULL, 0.97, '계산식 미정: 관측값만 저장', CURRENT_TIMESTAMP),
  ('demo-factor-watch-dwell', 'demo-assessment-watch', 'demo-event-watch', 'dwell_seconds', 'sensor', '28', NULL, NULL, 0.96, '계산식 미정: 관측값만 저장', CURRENT_TIMESTAMP),
  ('demo-factor-warning-vibration', 'demo-assessment-warning', 'demo-event-warning', 'vibration_count', 'sensor', '3', NULL, NULL, 0.97, '계산식 미정: 관측값만 저장', CURRENT_TIMESTAMP),
  ('demo-factor-critical-dwell', 'demo-assessment-critical', 'demo-event-critical', 'dwell_seconds', 'sensor', '76', NULL, NULL, 0.95, '계산식 미정: 관측값만 저장', CURRENT_TIMESTAMP),
  ('demo-factor-critical-vibration', 'demo-assessment-critical', 'demo-event-critical', 'vibration_count', 'sensor', '7', NULL, NULL, 0.96, '계산식 미정: 관측값만 저장', CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO response_actions
  (id, incident_id, assessment_id, target_user_id, action_type, status,
   requires_confirmation, payload_json, requested_at, completed_at, error_message, created_at)
VALUES
  ('demo-action-normal-standby', 'demo-incident-normal', 'demo-assessment-normal', NULL,
   'standby', 'preview', 0, '{"demo":true}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours'), NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-action-watch-alert', 'demo-incident-watch', 'demo-assessment-watch', 'demo-resident-01',
   'local_alert', 'preview', 0, '{"demo":true}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'), NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-action-warning-camera', 'demo-incident-warning', 'demo-assessment-warning', NULL,
   'camera_preview', 'preview', 0, '{"demo":true}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes'), NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-action-warning-guardian', 'demo-incident-warning', 'demo-assessment-warning', 'demo-guardian-01',
   'guardian_notice', 'preview', 0, '{"demo":true}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-45 minutes'), NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-action-critical-alert', 'demo-incident-critical', 'demo-assessment-critical', 'demo-resident-01',
   'local_alert', 'preview', 0, '{"demo":true}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'), NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-action-critical-camera', 'demo-incident-critical', 'demo-assessment-critical', NULL,
   'camera_preview', 'preview', 0, '{"demo":true}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'), NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-action-critical-guardian', 'demo-incident-critical', 'demo-assessment-critical', 'demo-guardian-01',
   'guardian_notice', 'preview', 0, '{"demo":true}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'), NULL, NULL, CURRENT_TIMESTAMP),
  ('demo-action-critical-emergency', 'demo-incident-critical', 'demo-assessment-critical', 'demo-guardian-01',
   'confirm_emergency_call', 'preview', 1, '{"demo":true,"automatic":false}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-5 minutes'), NULL, NULL, CURRENT_TIMESTAMP);
--> statement-breakpoint

INSERT OR IGNORE INTO audit_logs
  (id, household_id, actor_user_id, action, entity_type, entity_id, metadata_json, occurred_at)
VALUES
  ('demo-audit-seed', 'demo-household-01', NULL, 'demo_seed_applied', 'household',
   'demo-household-01', '{"version":1}', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
