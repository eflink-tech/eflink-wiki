package tech.eflink.wiki.store.repository

import org.jooq.DSLContext
import org.jooq.Field
import org.jooq.impl.DSL
import org.springframework.stereotype.Repository
import tech.eflink.wiki.database.Tables.API_KEY
import tech.eflink.wiki.database.Tables.WEBHOOK
import tech.eflink.wiki.database.Tables.WEBHOOK_DELIVERY
import tech.eflink.wiki.database.tables.records.ApiKeyRecord
import tech.eflink.wiki.database.tables.records.WebhookRecord
import java.time.LocalDateTime

/** 开放 API 密钥数据访问（只存 SHA-256 散列） */
@Repository
class ApiKeyRepository(private val dsl: DSLContext) {

    fun create(name: String, keyPrefix: String, keyHash: String, createdBy: Long): Long =
        dsl.insertInto(API_KEY)
            .set(API_KEY.NAME, name)
            .set(API_KEY.KEY_PREFIX, keyPrefix)
            .set(API_KEY.KEY_HASH, keyHash)
            .set(API_KEY.CREATED_BY, createdBy)
            .returningResult(API_KEY.ID)
            .fetchOne()!!.value1()

    fun findByPrefix(prefix: String): ApiKeyRecord? =
        dsl.selectFrom(API_KEY).where(API_KEY.KEY_PREFIX.eq(prefix)).and(API_KEY.STATUS.eq(1)).fetchOne()

    fun touchUsed(id: Long) {
        dsl.update(API_KEY).set(API_KEY.LAST_USED_AT, LocalDateTime.now()).where(API_KEY.ID.eq(id)).execute()
    }

    fun listAll(): List<ApiKeyRecord> =
        dsl.selectFrom(API_KEY).orderBy(API_KEY.ID.desc()).fetch()

    fun delete(id: Long) {
        dsl.deleteFrom(API_KEY).where(API_KEY.ID.eq(id)).execute()
    }
}

/** Webhook 订阅与投递记录数据访问 */
@Repository
class WebhookRepository(private val dsl: DSLContext) {

    fun create(name: String, url: String, secret: String, events: String, createdBy: Long): Long =
        dsl.insertInto(WEBHOOK)
            .set(WEBHOOK.NAME, name)
            .set(WEBHOOK.URL, url)
            .set(WEBHOOK.SECRET, secret)
            .set(WEBHOOK.EVENTS, events)
            .set(WEBHOOK.CREATED_BY, createdBy)
            .returningResult(WEBHOOK.ID)
            .fetchOne()!!.value1()

    fun findById(id: Long): WebhookRecord? =
        dsl.selectFrom(WEBHOOK).where(WEBHOOK.ID.eq(id)).fetchOne()

    fun listAll(): List<WebhookRecord> =
        dsl.selectFrom(WEBHOOK).orderBy(WEBHOOK.ID.desc()).fetch()

    /** 订阅了指定事件的启用状态订阅 */
    fun findActiveByEvent(event: String): List<WebhookRecord> =
        dsl.selectFrom(WEBHOOK)
            .where(WEBHOOK.STATUS.eq(1))
            .and(WEBHOOK.EVENTS.eq("*").or(WEBHOOK.EVENTS.like("%$event%")))
            .fetch()

    fun update(
        id: Long,
        name: String?,
        url: String?,
        secret: String?,
        events: String?,
        status: Int?
    ) {
        val assignments = LinkedHashMap<Field<*>, Any>()
        name?.let { assignments[WEBHOOK.NAME] = it }
        url?.let { assignments[WEBHOOK.URL] = it }
        secret?.let { assignments[WEBHOOK.SECRET] = it }
        events?.let { assignments[WEBHOOK.EVENTS] = it }
        status?.let { assignments[WEBHOOK.STATUS] = it }
        if (assignments.isEmpty()) return
        dsl.update(WEBHOOK).set(assignments).where(WEBHOOK.ID.eq(id)).execute()
    }

    fun delete(id: Long) {
        dsl.deleteFrom(WEBHOOK).where(WEBHOOK.ID.eq(id)).execute()
    }

    fun recordDelivery(webhookId: Long, event: String, payload: String, respCode: Int?, success: Boolean, error: String?) {
        dsl.insertInto(WEBHOOK_DELIVERY)
            .set(WEBHOOK_DELIVERY.WEBHOOK_ID, webhookId)
            .set(WEBHOOK_DELIVERY.EVENT, event)
            .set(WEBHOOK_DELIVERY.PAYLOAD, payload.take(4000))
            .set(WEBHOOK_DELIVERY.RESP_CODE, respCode)
            .set(WEBHOOK_DELIVERY.SUCCESS, if (success) 1 else 0)
            .set(WEBHOOK_DELIVERY.ERROR, error?.take(500))
            .execute()
    }

    fun listDeliveries(webhookId: Long?, limit: Int): List<Map<String, Any?>> {
        val cond = webhookId?.let { WEBHOOK_DELIVERY.WEBHOOK_ID.eq(it) } ?: DSL.trueCondition()
        return dsl.selectFrom(WEBHOOK_DELIVERY)
            .where(cond)
            .orderBy(WEBHOOK_DELIVERY.ID.desc())
            .limit(limit)
            .fetch { record ->
                mapOf(
                    "id" to record.id,
                    "webhookId" to record.webhookId,
                    "event" to record.event,
                    "payload" to record.payload,
                    "respCode" to record.respCode,
                    "success" to record.success,
                    "error" to record.error,
                    "createdAt" to record.createdAt
                )
            }
    }
}
