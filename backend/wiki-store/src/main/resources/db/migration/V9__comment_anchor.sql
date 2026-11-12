-- =====================================================================
-- 评论锚定选区：记录评论关联的正文片段（引用文本 + ProseMirror 起止位置）
-- 仅一级评论使用；锚点随内容编辑可能漂移，前端按引用文本兜底展示
-- MySQL 不支持 ADD COLUMN IF NOT EXISTS，用 information_schema 守护保证可重复执行
-- =====================================================================

SET @anchor_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'wiki_comment' AND COLUMN_NAME = 'anchor_text'
);
SET @anchor_sql := IF(
    @anchor_exists = 0,
    'ALTER TABLE `wiki_comment` ADD COLUMN `anchor_text` VARCHAR(300) NULL COMMENT ''锚定引用的正文片段'' AFTER `content`, ADD COLUMN `anchor_from` INT NULL COMMENT ''锚定起点（ProseMirror 文档位置）'' AFTER `anchor_text`, ADD COLUMN `anchor_to` INT NULL COMMENT ''锚定终点（ProseMirror 文档位置）'' AFTER `anchor_from`',
    'SELECT 1'
);
PREPARE anchor_stmt FROM @anchor_sql;
EXECUTE anchor_stmt;
DEALLOCATE PREPARE anchor_stmt;
