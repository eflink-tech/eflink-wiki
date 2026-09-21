package tech.eflink.wiki.app.config

import org.springframework.boot.context.properties.ConfigurationProperties

/** 应用配置项（application.yml 的 wiki.*） */
@ConfigurationProperties(prefix = "wiki")
data class WikiProperties(
    var jwt: Jwt = Jwt(),
    var captchaEnabled: Boolean = false,
    var storage: Storage = Storage(),
    var branding: Branding = Branding(),
    var license: License = License(),
    var auth: Auth = Auth(),
    var search: Search = Search(),
    var embed: Embed = Embed(),
    var cors: Cors = Cors(),
    var notify: Notify = Notify()
) {
    /**
     * 通知推送配置。站内信永远开启；钉钉/飞书/企业微信机器人配置 webhook 后自动启用，
     * 多渠道同时配置时全部推送。baseUrl 用于拼接 IM 推送消息里的页面链接（外网或办公网可达的前端地址）。
     */
    data class Notify(
        /** 前端可达的基础地址，如 https://wiki.example.com；空则 IM 推送不带链接 */
        var baseUrl: String = "",
        var dingtalk: DingTalk = DingTalk(),
        var feishu: Feishu = Feishu(),
        var wecom: WeCom = WeCom()
    )

    data class DingTalk(var webhook: String = "", var secret: String = "")

    data class Feishu(var webhook: String = "")

    data class WeCom(var webhook: String = "")

    data class Jwt(
        var secret: String = "",
        var accessTtlSeconds: Long = 7200,
        var refreshTtlSeconds: Long = 2592000
    )

    /** 文件存储：type = local 本地磁盘 / qiniu 七牛云对象存储 */
    data class Storage(
        var localDir: String = "./data/uploads",
        var type: String = "local",
        var qiniu: Qiniu = Qiniu()
    ) {
        /** 七牛云配置（AK/SK 与 eflink-backend 共用同一套凭据与桶，子目录独立） */
        data class Qiniu(
            var accessKey: String = "",
            var secretKey: String = "",
            /** 存储空间名称 */
            var bucket: String = "",
            /** CDN 加速域名（http:// 或 https:// 开头） */
            var domain: String = "",
            /** 存储区域：huadong / huabei / huanan / beimei / xinjiapo，其余自动探测 */
            var zone: String = "huanan",
            /** 空间是否为私有：true 时返回的 URL 由服务端签名 */
            var privateBucket: Boolean = false,
            /**
             * 私有空间签名 URL 有效期（秒）。wiki 的文件 URL 会嵌入页面正文长期使用，
             * 与缩略图场景不同，需要长有效期；默认 10 年
             */
            var privateUrlDeadlineSeconds: Long = 315360000,
            /** 对象 key 前缀（独立子目录）：本系统所有对象都落在该目录下，与其他系统隔离 */
            var keyPrefix: String = "wiki/"
        )
    }

    data class Branding(
        var productName: String = "易飞知识库",
        var logoUrl: String = "",
        var footer: String = ""
    )

    data class License(var publicKey: String = "")

    /** 账号来源：local 本地账号 / ldap 企业目录（OIDC 预留） */
    data class Auth(
        var mode: String = "local",
        var ldap: Ldap = Ldap(),
        @Deprecated("改用 connectors 注册表（connectors[\"eflink\"]），保留仅为兼容未迁移的旧配置")
        var eflink: Eflink = Eflink(),
        /** 外部系统关联登录注册表：key 为 provider 标识（user.provider），如 eflink、becbas */
        var connectors: MutableMap<String, Connector> = mutableMapOf()
    ) {
        /**
         * 按 provider 解析 connector 配置：注册表优先；
         * 未注册 eflink 键时回退 legacy auth.eflink 配置（旧部署零迁移继续可用）。
         */
        fun connector(provider: String): Connector? {
            connectors[provider]?.let { return it }
            if (provider == "eflink") {
                @Suppress("DEPRECATION")
                val legacy = eflink
                if (legacy.baseUrl.isNotBlank() || legacy.secret.isNotBlank() || legacy.redirectBase.isNotBlank()) {
                    return Connector(
                        enabled = legacy.enabled,
                        baseUrl = legacy.baseUrl,
                        secret = legacy.secret,
                        redirectBase = legacy.redirectBase,
                        label = "易飞办公账号登录"
                    )
                }
            }
            return null
        }

        /** 已启用且配置完整的 connector 列表（provider to 配置），公开配置/登录页按钮渲染用 */
        fun enabledConnectors(): List<Pair<String, Connector>> =
            (if (connectors.containsKey("eflink")) connectors else connectors + ("eflink" to (connector("eflink") ?: Connector())))
                .entries
                .filter { it.value.enabled && it.value.baseUrl.isNotBlank() && it.value.secret.isNotBlank() && it.value.redirectBase.isNotBlank() }
                .map { it.key to it.value }
                .sortedBy { it.first }
    }

    data class Ldap(
        var host: String = "127.0.0.1",
        var port: Int = 389,
        var useSsl: Boolean = false,
        var baseDn: String = "dc=example,dc=com",
        /** 用户绑定 DN 模板，{0} 为登录名 */
        var bindDnTemplate: String = "uid={0},ou=people,{baseDn}",
        var displayNameAttr: String = "cn",
        var emailAttr: String = "mail",
        var externalIdAttr: String = "entryUUID",
        /** 部门/组属性（如 memberOf），登录时逐人同步为用户组；配置为空则关闭同步 */
        var groupAttr: String = "memberOf"
    )

    /**
     * 外部系统关联登录（connector）配置：对方系统按协议提供「授权中转页」与「票据兑换接口」，
     * 以共享密钥鉴权，票据一次性、短期有效。user.provider 存注册表 key。
     * secret 属敏感凭据，开源分发时只保留环境变量占位符，真实值放部署配置。
     */
    data class Connector(
        var enabled: Boolean = false,
        /** 对方系统对外地址（含 https 协议），如 https://eflink.tech */
        var baseUrl: String = "",
        /** 与对方系统约定的共享密钥（服务端对服务端兑换票据时随请求提交） */
        var secret: String = "",
        /** 本 wiki 对外 Origin，须逐字加入对方系统的回跳白名单，如 https://wiki.becbas.com.cn */
        var redirectBase: String = "",
        /** 登录页按钮文案；空则登录页不展示该通道按钮 */
        var label: String = "",
        /** 登录页是否展示「账号登录」按钮（外部系统内自带入口直达的可关闭） */
        var loginButton: Boolean = true,
        /** 对方系统授权中转页路径（前端整页跳转），如 /connect/wiki */
        var authorizePath: String = "/connect/wiki",
        /** 对方系统票据兑换接口路径（服务端对服务端），如 /api/internal/connect/exchange */
        var exchangePath: String = "/api/internal/connect/exchange"
    )

    @Deprecated("改用 Connector（connectors 注册表），保留仅为兼容旧配置")
    data class Eflink(
        var enabled: Boolean = false,
        /** eflink 主站对外地址（含 https 协议），如 https://eflink.tech */
        var baseUrl: String = "",
        /** 与主站 connect.wiki-secret 对应的共享密钥 */
        var secret: String = "",
        /** 本 wiki 对外 Origin，须与主站 connect.allowed-redirects 白名单一致，如 https://wiki-demo.eflink.tech */
        var redirectBase: String = ""
    )

    /** 全文检索实现：mysql（默认，ngram）/ meilisearch */
    data class Search(
        var engine: String = "mysql",
        var meili: Meili = Meili()
    )

    data class Meili(
        var host: String = "http://127.0.0.1:7700",
        var index: String = "wiki",
        var apiKey: String = ""
    )

    /** 嵌入编辑器返回按钮：供业务系统集成时控制显示与跳转目标 */
    data class Embed(
        var backShow: Boolean = true,
        /** 空 = 返回知识库页面本身；配置为具体地址则返回业务系统指定页面 */
        var backHref: String = ""
    )

    /** 前后端分域部署时填写前端 Origin；空列表表示不启用 CORS（同域 nginx 反代） */
    data class Cors(var origins: List<String> = emptyList())
}

/** 匿名白名单（application.yml 的 wiki.router.whitelist） */
@ConfigurationProperties(prefix = "wiki.router")
data class RouteWhiteList(var whitelist: List<String> = emptyList())
