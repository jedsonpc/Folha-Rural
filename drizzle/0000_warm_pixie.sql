CREATE TABLE `companies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`source_id` integer NOT NULL,
	`name` text NOT NULL,
	`document` text,
	`city` text,
	`state` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companies_tenant_source_idx` ON `companies` (`tenant_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `import_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`file_name` text NOT NULL,
	`companies_count` integer DEFAULT 0 NOT NULL,
	`workers_count` integer DEFAULT 0 NOT NULL,
	`services_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`source_id` integer NOT NULL,
	`group_source_id` integer,
	`description` text NOT NULL,
	`unit_source_id` integer,
	`fgts` integer DEFAULT false NOT NULL,
	`inss` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_tenant_source_idx` ON `services` (`tenant_id`,`source_id`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`source_id` integer NOT NULL,
	`company_source_id` integer NOT NULL,
	`name` text NOT NULL,
	`cpf` text,
	`admission_date` text,
	`role` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workers_tenant_source_idx` ON `workers` (`tenant_id`,`source_id`);