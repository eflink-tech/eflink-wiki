-- =====================================================================
-- eflink-wiki 初始表结构（V1）
-- 约定：小企业内部使用，无自助注册，账号由管理后台创建；无多租户
-- =====================================================================

-- 用户表（产品自带账号体系；预留企业内部账号对接时可用 Flyway 迁移追加 provider/external_id 列）
CREATE TABLE `user` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `username`     VARCHAR(64)  NOT NULL COMMENT '登录账号',
    `password_hash` VARCHAR(100) NOT NULL COMMENT 'BCrypt 密码散列',
    `display_name` VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '姓名',
    `avatar`       VARCHAR(512) NULL COMMENT '头像 URL',
    `role`         TINYINT      NOT NULL DEFAULT 2 COMMENT '系统角色：1 管理员 2 普通用户',
    `status`       TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1 正常 2 禁用',
    `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_username` (`username`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '用户';

-- 刷新令牌表（无状态 JWT 之外的会话吊销依据，按人可多设备）
CREATE TABLE `refresh_token` (
    `id`         BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`    BIGINT      NOT NULL COMMENT '用户ID',
    `token_hash` CHAR(64)    NOT NULL COMMENT '令牌 SHA-256 散列（不存原文）',
    `expires_at` DATETIME    NOT NULL COMMENT '过期时间',
    `revoked`    TINYINT     NOT NULL DEFAULT 0 COMMENT '是否已吊销：0 否 1 是',
    `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_refresh_token_hash` (`token_hash`),
    KEY `idx_refresh_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '刷新令牌';

-- 知识库空间
CREATE TABLE `wiki_space` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`        VARCHAR(128) NOT NULL COMMENT '空间名称',
    `icon`        VARCHAR(16)  NULL COMMENT '图标（emoji）',
    `description` VARCHAR(512) NULL COMMENT '空间描述',
    `owner_id`    BIGINT       NOT NULL COMMENT '创建者用户ID',
    `visibility`  TINYINT      NOT NULL DEFAULT 0 COMMENT '可见性：0 私有 1 登录可读',
    `is_del`      TINYINT      NOT NULL DEFAULT 0 COMMENT '软删：0 否 1 是',
    `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_space_owner` (`owner_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '知识库空间';

-- 空间成员
CREATE TABLE `wiki_member` (
    `id`         BIGINT  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `space_id`   BIGINT  NOT NULL COMMENT '空间ID',
    `user_id`    BIGINT  NOT NULL COMMENT '用户ID',
    `role`       TINYINT NOT NULL DEFAULT 3 COMMENT '空间角色：1 管理员 2 编辑者 3 查看者',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_member_space_user` (`space_id`, `user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '空间成员';

-- 页面树节点（页面即节点）
CREATE TABLE `wiki_node` (
    `id`                 BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `space_id`           BIGINT       NOT NULL COMMENT '所属空间ID',
    `parent_id`          BIGINT       NOT NULL DEFAULT 0 COMMENT '父节点ID，0 = 空间根',
    `title`              VARCHAR(256) NOT NULL DEFAULT '' COMMENT '页面标题',
    `sort_order`         INT          NOT NULL DEFAULT 0 COMMENT '同级排序值',
    `current_version_id` BIGINT       NULL COMMENT '当前已发布版本ID，NULL = 从未发布',
    `created_by`         BIGINT       NOT NULL COMMENT '创建人用户ID',
    `is_del`             TINYINT      NOT NULL DEFAULT 0 COMMENT '软删：0 否 1 是（回收站）',
    `deleted_at`         DATETIME     NULL COMMENT '删除时间',
    `created_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    KEY `idx_node_space` (`space_id`, `parent_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页面树节点';

-- 页面草稿（每节点每人一份，编辑器防抖自动保存）
CREATE TABLE `wiki_draft` (
    `id`              BIGINT   NOT NULL AUTO_INCREMENT COMMENT '主键',
    `node_id`         BIGINT   NOT NULL COMMENT '页面ID',
    `user_id`         BIGINT   NOT NULL COMMENT '草稿属主用户ID',
    `content`         LONGTEXT NULL COMMENT '页面正文（ProseMirror JSON 字符串，含嵌入块数据）',
    `base_version_id` BIGINT   NULL COMMENT '草稿基于的版本ID',
    `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_draft_node_user` (`node_id`, `user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页面草稿';

-- 发布版本（不可变快照，仅搜已发布正文）
CREATE TABLE `wiki_version` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `node_id`       BIGINT       NOT NULL COMMENT '页面ID',
    `version_no`    INT          NOT NULL COMMENT '版本号（节点内自增）',
    `title`         VARCHAR(256) NOT NULL DEFAULT '' COMMENT '发布时标题',
    `content`       LONGTEXT     NULL COMMENT '发布快照正文（ProseMirror JSON 字符串）',
    `published_by`  BIGINT       NOT NULL COMMENT '发布人用户ID',
    `published_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_version_node_no` (`node_id`, `version_no`),
    FULLTEXT KEY `ft_version_content` (`title`, `content`) WITH PARSER ngram
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页面发布版本';

-- 星标收藏
CREATE TABLE `wiki_favorite` (
    `id`         BIGINT   NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`    BIGINT   NOT NULL COMMENT '用户ID',
    `node_id`    BIGINT   NOT NULL COMMENT '页面ID',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_favorite_user_node` (`user_id`, `node_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页面收藏';

-- 页面评论（P1 启用，先建表）
CREATE TABLE `wiki_comment` (
    `id`         BIGINT  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `node_id`    BIGINT  NOT NULL COMMENT '页面ID',
    `user_id`    BIGINT  NOT NULL COMMENT '评论人用户ID',
    `parent_id`  BIGINT  NOT NULL DEFAULT 0 COMMENT '父评论ID，0 = 顶级',
    `content`    TEXT    NOT NULL COMMENT '评论内容',
    `is_del`     TINYINT NOT NULL DEFAULT 0 COMMENT '软删：0 否 1 是',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_comment_node` (`node_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '页面评论';

-- 活动流水（浏览计数与后续统计的数据来源）
CREATE TABLE `wiki_activity` (
    `id`         BIGINT   NOT NULL AUTO_INCREMENT COMMENT '主键',
    `node_id`    BIGINT   NOT NULL COMMENT '页面ID',
    `space_id`   BIGINT   NOT NULL COMMENT '空间ID',
    `user_id`    BIGINT   NOT NULL COMMENT '操作人用户ID',
    `action`     TINYINT  NOT NULL COMMENT '动作：1 浏览 2 编辑 3 发布 4 恢复',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
    PRIMARY KEY (`id`),
    KEY `idx_activity_node` (`node_id`, `action`),
    KEY `idx_activity_space` (`space_id`, `action`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '活动流水';
