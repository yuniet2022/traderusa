-- Baseline for a NEW, empty TraderUSA database; never an upgrade migration.
-- Generated from db/schema.ts with drizzle-kit export.
CREATE TABLE `tr_access_codes` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`days` int NOT NULL DEFAULT 30,
	`note` varchar(128),
	`usedBy` varchar(64),
	`usedAt` timestamp,
	`revoked` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tr_access_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `tr_access_codes_code_unique` UNIQUE(`code`)
);

CREATE TABLE `tr_alerts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`assetId` varchar(64) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`price` double,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tr_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_alerts_user_asset_kind` UNIQUE(`userId`,`assetId`,`kind`)
);

CREATE TABLE `tr_positions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`userId` bigint unsigned NOT NULL,
	`assetId` varchar(64) NOT NULL,
	`symbol` varchar(32) NOT NULL,
	`assetClass` varchar(16) NOT NULL,
	`lots` json NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tr_positions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_positions_user_asset` UNIQUE(`userId`,`assetId`)
);

CREATE TABLE `tr_users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`passHash` varchar(255) NOT NULL,
	`displayName` varchar(128),
	`isAdmin` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignInAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tr_users_id` PRIMARY KEY(`id`),
	CONSTRAINT `tr_users_username_unique` UNIQUE(`username`)
);

