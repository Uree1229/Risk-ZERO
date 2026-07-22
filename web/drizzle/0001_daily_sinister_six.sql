ALTER TABLE `incidents` ADD `scenario_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `incidents_household_scenario_uq` ON `incidents` (`household_id`,`scenario_key`);