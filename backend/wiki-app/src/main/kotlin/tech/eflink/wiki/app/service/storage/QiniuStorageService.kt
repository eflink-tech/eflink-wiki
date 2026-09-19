package tech.eflink.wiki.app.service.storage

import com.qiniu.storage.BucketManager
import com.qiniu.storage.Configuration
import com.qiniu.storage.Region
import com.qiniu.storage.UploadManager
import com.qiniu.util.Auth
import org.slf4j.LoggerFactory
import org.springframework.web.multipart.MultipartFile
import tech.eflink.wiki.app.config.WikiProperties
import java.time.LocalDate
import java.util.UUID

/**
 * 七牛云对象存储（wiki.storage.type=qiniu 时启用）。
 * AK/SK 与 eflink-backend 共用同一套凭据与桶；本系统对象统一落在独立子目录
 * keyPrefix（默认 wiki/）下：keyPrefix/yyyy/MM/uuid.ext。
 * 桶为私有空间时返回服务端签名的访问 URL；wiki 的 URL 会嵌入页面正文长期使用，
 * 签名有效期默认 10 年（与缩略图场景的短时效签名不同），并对齐到天保证同一天内 URL 字节一致。
 */
class QiniuStorageService(private val props: WikiProperties) : StorageService {

    private val log = LoggerFactory.getLogger(QiniuStorageService::class.java)

    private val qiniu get() = props.storage.qiniu

    private val auth = Auth.create(qiniu.accessKey, qiniu.secretKey)

    private val uploadManager = UploadManager(Configuration(resolveRegion(qiniu.zone)))

    private val bucketManager = BucketManager(auth, Configuration(resolveRegion(qiniu.zone)))

    /** AK/SK/bucket/domain 是否齐全；不齐时上传直接报错并给出明确提示 */
    val configured: Boolean
        get() = qiniu.accessKey.isNotBlank() && qiniu.secretKey.isNotBlank() &&
            qiniu.bucket.isNotBlank() && qiniu.domain.isNotBlank()

    init {
        if (!configured) {
            log.warn("七牛云配置不完整（检查 wiki.storage.qiniu.* 或 QINIU_* 环境变量），文件上传将不可用")
        }
    }

    override fun save(file: MultipartFile): String {
        require(configured) { "七牛云未配置完整（access-key/secret-key/bucket/domain），无法上传文件" }
        val ext = file.originalFilename?.substringAfterLast('.', "")?.lowercase().orEmpty()
        val today = LocalDate.now()
        val key = "${qiniu.keyPrefix}%04d/%02d/${UUID.randomUUID()}.$ext".format(today.year, today.monthValue)
        val token = auth.uploadToken(qiniu.bucket)
        return try {
            val response = uploadManager.put(file.bytes, key, token)
            if (!response.isOK) {
                throw IllegalStateException("文件上传失败: ${response.error}")
            }
            // 私有桶下 URL 长期稳定，顺手设置长缓存响应头；失败不影响上传结果
            try {
                bucketManager.changeHeaders(
                    qiniu.bucket,
                    key,
                    mapOf("Cache-Control" to "public, max-age=2592000"),
                )
            } catch (e: Exception) {
                log.warn("设置对象缓存头失败（不影响上传）: key={}", key, e)
            }
            val url = accessUrl(key)
            log.info("文件上传成功: key={}", key)
            url
        } catch (e: IllegalStateException) {
            throw e
        } catch (e: Exception) {
            log.error("文件上传异常: key={}", key, e)
            throw IllegalStateException("文件上传失败: ${e.message}")
        }
    }

    /** 私有桶生成带 deadline 的签名 URL；公有桶直接返回裸 URL */
    private fun accessUrl(key: String): String {
        val base = "${qiniu.domain.trimEnd('/')}/$key"
        if (!qiniu.privateBucket) return base
        val deadline = System.currentTimeMillis() / 1000 + qiniu.privateUrlDeadlineSeconds
        return auth.privateDownloadUrlWithDeadline(base, deadline)
    }

    private fun resolveRegion(zone: String): Region = when (zone.lowercase()) {
        "huadong" -> Region.huadong()
        "huabei" -> Region.huabei()
        "huanan" -> Region.huanan()
        "beimei" -> Region.beimei()
        "xinjiapo" -> Region.xinjiapo()
        else -> Region.autoRegion()
    }
}
