-- Additive only: creates simulation tables without modifying existing data.
CREATE TABLE `tr_paper_accounts` (
  `userId` bigint unsigned NOT NULL,
  `initialCapital` double NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`)
);
CREATE TABLE `tr_paper_trades` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `userId` bigint unsigned NOT NULL,
  `requestId` varchar(36) NOT NULL,
  `plan` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closedAt` timestamp NULL DEFAULT NULL,
  `exitPrice` double DEFAULT NULL,
  `net` double DEFAULT NULL,
  `exitReason` varchar(32) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_paper_user_request` (`userId`, `requestId`)
);
