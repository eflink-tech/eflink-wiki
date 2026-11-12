package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.WIKI_SHARE_LINK as SHARE
import tech.eflink.wiki.database.tables.records.WikiShareLinkRecord
import java.time.LocalDateTime

/** 页面分享链接数据访问（一页一条，更新即覆盖） */
@Repository
class ShareLinkRepository(private val dsl: DSLContext) {

    fun findByNode(nodeId: Long): WikiShareLinkRecord? =
        dsl.selectFrom(SHARE).where(SHARE.NODE_ID.eq(nodeId)).fetchOne()

    fun findByToken(token: String): WikiShareLinkRecord? =
        dsl.selectFrom(SHARE).where(SHARE.TOKEN.eq(token)).fetchOne()

    /** 新建或覆盖页面的分享配置，返回最新记录 */
    fun upsert(
        nodeId: Long,
        spaceId: Long,
        token: String,
        access: Int,
        createdBy: Long,
        expiresAt: LocalDateTime?,
    ): WikiShareLinkRecord {
        dsl.deleteFrom(SHARE).where(SHARE.NODE_ID.eq(nodeId)).execute()
        dsl.insertInto(SHARE)
            .set(SHARE.TOKEN, token)
            .set(SHARE.NODE_ID, nodeId)
            .set(SHARE.SPACE_ID, spaceId)
            .set(SHARE.ACCESS, access)
            .set(SHARE.CREATED_BY, createdBy)
            .set(SHARE.EXPIRES_AT, expiresAt)
            .execute()
        return findByNode(nodeId)!!
    }

    fun deleteByNode(nodeId: Long) {
        dsl.deleteFrom(SHARE).where(SHARE.NODE_ID.eq(nodeId)).execute()
    }
}
