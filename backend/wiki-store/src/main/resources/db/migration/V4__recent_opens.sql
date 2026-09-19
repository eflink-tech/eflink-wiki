-- =====================================================================
-- 最近打开页面（按用户记录，Home 工作台展示）
-- =====================================================================

CREATE TABLE IF NOT EXISTS `wiki_recent_open` (
    `id`        BIGINT   NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`   BIGINT   NOT NULL COMMENT '用户ID',
    `node_id`   BIGINT   NOT NULL COMMENT '页面ID',
    `opened_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近打开时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_recent_user_node` (`user_id`, `node_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '最近打开页面';
