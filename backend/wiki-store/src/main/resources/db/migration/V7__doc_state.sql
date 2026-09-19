-- =====================================================================
-- 协同编辑：Yjs 文档二进制快照（collab-server 防抖回写，打开页面时回放）
-- =====================================================================

CREATE TABLE `wiki_doc_state` (
    `node_id`    BIGINT       NOT NULL COMMENT '页面ID（与 wiki_node.id 一一对应）',
    `state`      MEDIUMBLOB   NOT NULL COMMENT 'Yjs 文档增量编码快照（Y.encodeStateAsUpdate）',
    `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后落库时间',
    PRIMARY KEY (`node_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '协同编辑 Yjs 文档快照';
