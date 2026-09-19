package tech.eflink.wiki.app.service.storage

import org.springframework.web.multipart.MultipartFile

/** 文件存储 SPI：本地磁盘 / 七牛云等实现可插拔替换（wiki.storage.type 切换） */
interface StorageService {

    /** 保存上传文件，返回可直接访问的 URL */
    fun save(file: MultipartFile): String
}
