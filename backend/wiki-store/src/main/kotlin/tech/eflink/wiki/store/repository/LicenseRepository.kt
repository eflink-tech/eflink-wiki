package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.APP_LICENSE
import tech.eflink.wiki.database.tables.records.AppLicenseRecord

/** License 授权数据访问（保留最新一条） */
@Repository
class LicenseRepository(private val dsl: DSLContext) {

    fun findLatest(): AppLicenseRecord? =
        dsl.selectFrom(APP_LICENSE).orderBy(APP_LICENSE.ID.desc()).limit(1).fetchOne()

    fun save(
        content: String,
        licensee: String,
        expiresAt: java.time.LocalDateTime?,
        maxUsers: Int?,
        features: String,
        updatedBy: Long
    ) {
        // 单授权产品：覆盖旧记录
        dsl.deleteFrom(APP_LICENSE).execute()
        dsl.insertInto(APP_LICENSE)
            .set(APP_LICENSE.CONTENT, content)
            .set(APP_LICENSE.LICENSEE, licensee)
            .set(APP_LICENSE.EXPIRES_AT, expiresAt)
            .set(APP_LICENSE.MAX_USERS, maxUsers)
            .set(APP_LICENSE.FEATURES, features)
            .set(APP_LICENSE.STATUS, "valid")
            .set(APP_LICENSE.UPDATED_BY, updatedBy)
            .execute()
    }
}
