CREATE TABLE `custom_tags` (
	`id` varchar(36) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`name` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `custom_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_tags_store_id_name_unique` UNIQUE(`store_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `customer_tags` (
	`id` varchar(36) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`customer_id` varchar(36) NOT NULL,
	`tag` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customer_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_tags_store_id_customer_id_tag_unique` UNIQUE(`store_id`,`customer_id`,`tag`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` varchar(36) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`name` varchar(191),
	`email` varchar(191),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `journey_executions` (
	`id` varchar(36) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`journey_id` varchar(36) NOT NULL,
	`customer_id` varchar(36) NOT NULL,
	`status` enum('running','completed','canceled') NOT NULL DEFAULT 'running',
	`current_step` int NOT NULL DEFAULT 0,
	`next_step_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `journey_executions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` varchar(36) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`name` varchar(191) NOT NULL,
	`trigger` enum('novo_cliente','pedido_concluido','checkout_abandoned','inativo_30') NOT NULL,
	`steps` json NOT NULL,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `journeys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_notifications` (
	`id` varchar(36) NOT NULL,
	`store_id` varchar(36) NOT NULL,
	`title` varchar(191) NOT NULL,
	`message` text NOT NULL,
	`channel` enum('whatsapp') NOT NULL DEFAULT 'whatsapp',
	`target_audience` varchar(64) NOT NULL DEFAULT 'all',
	`scheduled_at` timestamp NOT NULL,
	`status` enum('scheduled','sent','canceled','failed') NOT NULL DEFAULT 'scheduled',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_id` varchar(36);--> statement-breakpoint
ALTER TABLE `custom_tags` ADD CONSTRAINT `custom_tags_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer_tags` ADD CONSTRAINT `customer_tags_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journey_executions` ADD CONSTRAINT `journey_executions_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journey_executions` ADD CONSTRAINT `journey_executions_journey_id_journeys_id_fk` FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journey_executions` ADD CONSTRAINT `journey_executions_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journeys` ADD CONSTRAINT `journeys_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduled_notifications` ADD CONSTRAINT `scheduled_notifications_store_id_stores_id_fk` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_tags_store_id_idx` ON `customer_tags` (`store_id`);--> statement-breakpoint
CREATE INDEX `customer_tags_customer_id_idx` ON `customer_tags` (`customer_id`);--> statement-breakpoint
CREATE INDEX `journey_executions_store_id_idx` ON `journey_executions` (`store_id`);--> statement-breakpoint
CREATE INDEX `journey_executions_journey_id_idx` ON `journey_executions` (`journey_id`);--> statement-breakpoint
CREATE INDEX `journey_executions_customer_id_idx` ON `journey_executions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `journey_executions_status_next_step_at_idx` ON `journey_executions` (`status`,`next_step_at`);--> statement-breakpoint
CREATE INDEX `journeys_store_id_idx` ON `journeys` (`store_id`);--> statement-breakpoint
CREATE INDEX `journeys_store_id_trigger_status_idx` ON `journeys` (`store_id`,`trigger`,`status`);--> statement-breakpoint
CREATE INDEX `scheduled_notifications_store_id_idx` ON `scheduled_notifications` (`store_id`);--> statement-breakpoint
CREATE INDEX `scheduled_notifications_store_id_status_idx` ON `scheduled_notifications` (`store_id`,`status`);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `orders_customer_id_idx` ON `orders` (`customer_id`);--> statement-breakpoint
CREATE INDEX `orders_store_id_customer_id_idx` ON `orders` (`store_id`,`customer_id`);