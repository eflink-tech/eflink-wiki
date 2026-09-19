-- =====================================================================
-- 用户组与按组授权：管理后台建组拉人 / 空间按组授权 / LDAP 部门同步落点
-- =====================================================================

-- 用户组（手动建组 source=1；LDAP 部门同步组 source=2，external_dn 为目录侧唯一标识）
CREATE TABLE `user_group` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`        VARCHAR(64)  NOT NULL COMMENT '组名',
    `description` VARCHAR(255) NULL COMMENT '描述',
    `source`      TINYINT      NOT NULL DEFAULT 1 COMMENT '来源：1 手动创建 2 LDAP 同步',
    `external_dn` VARCHAR(255) NULL COMMENT 'LDAP 组唯一标识（DN/memberOf 值），同步组专用',
    `is_del`      TINYINT      NOT NULL DEFAULT 0 COMMENT '软删：0 正常 1 已删除',
    `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_group_name` (`name`),
    KEY `idx_group_external_dn` (`external_dn`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '用户组';

-- 组成员（用户 ↔ 组 多对多）
CREATE TABLE `user_group_member` (
    `id`         BIGINT   NOT NULL AUTO_INCREMENT COMMENT '主键',
    `group_id`   BIGINT   NOT NULL COMMENT '组ID',
    `user_id`    BIGINT   NOT NULL COMMENT '用户ID',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_group_member_group_user` (`group_id`, `user_id`),
    KEY `idx_group_member_user` (`user_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '用户组成员';

-- 空间-组授权（把整组以某角色授权进空间，语义同 wiki_member 的 1/2/3）
CREATE TABLE `wiki_space_group` (
    `id`         BIGINT   NOT NULL AUTO_INCREMENT COMMENT '主键',
    `space_id`   BIGINT   NOT NULL COMMENT '空间ID',
    `group_id`   BIGINT   NOT NULL COMMENT '组ID',
    `role`       TINYINT  NOT NULL DEFAULT 3 COMMENT '组在空间内的角色：1 管理员 2 编辑者 3 查看者',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '授权时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_space_group_space_group` (`space_id`, `group_id`),
    KEY `idx_space_group_group` (`group_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '空间用户组授权';
