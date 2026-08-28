CREATE TABLE `door_hub_events` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`device_id` text NOT NULL,
	`external_event_id` integer NOT NULL,
	`schema_version` text NOT NULL,
	`stage` text NOT NULL,
	`pir_active` integer NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`generated_at` text NOT NULL,
	`vision_status` text NOT NULL,
	`visitor_present` integer NOT NULL,
	`object_count` integer NOT NULL,
	`primary_zone` integer,
	`zone_mask` integer NOT NULL,
	`dwell_ms` integer NOT NULL,
	`background_change_ratio` real NOT NULL,
	`background_changed` integer NOT NULL,
	`snapshot_ready` integer NOT NULL,
	`snapshot_ref` text,
	`heartbeat_ok` integer NOT NULL,
	`auth_armed` integer NOT NULL,
	`safety_decision` text NOT NULL,
	`block_reason` text,
	`fault_latched` integer NOT NULL,
	`door_closed` integer NOT NULL,
	`tamper_detected` integer NOT NULL,
	`emergency_stop` integer NOT NULL,
	`output_target` text DEFAULT 'led' NOT NULL,
	`output_active` integer NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`raw_payload_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "door_hub_events_object_count_nonnegative" CHECK("door_hub_events"."object_count" >= 0),
	CONSTRAINT "door_hub_events_dwell_nonnegative" CHECK("door_hub_events"."dwell_ms" >= 0),
	CONSTRAINT "door_hub_events_background_ratio_range" CHECK("door_hub_events"."background_change_ratio" >= 0 AND "door_hub_events"."background_change_ratio" <= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `door_hub_events_device_event_uq` ON `door_hub_events` (`device_id`,`external_event_id`);--> statement-breakpoint
CREATE INDEX `door_hub_events_household_generated_idx` ON `door_hub_events` (`household_id`,`generated_at`);--> statement-breakpoint
CREATE INDEX `door_hub_events_decision_generated_idx` ON `door_hub_events` (`safety_decision`,`generated_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO devices
  (id, household_id, external_device_id, name, type, provider, transport, status,
   firmware_version, capabilities_json, last_seen_at, created_at, updated_at)
VALUES
  ('demo-device-door-hub', 'demo-household-01', 'RZ-DOOR-HUB-DEMO-01', '현관 Door Hub', 'hub',
   'DoorHubDemoSeed', 'wifi', 'online', 'door-hub-demo-0.1',
   '["door-hub-event/1","fpga-vision","safety-gate","snapshot-metadata"]',
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
--> statement-breakpoint
INSERT OR IGNORE INTO door_hub_events
  (id, household_id, device_id, external_event_id, schema_version, stage, pir_active,
   started_at, ended_at, generated_at, vision_status, visitor_present, object_count,
   primary_zone, zone_mask, dwell_ms, background_change_ratio, background_changed,
   snapshot_ready, snapshot_ref, heartbeat_ok, auth_armed, safety_decision, block_reason,
   fault_latched, door_closed, tamper_detected, emergency_stop, output_target,
   output_active, is_demo, raw_payload_json, created_at, updated_at)
VALUES
  ('demo-door-hub-1042', 'demo-household-01', 'demo-device-door-hub', 1042,
   'door-hub-event/1', 'result-ready', 0,
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-21 seconds'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 second'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 second'),
   'ready', 0, 0, 6, 32, 18200, 0.12, 1, 1, NULL,
   1, 0, 'none', NULL, 0, 1, 0, 0, 'led', 0, 1, NULL,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-door-hub-1041', 'demo-household-01', 'demo-device-door-hub', 1041,
   'door-hub-event/1', 'result-ready', 0,
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-87 minutes'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-86 minutes'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-86 minutes'),
   'ready', 0, 0, 2, 18, 11000, 0.01, 0, 1, NULL,
   1, 0, 'none', NULL, 0, 1, 0, 0, 'led', 0, 1, NULL,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('demo-door-hub-1040', 'demo-household-01', 'demo-device-door-hub', 1040,
   'door-hub-event/1', 'fault', 0,
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-220 minutes'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-219 minutes'),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-219 minutes'),
   'fault', 0, 0, 5, 16, 9000, 0.00, 0, 0, NULL,
   1, 0, 'abort', 'tamper_detected', 1, 1, 1, 0, 'led', 0, 1, NULL,
   CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
