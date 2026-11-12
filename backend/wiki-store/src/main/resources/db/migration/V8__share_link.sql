-- =====================================================================
-- 页面分享链接：生成只读分享地址（公开 / 登录可读 / 仅空间成员），支持有效期与撤销
-- 一个页面同时只保留一条有效分享记录（更新即覆盖）
-- =====================================================================

CREATE TABLE IF NOT EXISTS `wiki_share_link` (
    `id`         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `token`      VARCHAR(64) NOT NULL COMMENT '分享令牌（URL 路径段，随机不可枚举）',
    `node_id`    BIGINT      NOT NULL COMMENT '页面ID',
    `space_id`   BIGINT      NOT NULL COMMENT '所属空间ID（权限校验用）',
    `access`     TINYINT     NOT NULL DEFAULT 0 COMMENT '访问范围：0 任何人可读 1 登录用户可读 2 仅空间成员',
    `created_by` BIGINT      NOT NULL COMMENT '创建人用户ID',
    `expires_at` DATETIME    NULL COMMENT '过期时间；NULL 表示永久有效',
    `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_share_link_node` (`node_id`),
    UNIQUE KEY `uk_share_link_token` (`token`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页面分享链接';
