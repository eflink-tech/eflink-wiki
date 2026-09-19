package tech.eflink.wiki.app.service

import io.jsonwebtoken.Claims
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.stereotype.Service
import tech.eflink.wiki.app.config.WikiProperties
import java.nio.charset.StandardCharsets
import java.util.Date
import javax.crypto.SecretKey

/** 无状态 JWT：access token 签发与校验（吊销依赖 refreshToken 表，登出即吊销） */
@Service
class JwtService(props: WikiProperties) {

    private val key: SecretKey = Keys.hmacShaKeyFor(props.jwt.secret.toByteArray(StandardCharsets.UTF_8))
    private val accessTtlMs = props.jwt.accessTtlSeconds * 1000

    fun generateAccessToken(userId: Long, username: String, role: Int): String =
        Jwts.builder()
            .subject(userId.toString())
            .claim("username", username)
            .claim("role", role)
            .issuedAt(Date())
            .expiration(Date(System.currentTimeMillis() + accessTtlMs))
            .signWith(key)
            .compact()

    /** 校验并解析；失败（过期/签名不符）抛 JwtException */
    fun parse(token: String): Claims =
        Jwts.parser().verifyWith(key).build().parseSignedClaims(token).payload
}
