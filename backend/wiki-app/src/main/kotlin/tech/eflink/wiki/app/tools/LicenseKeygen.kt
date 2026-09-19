package tech.eflink.wiki.app.tools

import java.nio.file.Files
import java.nio.file.Path
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

/**
 * License 密钥与授权文件生成工具（厂商侧使用，产物不随产品分发私钥）。
 *
 * 用法：
 *   ./gradlew :wiki-app:licenseKeygen -Pout=deploy/keys -Plicensee="客户A" -Pdays=365 -PmaxUsers=100
 * 产物：
 *   <out>/private-key.b64  Ed25519 私钥（厂商保存，用于签发）
 *   <out>/public-key.b64   Ed25519 公钥（内置于产品配置 wiki.license.public-key 用于验签）
 *   <out>/license.txt      授权文件（内容粘贴到管理后台上传）
 */
fun main(args: Array<String>) {
    val out = System.getProperty("out") ?: "deploy/keys"
    val licensee = System.getProperty("licensee") ?: "开发环境"
    val days = System.getProperty("days")?.toLong() ?: 365L
    val maxUsers = System.getProperty("maxUsers")?.toIntOrNull()

    val kpg = KeyPairGenerator.getInstance("Ed25519")
    val pair = kpg.generateKeyPair()
    val b64 = Base64.getEncoder()

    val dir = Path.of(out)
    Files.createDirectories(dir)
    Files.writeString(dir.resolve("private-key.b64"), b64.encodeToString(pair.private.encoded))
    Files.writeString(dir.resolve("public-key.b64"), b64.encodeToString(pair.public.encoded))

    // 授权载荷：规范化字符串 = 各字段按序用 | 拼接（产品内验签按同一规则）
    val expiresAt = java.time.Instant.now().plusSeconds(days * 86400).toString()
    val features = "sso,webhook,openapi"
    val payload = listOf("eflink-wiki", licensee, expiresAt, maxUsers?.toString() ?: "0", features).joinToString("|")
    val signer = Signature.getInstance("Ed25519")
    signer.initSign(pair.private)
    signer.update(payload.toByteArray(Charsets.UTF_8))
    val signature = b64.encodeToString(signer.sign())

    val licenseJson = """
        {
          "product": "eflink-wiki",
          "licensee": "$licensee",
          "expiresAt": "$expiresAt",
          "maxUsers": ${maxUsers ?: "null"},
          "features": "$features",
          "signature": "$signature"
        }
    """.trimIndent()
    Files.writeString(dir.resolve("license.txt"), licenseJson)

    println("已生成到 $dir：private-key.b64 / public-key.b64 / license.txt")
    println("公钥（配置到 wiki.license.public-key）：")
    println(b64.encodeToString(pair.public.encoded))
}
