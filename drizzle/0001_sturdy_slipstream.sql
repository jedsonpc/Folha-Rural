CREATE TABLE `employment_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`person_id` integer NOT NULL,
	`company_source_id` integer NOT NULL,
	`source_registration` integer NOT NULL,
	`registration_number` integer,
	`legacy_code` text,
	`admission_date` text,
	`termination_date` text,
	`role` text,
	`season_source_id` integer,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contracts_tenant_source_idx` ON `employment_contracts` (`tenant_id`,`company_source_id`,`source_registration`);--> statement-breakpoint
CREATE UNIQUE INDEX `contracts_tenant_registration_idx` ON `employment_contracts` (`tenant_id`,`company_source_id`,`registration_number`);--> statement-breakpoint
CREATE TABLE `legacy_contract_map` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`company_source_id` integer NOT NULL,
	`source_registration` integer NOT NULL,
	`contract_id` integer NOT NULL,
	`target_code` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`contract_id`) REFERENCES `employment_contracts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legacy_map_source_idx` ON `legacy_contract_map` (`tenant_id`,`company_source_id`,`source_registration`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`person_key` text NOT NULL,
	`name` text NOT NULL,
	`cpf` text,
	`pis` text,
	`birth_date` text,
	`needs_review` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_tenant_key_idx` ON `people` (`tenant_id`,`person_key`);