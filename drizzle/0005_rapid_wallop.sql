CREATE TABLE `account_invoices` (
	`id` varchar(36) NOT NULL,
	`account_id` varchar(36) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`status` enum('pending','paid','overdue','canceled') NOT NULL DEFAULT 'pending',
	`reference_month` varchar(7) NOT NULL,
	`due_date` timestamp NOT NULL,
	`paid_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `account_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_invoices_account_id_reference_month_unique` UNIQUE(`account_id`,`reference_month`)
);
--> statement-breakpoint
CREATE TABLE `platform_audit_log` (
	`id` varchar(36) NOT NULL,
	`platform_admin_user_id` varchar(36) NOT NULL,
	`action` varchar(64) NOT NULL,
	`target_account_id` varchar(36) NOT NULL,
	`target_store_id` varchar(36),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `platform_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `plan` enum('trial','basic','pro','enterprise') DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_invoices` ADD CONSTRAINT `account_invoices_account_id_accounts_id_fk` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_audit_log` ADD CONSTRAINT `platform_audit_log_platform_admin_user_id_users_id_fk` FOREIGN KEY (`platform_admin_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_audit_log` ADD CONSTRAINT `platform_audit_log_target_account_id_accounts_id_fk` FOREIGN KEY (`target_account_id`) REFERENCES `accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_audit_log` ADD CONSTRAINT `platform_audit_log_target_store_id_stores_id_fk` FOREIGN KEY (`target_store_id`) REFERENCES `stores`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_invoices_account_id_idx` ON `account_invoices` (`account_id`);--> statement-breakpoint
CREATE INDEX `platform_audit_log_target_account_id_idx` ON `platform_audit_log` (`target_account_id`);--> statement-breakpoint
CREATE INDEX `platform_audit_log_platform_admin_user_id_idx` ON `platform_audit_log` (`platform_admin_user_id`);