CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text,
	`actor_user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata_json` text,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_household_occurred_idx` ON `audit_logs` (`household_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`external_device_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`transport` text NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`firmware_version` text,
	`capabilities_json` text,
	`last_seen_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_household_external_id_uq` ON `devices` (`household_id`,`external_device_id`);--> statement-breakpoint
CREATE INDEX `devices_household_status_idx` ON `devices` (`household_id`,`status`);--> statement-breakpoint
CREATE TABLE `household_members` (
	`household_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`receives_alerts` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`household_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `household_members_user_idx` ON `household_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Seoul' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incident_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`user_id` text,
	`label` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incident_feedback_incident_user_uq` ON `incident_feedback` (`incident_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `incident_feedback_label_idx` ON `incident_feedback` (`label`);--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`max_risk_level` text DEFAULT 'pending' NOT NULL,
	`max_risk_score` real,
	`classification` text DEFAULT 'unknown' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "incidents_max_score_range" CHECK("incidents"."max_risk_score" IS NULL OR ("incidents"."max_risk_score" >= 0 AND "incidents"."max_risk_score" <= 100))
);
--> statement-breakpoint
CREATE INDEX `incidents_household_started_idx` ON `incidents` (`household_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `incidents_household_status_idx` ON `incidents` (`household_id`,`status`);--> statement-breakpoint
CREATE TABLE `response_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`assessment_id` text,
	`target_user_id` text,
	`action_type` text NOT NULL,
	`status` text NOT NULL,
	`requires_confirmation` integer DEFAULT false NOT NULL,
	`payload_json` text,
	`requested_at` text NOT NULL,
	`completed_at` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assessment_id`) REFERENCES `risk_assessments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `response_actions_incident_requested_idx` ON `response_actions` (`incident_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `response_actions_target_status_idx` ON `response_actions` (`target_user_id`,`status`);--> statement-breakpoint
CREATE TABLE `risk_assessments` (
	`id` text PRIMARY KEY NOT NULL,
	`incident_id` text NOT NULL,
	`trigger_event_id` text,
	`engine_version_id` text,
	`status` text NOT NULL,
	`engine_name` text NOT NULL,
	`algorithm_version` text,
	`score` real,
	`level` text DEFAULT 'pending' NOT NULL,
	`confidence` real,
	`summary` text NOT NULL,
	`reasons_json` text,
	`input_window_start` text,
	`input_window_end` text,
	`evaluated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`trigger_event_id`) REFERENCES `sensor_events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`engine_version_id`) REFERENCES `risk_engine_versions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "risk_assessments_score_range" CHECK("risk_assessments"."score" IS NULL OR ("risk_assessments"."score" >= 0 AND "risk_assessments"."score" <= 100)),
	CONSTRAINT "risk_assessments_confidence_range" CHECK("risk_assessments"."confidence" IS NULL OR ("risk_assessments"."confidence" >= 0 AND "risk_assessments"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `risk_assessments_incident_evaluated_idx` ON `risk_assessments` (`incident_id`,`evaluated_at`);--> statement-breakpoint
CREATE INDEX `risk_assessments_trigger_event_idx` ON `risk_assessments` (`trigger_event_id`);--> statement-breakpoint
CREATE TABLE `risk_engine_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`config_json` text,
	`notes` text,
	`activated_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `risk_engine_name_version_uq` ON `risk_engine_versions` (`name`,`version`);--> statement-breakpoint
CREATE TABLE `risk_factor_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`assessment_id` text NOT NULL,
	`evidence_event_id` text,
	`factor_code` text NOT NULL,
	`source_kind` text NOT NULL,
	`observed_value_json` text,
	`normalized_value` real,
	`contribution` real,
	`confidence` real,
	`explanation` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`assessment_id`) REFERENCES `risk_assessments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_event_id`) REFERENCES `sensor_events`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "risk_factors_confidence_range" CHECK("risk_factor_observations"."confidence" IS NULL OR ("risk_factor_observations"."confidence" >= 0 AND "risk_factor_observations"."confidence" <= 1))
);
--> statement-breakpoint
CREATE INDEX `risk_factors_assessment_code_idx` ON `risk_factor_observations` (`assessment_id`,`factor_code`);--> statement-breakpoint
CREATE TABLE `sensor_events` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`incident_id` text,
	`device_id` text NOT NULL,
	`event_type` text NOT NULL,
	`sequence` integer,
	`dedupe_key` text NOT NULL,
	`payload_version` integer DEFAULT 1 NOT NULL,
	`data_quality` text DEFAULT 'good' NOT NULL,
	`raw_payload_json` text,
	`captured_at` text NOT NULL,
	`received_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`incident_id`) REFERENCES `incidents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sensor_events_device_dedupe_uq` ON `sensor_events` (`device_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `sensor_events_household_captured_idx` ON `sensor_events` (`household_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `sensor_events_incident_captured_idx` ON `sensor_events` (`incident_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `sensor_events_device_captured_idx` ON `sensor_events` (`device_id`,`captured_at`);--> statement-breakpoint
CREATE TABLE `sensor_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`metric` text NOT NULL,
	`label` text NOT NULL,
	`value_type` text NOT NULL,
	`value_number` real,
	`value_text` text,
	`value_boolean` integer,
	`value_json` text,
	`unit` text,
	`confidence` real,
	`quality` text DEFAULT 'good' NOT NULL,
	`captured_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `sensor_events`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sensor_readings_confidence_range" CHECK("sensor_readings"."confidence" IS NULL OR ("sensor_readings"."confidence" >= 0 AND "sensor_readings"."confidence" <= 1)),
	CONSTRAINT "sensor_readings_exactly_one_value" CHECK((
        CASE WHEN "sensor_readings"."value_number" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "sensor_readings"."value_text" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "sensor_readings"."value_boolean" IS NOT NULL THEN 1 ELSE 0 END +
        CASE WHEN "sensor_readings"."value_json" IS NOT NULL THEN 1 ELSE 0 END
      ) = 1)
);
--> statement-breakpoint
CREATE INDEX `sensor_readings_event_metric_idx` ON `sensor_readings` (`event_id`,`metric`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`external_auth_id` text,
	`display_name` text NOT NULL,
	`phone_e164` text,
	`push_token` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_auth_id_uq` ON `users` (`external_auth_id`);--> statement-breakpoint
CREATE TABLE `visit_expectations` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`created_by_user_id` text,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'expected' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `visit_expectations_window_idx` ON `visit_expectations` (`household_id`,`starts_at`,`ends_at`);