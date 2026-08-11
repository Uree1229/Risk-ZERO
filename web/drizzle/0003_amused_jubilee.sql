CREATE TABLE `actuation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`attempt_id` text NOT NULL,
	`request_id` text NOT NULL,
	`allowed` integer NOT NULL,
	`output` text NOT NULL,
	`reason` text NOT NULL,
	`valid_until` text NOT NULL,
	`executed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `verification_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `control_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `actuation_logs_household_created_idx` ON `actuation_logs` (`household_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `actuation_logs_request_idx` ON `actuation_logs` (`request_id`,`valid_until`);--> statement-breakpoint
CREATE TABLE `challenge_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`phrase` text NOT NULL,
	`nonce` text NOT NULL,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenge_sessions_nonce_uq` ON `challenge_sessions` (`nonce`);--> statement-breakpoint
CREATE INDEX `challenge_sessions_household_issued_idx` ON `challenge_sessions` (`household_id`,`issued_at`);--> statement-breakpoint
CREATE TABLE `control_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`device_id` text NOT NULL,
	`intent` text NOT NULL,
	`transcript` text NOT NULL,
	`asr_confidence` real,
	`requested_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`challenge_id` text,
	`nonce` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`challenge_id`) REFERENCES `challenge_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "control_requests_asr_confidence_range" CHECK("control_requests"."asr_confidence" IS NULL OR ("control_requests"."asr_confidence" >= 0 AND "control_requests"."asr_confidence" <= 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_requests_nonce_uq` ON `control_requests` (`nonce`);--> statement-breakpoint
CREATE INDEX `control_requests_household_requested_idx` ON `control_requests` (`household_id`,`requested_at`);--> statement-breakpoint
CREATE TABLE `verification_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`event_id` text NOT NULL,
	`request_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`decision` text NOT NULL,
	`confidence` real,
	`reason_codes_json` text NOT NULL,
	`summary` text NOT NULL,
	`policy_version` text NOT NULL,
	`evaluated_at` text NOT NULL,
	`processing_time_ms` integer NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `sensor_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`request_id`) REFERENCES `control_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "verification_attempts_confidence_range" CHECK("verification_attempts"."confidence" IS NULL OR ("verification_attempts"."confidence" >= 0 AND "verification_attempts"."confidence" <= 1)),
	CONSTRAINT "verification_attempts_processing_time_nonnegative" CHECK("verification_attempts"."processing_time_ms" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_attempts_event_uq` ON `verification_attempts` (`event_id`);--> statement-breakpoint
CREATE INDEX `verification_attempts_household_evaluated_idx` ON `verification_attempts` (`household_id`,`evaluated_at`);--> statement-breakpoint
CREATE INDEX `verification_attempts_decision_evaluated_idx` ON `verification_attempts` (`decision`,`evaluated_at`);--> statement-breakpoint
CREATE TABLE `verification_evidence` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`person_present` integer NOT NULL,
	`face_count` integer NOT NULL,
	`mouth_visible` integer NOT NULL,
	`audio_detected` integer NOT NULL,
	`av_offset_ms` real,
	`sync_confidence` real,
	`active_speaker_score` real,
	`audio_spoof_score` real,
	`visual_spoof_score` real,
	`challenge_matched` integer,
	`audio_quality` text NOT NULL,
	`video_quality` text NOT NULL,
	`clock_synchronized` integer NOT NULL,
	`model_versions_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `verification_attempts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "verification_evidence_face_count_nonnegative" CHECK("verification_evidence"."face_count" >= 0)
);
