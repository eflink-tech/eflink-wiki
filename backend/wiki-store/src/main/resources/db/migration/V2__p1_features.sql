-- =====================================================================
-- P1 功能扩展：嵌入块数据 / 页面模板 / 操作审计
-- =====================================================================

-- 嵌入块数据（word/excel/pptx/draw/mindmap 五模块的独立内容存储，随页面级联删除）
CREATE TABLE `wiki_block_data` (
    `id`         BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `node_id`    BIGINT       NOT NULL COMMENT '所属页面ID',
    `embed_id`   VARCHAR(64)  NOT NULL COMMENT '嵌入块ID（页面内唯一）',
    `type`       VARCHAR(32)  NOT NULL COMMENT '块类型：word/excel/pptx/draw/mindmap',
    `title`      VARCHAR(256) NOT NULL DEFAULT '' COMMENT '嵌入文档标题',
    `content`    LONGTEXT     NULL COMMENT '模块私有内容（JSON/文本）',
    `updated_by` BIGINT       NULL COMMENT '最后保存人',
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_block_node_embed` (`node_id`, `embed_id`),
    KEY `idx_block_type` (`type`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '嵌入块数据';

-- 页面模板（全局模板，保存页面快照；从模板建页时复制进草稿）
CREATE TABLE `wiki_template` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `title`       VARCHAR(256) NOT NULL COMMENT '模板名称',
    `description` VARCHAR(512) NULL COMMENT '模板描述',
    `content`     LONGTEXT     NULL COMMENT '模板正文（ProseMirror JSON 字符串）',
    `created_by`  BIGINT       NOT NULL COMMENT '创建人',
    `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页面模板';

-- 操作审计日志（登录/发布/删除/恢复/成员变更/用户管理）
CREATE TABLE `operation_log` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`     BIGINT        NOT NULL COMMENT '操作人',
    `username`    VARCHAR(64)   NOT NULL DEFAULT '' COMMENT '操作人账号（冗余，防用户删除后无法追溯）',
    `action`      VARCHAR(64)   NOT NULL COMMENT '动作：login/publish/node.delete/node.restore/member.add/... ',
    `target_type` VARCHAR(32)   NULL COMMENT '目标类型：user/node/space/version',
    `target_id`   VARCHAR(64)   NULL COMMENT '目标ID',
    `detail`      VARCHAR(1024) NULL COMMENT '补充信息',
    `ip`          VARCHAR(64)   NULL COMMENT '来源IP',
    `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
    PRIMARY KEY (`id`),
    KEY `idx_oplog_user` (`user_id`),
    KEY `idx_oplog_time` (`created_at`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '操作审计日志';
