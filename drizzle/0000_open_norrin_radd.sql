CREATE TABLE `accounts` (
	`id` varchar(36) NOT NULL,
	`name` varchar(191) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`status` enum('active','suspended','canceled') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `accounts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `store_managers` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `store_managers_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_managers_user_id_store_id_unique` UNIQUE(`user_id`,`store_id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` varchar(36) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`name` varchar(191) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`currency` varchar(3) NOT NULL DEFAULT 'BRL',
	`status` enum('active','paused','closed') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_account_id_slug_unique` UNIQUE(`account_id`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`account_id` varchar(36),
	`email` varchar(191) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`name` varchar(191) NOT NULL,
	`role` enum('platform_admin','admin','manager') NOT NULL DEFAULT 'admin',
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `store_managers` ADD CONSTRAINT `store_managers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `store_managers` ADD CONSTRAINT `store_managers_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stores` ADD CONSTRAINT `stores_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `store_managers_store_id_idx` ON `store_managers` (`store_id`);--> statement-breakpoint
CREATE INDEX `stores_account_id_idx` ON `stores` (`account_id`);--> statement-breakpoint
CREATE INDEX `users_account_id_idx` ON `users` (`account_id`);