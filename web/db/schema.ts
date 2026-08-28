import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = () => text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`);
const updatedAt = () => text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`);

const memberRoles = ["resident", "guardian", "admin"] as const;
const deviceTypes = [
  "hub",
  "pir",
  "mmwave",
  "vibration",
  "door_contact",
  "door_lock",
  "camera",
  "microphone",
  "panic_button",
  "other",
] as const;
const deviceStatuses = ["online", "offline", "degraded", "retired"] as const;
const incidentStatuses = ["open", "monitoring", "closed"] as const;
const riskLevels = ["pending", "normal", "watch", "warning", "critical"] as const;
const verificationDecisions = ["pending", "pass", "block", "inconclusive"] as const;
const captureQualities = ["good", "degraded", "bad", "missing"] as const;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    externalAuthId: text("external_auth_id"),
    displayName: text("display_name").notNull(),
    phoneE164: text("phone_e164"),
    pushToken: text("push_token"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("users_external_auth_id_uq").on(table.externalAuthId)]
);

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  timezone: text("timezone").notNull().default("Asia/Seoul"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const householdMembers = sqliteTable(
  "household_members",
  {
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: memberRoles }).notNull(),
    receivesAlerts: integer("receives_alerts", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.userId] }),
    index("household_members_user_idx").on(table.userId),
  ]
);

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    externalDeviceId: text("external_device_id").notNull(),
    name: text("name").notNull(),
    type: text("type", { enum: deviceTypes }).notNull(),
    provider: text("provider").notNull(),
    transport: text("transport").notNull(),
    status: text("status", { enum: deviceStatuses }).notNull().default("offline"),
    firmwareVersion: text("firmware_version"),
    capabilitiesJson: text("capabilities_json", { mode: "json" }).$type<string[]>(),
    lastSeenAt: text("last_seen_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("devices_household_external_id_uq").on(table.householdId, table.externalDeviceId),
    index("devices_household_status_idx").on(table.householdId, table.status),
  ]
);

export const visitExpectations = sqliteTable(
  "visit_expectations",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["guest", "delivery", "service", "other"] }).notNull(),
    label: text("label").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    status: text("status", { enum: ["expected", "arrived", "cancelled", "expired"] })
      .notNull()
      .default("expected"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("visit_expectations_window_idx").on(table.householdId, table.startsAt, table.endsAt)]
);

export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    scenarioKey: text("scenario_key"),
    title: text("title").notNull(),
    status: text("status", { enum: incidentStatuses }).notNull().default("open"),
    maxRiskLevel: text("max_risk_level", { enum: riskLevels }).notNull().default("pending"),
    maxRiskScore: real("max_risk_score"),
    classification: text("classification", {
      enum: ["unknown", "normal_visit", "confirmed_risk", "false_alarm", "test"],
    })
      .notNull()
      .default("unknown"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("incidents_household_started_idx").on(table.householdId, table.startedAt),
    index("incidents_household_status_idx").on(table.householdId, table.status),
    uniqueIndex("incidents_household_scenario_uq").on(table.householdId, table.scenarioKey),
    check(
      "incidents_max_score_range",
      sql`${table.maxRiskScore} IS NULL OR (${table.maxRiskScore} >= 0 AND ${table.maxRiskScore} <= 100)`
    ),
  ]
);

