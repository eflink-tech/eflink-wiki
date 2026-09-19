package tech.eflink.wiki.app.service

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Service

/** BCrypt 密码散列（预留 AuthProvider SPI 时保持该实现为本地账号默认档） */
@Service
class PasswordService {

    private val encoder = BCryptPasswordEncoder()

    fun encode(rawPassword: String): String = encoder.encode(rawPassword)

    fun matches(rawPassword: String, passwordHash: String): Boolean = encoder.matches(rawPassword, passwordHash)
}
