package tech.eflink.wiki.app.service.storage

import org.springframework.web.multipart.MultipartFile
import tech.eflink.wiki.app.config.WikiProperties
import java.io.File
import java.time.LocalDate
import java.util.UUID

/** 本地磁盘存储（wiki.storage.type=local 时启用），URL 形如 /uploads/yyyy/MM/uuid.ext */
class LocalStorageService(props: WikiProperties) : StorageService {

    private val baseDir: File = File(props.storage.localDir).absoluteFile

    override fun save(file: MultipartFile): String {
        val ext = file.originalFilename?.substringAfterLast('.', "")?.lowercase().orEmpty()
        val today = LocalDate.now()
        val relative = "%04d/%02d".format(today.year, today.monthValue)
        val folder = File(baseDir, relative)
        if (!folder.exists()) folder.mkdirs()
        val name = "${UUID.randomUUID()}.$ext"
        file.transferTo(File(folder, name))
        return "/uploads/$relative/$name"
    }
}
