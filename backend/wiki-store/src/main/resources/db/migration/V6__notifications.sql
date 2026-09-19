-- =====================================================================
-- 站内通知：评论/回复/被提及等事件的收件箱；钉钉/飞书机器人推送的落库底座
-- =====================================================================

CREATE TABLE `notification` (
    `id`         BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`    BIGINT        NOT NULL COMMENT '收件人用户ID',
    `type`       TINYINT       NOT NULL COMMENT '类型：1 页面被评论 2 评论被回复 3 被@提及',
    `title`      VARCHAR(500)  NOT NULL COMMENT '通知文案（创建时快照，含动作人与页面标题）',
    `payload`    VARCHAR(1024) NULL COMMENT '跳转定位 JSON：{spaceId,nodeId,commentId}',
    `is_read`    TINYINT       NOT NULL DEFAULT 0 COMMENT '已读：0 未读 1 已读',
    `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_notification_user_read` (`user_id`, `is_read`, `id`),
    KEY `idx_notification_user_created` (`user_id`, `created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '站内通知';
