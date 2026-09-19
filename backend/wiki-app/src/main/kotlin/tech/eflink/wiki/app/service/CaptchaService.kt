package tech.eflink.wiki.app.service

import cn.hutool.captcha.CaptchaUtil
import cn.hutool.captcha.LineCaptcha
import com.github.benmanes.caffeine.cache.Cache
import com.github.benmanes.caffeine.cache.Caffeine
import org.springframework.stereotype.Service
import tech.eflink.wiki.core.exception.ValidateException
import java.util.UUID
import java.util.concurrent.TimeUnit

/** 图形验证码：进程内缓存 captchaId → 答案，5 分钟有效、验证即焚 */
@Service
class CaptchaService {

    private val store: Cache<String, String> = Caffeine.newBuilder()
        .expireAfterWrite(5, TimeUnit.MINUTES)
        .maximumSize(10_000)
        .build()

    fun create(): Pair<String, String> {
        val captcha: LineCaptcha = CaptchaUtil.createLineCaptcha(120, 40, 4, 18)
        val id = UUID.randomUUID().toString().replace("-", "")
        store.put(id, captcha.code.lowercase())
        return id to captcha.imageBase64Data   // data:image/png;base64,...
    }

    /** 校验并销毁（一次性）；开启验证码开关时登录必须通过 */
    fun verify(captchaId: String?, captchaCode: String?) {
        if (captchaId.isNullOrBlank() || captchaCode.isNullOrBlank()) {
            throw ValidateException(406, "请输入图形验证码")
        }
        val expected = store.getIfPresent(captchaId) ?: throw ValidateException(406, "验证码已过期，请刷新后重试")
        store.invalidate(captchaId)
        if (expected != captchaCode.trim().lowercase()) {
            throw ValidateException(406, "验证码不正确")
        }
    }
}
