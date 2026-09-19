-- =====================================================================
-- P2 功能扩展：企业账号对接 / 开放API / Webhook / License
-- =====================================================================

-- 用户表扩展：账号来源（企业账号对接预留位落地）
ALTER TABLE `user`
    ADD COLUMN `provider`    VARCHAR(32)  NOT NULL DEFAULT 'local' COMMENT '账号来源：local 本地 / ldap 企业目录 / oidc 等',
    ADD COLUMN `external_id` VARCHAR(128) NULL COMMENT '外部身份ID（企业目录里的唯一标识）',
    ADD COLUMN `email`       VARCHAR(128) NULL COMMENT '邮箱',
    ADD UNIQUE KEY `uk_user_provider_external` (`provider`, `external_id`);

-- 开放 API 密钥（只读开放接口鉴权；只存散列）
CREATE TABLE `api_key` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`         VARCHAR(128) NOT NULL COMMENT '用途名称',
    `key_prefix`   VARCHAR(16)  NOT NULL COMMENT '密钥前缀（定位用，非机密）',
    `key_hash`     CHAR(64)     NOT NULL COMMENT '完整密钥 SHA-256 散列',
    `status`       TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 启用 2 停用',
    `created_by`   BIGINT       NOT NULL COMMENT '创建人',
    `last_used_at` DATETIME     NULL COMMENT '最近使用时间',
    `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_api_key_prefix` (`key_prefix`),
    KEY `idx_api_key_hash` (`key_hash`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '开放API密钥';

-- Webhook 订阅
CREATE TABLE `webhook` (
    `id`         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`       VARCHAR(128) NOT NULL DEFAULT '' COMMENT '名称',
    `url`        VARCHAR(512) NOT NULL COMMENT '推送目标URL',
    `secret`     VARCHAR(128) NOT NULL COMMENT 'HMAC 签名密钥',
    `events`     VARCHAR(256) NOT NULL DEFAULT '*' COMMENT '订阅事件，逗号分隔（node.publish 等，* 全部）',
    `status`     TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 启用 2 停用',
    `created_by` BIGINT       NOT NULL COMMENT '创建人',
    `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Webhook订阅';

-- Webhook 投递记录（排障用，保留最近由清理脚本控制）
CREATE TABLE `webhook_delivery` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `webhook_id`  BIGINT       NOT NULL COMMENT '订阅ID',
    `event`       VARCHAR(64)  NOT NULL COMMENT '事件名',
    `payload`     TEXT         NULL COMMENT '推送体',
    `resp_code`   INT          NULL COMMENT '响应码',
    `success`     TINYINT      NOT NULL DEFAULT 0 COMMENT '是否成功：0 否 1 是',
    `error`       VARCHAR(512) NULL COMMENT '失败原因',
    `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '投递时间',
    PRIMARY KEY (`id`),
    KEY `idx_wh_delivery_hook` (`webhook_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Webhook投递记录';

-- License 授权（存验证通过的授权文件内容，单行最新）
CREATE TABLE `app_license` (
    `id`         BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `content`    TEXT          NOT NULL COMMENT '授权文件原文（JSON+签名）',
    `licensee`   VARCHAR(256)  NOT NULL DEFAULT '' COMMENT '被授权方',
    `expires_at` DATETIME      NULL COMMENT '到期时间',
    `max_users`  INT           NULL COMMENT '用户数上限（空=不限）',
    `features`   VARCHAR(512)  NOT NULL DEFAULT '' COMMENT '功能开关，逗号分隔',
    `status`     VARCHAR(16)   NOT NULL DEFAULT 'valid' COMMENT '状态：valid/expired/invalid',
    `updated_by` BIGINT        NULL COMMENT '上传人',
    `updated_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'License授权';
