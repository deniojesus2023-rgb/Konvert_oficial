CREATE TABLE `store_settings` (
	`id` varchar(36) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`key` varchar(191) NOT NULL,
	`value` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `store_settings_store_id_key_unique` UNIQUE(`store_id`,`key`)
);
--> statement-breakpoint
ALTER TABLE `store_settings` ADD CONSTRAINT `store_settings_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;