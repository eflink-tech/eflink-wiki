package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.REFRESH_TOKEN
import tech.eflink.wiki.database.tables.records.RefreshTokenRecord
import java.time.LocalDateTime

/** 刷新令牌数据访问（只存 SHA-256 散列） */
@Repository
class RefreshTokenRepository(private val dsl: DSLContext) {

    fun insert(userId: Long, tokenHash: String, expiresAt: LocalDateTime) {
        dsl.insertInto(REFRESH_TOKEN)
            .set(REFRESH_TOKEN.USER_ID, userId)
            .set(REFRESH_TOKEN.TOKEN_HASH, tokenHash)
            .set(REFRESH_TOKEN.EXPIRES_AT, expiresAt)
            .execute()
    }

    /** 未吊销且未过期的令牌 */
    fun findValidByHash(tokenHash: String): RefreshTokenRecord? =
        dsl.selectFrom(REFRESH_TOKEN)
            .where(REFRESH_TOKEN.TOKEN_HASH.eq(tokenHash))
            .and(REFRESH_TOKEN.REVOKED.eq(0))
            .and(REFRESH_TOKEN.EXPIRES_AT.greaterThan(LocalDateTime.now()))
            .fetchOne()

    fun findByHash(tokenHash: String): RefreshTokenRecord? =
        dsl.selectFrom(REFRESH_TOKEN).where(REFRESH_TOKEN.TOKEN_HASH.eq(tokenHash)).fetchOne()

    fun revokeById(id: Long) {
        dsl.update(REFRESH_TOKEN).set(REFRESH_TOKEN.REVOKED, 1).where(REFRESH_TOKEN.ID.eq(id)).execute()
    }

    /** 吊销某用户全部令牌（改密码后强制重新登录） */
    fun revokeAllByUser(userId: Long) {
        dsl.update(REFRESH_TOKEN).set(REFRESH_TOKEN.REVOKED, 1)
            .where(REFRESH_TOKEN.USER_ID.eq(userId)).and(REFRESH_TOKEN.REVOKED.eq(0))
            .execute()
    }
}