export const sensorEvents = sqliteTable(
  "sensor_events",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    incidentId: text("incident_id").references(() => incidents.id, { onDelete: "set null" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    sequence: integer("sequence"),
    dedupeKey: text("dedupe_key").notNull(),
    payloadVersion: integer("payload_version").notNull().default(1),
    dataQuality: text("data_quality", { enum: ["good", "uncertain", "bad", "missing"] })
      .notNull()
      .default("good"),
    rawPayloadJson: text("raw_payload_json", { mode: "json" }).$type<Record<string, unknown>>(),
    capturedAt: text("captured_at").notNull(),
    receivedAt: text("received_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("sensor_events_device_dedupe_uq").on(table.deviceId, table.dedupeKey),
    index("sensor_events_household_captured_idx").on(table.householdId, table.capturedAt),
    index("sensor_events_incident_captured_idx").on(table.incidentId, table.capturedAt),
    index("sensor_events_device_captured_idx").on(table.deviceId, table.capturedAt),
  ]
);

export const sensorReadings = sqliteTable(
  "sensor_readings",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => sensorEvents.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    label: text("label").notNull(),
    valueType: text("value_type", { enum: ["number", "text", "boolean", "json"] }).notNull(),
    valueNumber: real("value_number"),
    valueText: text("value_text"),
    valueBoolean: integer("value_boolean", { mode: "boolean" }),
    valueJson: text("value_json", { mode: "json" }).$type<unknown>(),
    unit: text("unit"),
    confidence: real("confidence"),
    quality: text("quality", { enum: ["good", "uncertain", "bad", "missing"] })
      .notNull()
      .default("good"),
    capturedAt: text("captured_at").notNull(),
  },
  (table) => [
    index("sensor_readings_event_metric_idx").on(table.eventId, table.metric),
    check(
      "sensor_readings_confidence_range",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`
    ),
    check(
      "sensor_readings_exactly_one_value",
      sql`(
        CASE WHEN ${table.valueNumber} IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN ${table.valueText} IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN ${table.valueBoolean} IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN ${table.valueJson} IS NOT NULL THEN 1 ELSE 0 END
      ) = 1`
    ),
  ]
);

export const challengeSessions = sqliteTable(
  "challenge_sessions",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    phrase: text("phrase").notNull(),
    nonce: text("nonce").notNull(),
    issuedAt: text("issued_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("challenge_sessions_nonce_uq").on(table.nonce),
    index("challenge_sessions_household_issued_idx").on(table.householdId, table.issuedAt),
  ]
);

export const controlRequests = sqliteTable(
  "control_requests",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    intent: text("intent", { enum: ["unlock", "lock", "status"] }).notNull(),
    transcript: text("transcript").notNull(),
    asrConfidence: real("asr_confidence"),
    requestedAt: text("requested_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    challengeId: text("challenge_id").references(() => challengeSessions.id, { onDelete: "set null" }),
    nonce: text("nonce").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("control_requests_nonce_uq").on(table.nonce),
    index("control_requests_household_requested_idx").on(table.householdId, table.requestedAt),
    check(
      "control_requests_asr_confidence_range",
      sql`${table.asrConfidence} IS NULL OR (${table.asrConfidence} >= 0 AND ${table.asrConfidence} <= 1)`
    ),
  ]
);

export const verificationAttempts = sqliteTable(
  "verification_attempts",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => sensorEvents.id, { onDelete: "cascade" }),
    requestId: text("request_id")
      .notNull()
      .references(() => controlRequests.id, { onDelete: "cascade" }),
    schemaVersion: text("schema_version").notNull(),
    decision: text("decision", { enum: verificationDecisions }).notNull(),
    confidence: real("confidence"),
    reasonCodesJson: text("reason_codes_json", { mode: "json" }).$type<string[]>().notNull(),
    summary: text("summary").notNull(),
    policyVersion: text("policy_version").notNull(),
    evaluatedAt: text("evaluated_at").notNull(),
    processingTimeMs: integer("processing_time_ms").notNull(),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("verification_attempts_event_uq").on(table.eventId),
    index("verification_attempts_household_evaluated_idx").on(table.householdId, table.evaluatedAt),
    index("verification_attempts_decision_evaluated_idx").on(table.decision, table.evaluatedAt),
    check(
      "verification_attempts_confidence_range",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`
    ),
    check("verification_attempts_processing_time_nonnegative", sql`${table.processingTimeMs} >= 0`),
  ]
);

export const verificationEvidence = sqliteTable(
  "verification_evidence",
  {
    attemptId: text("attempt_id")
      .primaryKey()
      .references(() => verificationAttempts.id, { onDelete: "cascade" }),
    personPresent: integer("person_present", { mode: "boolean" }).notNull(),
    faceCount: integer("face_count").notNull(),
    mouthVisible: integer("mouth_visible", { mode: "boolean" }).notNull(),
    audioDetected: integer("audio_detected", { mode: "boolean" }).notNull(),
    avOffsetMs: real("av_offset_ms"),
    syncConfidence: real("sync_confidence"),
    activeSpeakerScore: real("active_speaker_score"),
    audioSpoofScore: real("audio_spoof_score"),
    visualSpoofScore: real("visual_spoof_score"),
    challengeMatched: integer("challenge_matched", { mode: "boolean" }),
    audioQuality: text("audio_quality", { enum: captureQualities }).notNull(),
    videoQuality: text("video_quality", { enum: captureQualities }).notNull(),
    clockSynchronized: integer("clock_synchronized", { mode: "boolean" }).notNull(),
    modelVersionsJson: text("model_versions_json", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check("verification_evidence_face_count_nonnegative", sql`${table.faceCount} >= 0`),
  ]
);

export const actuationLogs = sqliteTable(
  "actuation_logs",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => verificationAttempts.id, { onDelete: "cascade" }),
    requestId: text("request_id")
      .notNull()
      .references(() => controlRequests.id, { onDelete: "cascade" }),
    allowed: integer("allowed", { mode: "boolean" }).notNull(),
    output: text("output", { enum: ["unlock_pulse", "lock_pulse", "none"] }).notNull(),
    reason: text("reason").notNull(),
    validUntil: text("valid_until").notNull(),
    executedAt: text("executed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    index("actuation_logs_household_created_idx").on(table.householdId, table.createdAt),
    index("actuation_logs_request_idx").on(table.requestId, table.validUntil),
  ]
);

export const riskEngineVersions = sqliteTable(
  "risk_engine_versions",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    status: text("status", { enum: ["draft", "active", "retired"] }).notNull().default("draft"),
    configJson: text("config_json", { mode: "json" }).$type<Record<string, unknown>>(),
    notes: text("notes"),
    activatedAt: text("activated_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("risk_engine_name_version_uq").on(table.name, table.version)]
);

export const riskAssessments = sqliteTable(
  "risk_assessments",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    triggerEventId: text("trigger_event_id").references(() => sensorEvents.id, { onDelete: "set null" }),
    engineVersionId: text("engine_version_id").references(() => riskEngineVersions.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: ["pending", "demo", "completed", "failed"] }).notNull(),
    engineName: text("engine_name").notNull(),
    algorithmVersion: text("algorithm_version"),
    score: real("score"),
    level: text("level", { enum: riskLevels }).notNull().default("pending"),
    confidence: real("confidence"),
    summary: text("summary").notNull(),
    reasonsJson: text("reasons_json", { mode: "json" }).$type<string[]>(),
    inputWindowStart: text("input_window_start"),
    inputWindowEnd: text("input_window_end"),
    evaluatedAt: text("evaluated_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("risk_assessments_incident_evaluated_idx").on(table.incidentId, table.evaluatedAt),
    index("risk_assessments_trigger_event_idx").on(table.triggerEventId),
    check(
      "risk_assessments_score_range",
      sql`${table.score} IS NULL OR (${table.score} >= 0 AND ${table.score} <= 100)`
    ),
    check(
      "risk_assessments_confidence_range",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`
    ),
  ]
);

export const riskFactorObservations = sqliteTable(
  "risk_factor_observations",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => riskAssessments.id, { onDelete: "cascade" }),
    evidenceEventId: text("evidence_event_id").references(() => sensorEvents.id, {
      onDelete: "set null",
    }),
    factorCode: text("factor_code").notNull(),
    sourceKind: text("source_kind", {
      enum: ["sensor", "history", "context", "user", "system"],
    }).notNull(),
    observedValueJson: text("observed_value_json", { mode: "json" }).$type<unknown>(),
    normalizedValue: real("normalized_value"),
    contribution: real("contribution"),
    confidence: real("confidence"),
    explanation: text("explanation"),
    createdAt: createdAt(),
  },
  (table) => [
    index("risk_factors_assessment_code_idx").on(table.assessmentId, table.factorCode),
    check(
      "risk_factors_confidence_range",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`
    ),
  ]
);

export const responseActions = sqliteTable(
  "response_actions",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    assessmentId: text("assessment_id").references(() => riskAssessments.id, {
      onDelete: "set null",
    }),
    targetUserId: text("target_user_id").references(() => users.id, { onDelete: "set null" }),
    actionType: text("action_type", {
      enum: [
        "standby",
        "local_alert",
        "camera_preview",
        "guardian_notice",
        "confirm_emergency_call",
        "device_lock",
        "custom",
      ],
    }).notNull(),
    status: text("status", {
      enum: ["planned", "preview", "queued", "sent", "confirmed", "failed", "cancelled"],
    }).notNull(),
    requiresConfirmation: integer("requires_confirmation", { mode: "boolean" })
      .notNull()
      .default(false),
    payloadJson: text("payload_json", { mode: "json" }).$type<Record<string, unknown>>(),
    requestedAt: text("requested_at").notNull(),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (table) => [
    index("response_actions_incident_requested_idx").on(table.incidentId, table.requestedAt),
    index("response_actions_target_status_idx").on(table.targetUserId, table.status),
  ]
);

export const incidentFeedback = sqliteTable(
  "incident_feedback",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    label: text("label", {
      enum: ["normal_visit", "confirmed_risk", "false_alarm", "test", "unsure"],
    }).notNull(),
    note: text("note"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("incident_feedback_incident_user_uq").on(table.incidentId, table.userId),
    index("incident_feedback_label_idx").on(table.label),
  ]
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").references(() => households.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadataJson: text("metadata_json", { mode: "json" }).$type<Record<string, unknown>>(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    index("audit_logs_household_occurred_idx").on(table.householdId, table.occurredAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ]
);

export const doorHubEvents = sqliteTable(
  "door_hub_events",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
    externalEventId: integer("external_event_id").notNull(),
    schemaVersion: text("schema_version").notNull(),
    stage: text("stage", { enum: ["idle", "vision-wake", "camera-init", "capture", "end-background", "result-ready", "vision-sleep", "fault"] }).notNull(),
    pirActive: integer("pir_active", { mode: "boolean" }).notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    generatedAt: text("generated_at").notNull(),
    visionStatus: text("vision_status", { enum: ["ready", "capturing", "sleeping", "fault"] }).notNull(),
    visitorPresent: integer("visitor_present", { mode: "boolean" }).notNull(),
    objectCount: integer("object_count").notNull(),
    primaryZone: integer("primary_zone"),
    zoneMask: integer("zone_mask").notNull(),
    dwellMs: integer("dwell_ms").notNull(),
    backgroundChangeRatio: real("background_change_ratio").notNull(),
    backgroundChanged: integer("background_changed", { mode: "boolean" }).notNull(),
    snapshotReady: integer("snapshot_ready", { mode: "boolean" }).notNull(),
    snapshotRef: text("snapshot_ref"),
    heartbeatOk: integer("heartbeat_ok", { mode: "boolean" }).notNull(),
    authArmed: integer("auth_armed", { mode: "boolean" }).notNull(),
    safetyDecision: text("safety_decision", { enum: ["none", "allow", "block", "abort"] }).notNull(),
    blockReason: text("block_reason"),
    faultLatched: integer("fault_latched", { mode: "boolean" }).notNull(),
    doorClosed: integer("door_closed", { mode: "boolean" }).notNull(),
    tamperDetected: integer("tamper_detected", { mode: "boolean" }).notNull(),
    emergencyStop: integer("emergency_stop", { mode: "boolean" }).notNull(),
    outputTarget: text("output_target", { enum: ["led"] }).notNull().default("led"),
    outputActive: integer("output_active", { mode: "boolean" }).notNull(),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    rawPayloadJson: text("raw_payload_json", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("door_hub_events_device_event_uq").on(table.deviceId, table.externalEventId),
    index("door_hub_events_household_generated_idx").on(table.householdId, table.generatedAt),
    index("door_hub_events_decision_generated_idx").on(table.safetyDecision, table.generatedAt),
    check("door_hub_events_object_count_nonnegative", sql`${table.objectCount} >= 0`),
    check("door_hub_events_dwell_nonnegative", sql`${table.dwellMs} >= 0`),
    check("door_hub_events_background_ratio_range", sql`${table.backgroundChangeRatio} >= 0 AND ${table.backgroundChangeRatio} <= 1`),
  ]
);
