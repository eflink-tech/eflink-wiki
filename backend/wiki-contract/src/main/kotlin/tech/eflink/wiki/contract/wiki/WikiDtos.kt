package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.communication.DataTransferObjectBase
import io.swagger.v3.oas.annotations.media.Schema

/** 空间 */
@Schema(description = "知识库空间")
class SpaceResult : DataTransferObjectBase() {
    var id: Long = 0
    var name: String = ""
    var icon: String? = null
    var description: String? = null
    var visibility: Int = 0        // 0 私有 1 登录可读
    var ownerId: Long = 0
    var ownerName: String? = null
    var myRole: Int = 0            // 当前用户在空间内的角色：1 admin 2 editor 3 viewer；0 = 非成员
    var memberCount: Long = 0
    var createdAt: Long? = null
    var updatedAt: Long? = null
}

/** 页面树节点（递归结构） */
@Schema(description = "页面树节点")
class TreeNodeResult : DataTransferObjectBase() {
    var id: Long = 0
    var parentId: Long = 0
    var title: String = ""
    var sort: Int = 0
    var currentVersionId: Long? = null   // null = 从未发布
    var updatedAt: Long? = null
    var children: MutableList<TreeNodeResult> = mutableListOf()
}

/** 页面树 */
@Schema(description = "空间页面树")
class TreeResult : DataTransferObjectBase() {
    var spaceId: Long = 0
    var nodes: MutableList<TreeNodeResult> = mutableListOf()
}

/** 页面节点（扁平） */
@Schema(description = "页面节点")
class NodeResult : DataTransferObjectBase() {
    var id: Long = 0
    var spaceId: Long = 0
    var parentId: Long = 0
    var title: String = ""
    var sort: Int = 0
    var updatedAt: Long? = null
}

/** 已发布页面内容 */
@Schema(description = "已发布页面内容")
class PageResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var title: String = ""
    var content: String? = null          // ProseMirror JSON 字符串；null = 尚未发布
    var versionNo: Int? = null
    var publishedAt: Long? = null
    var publishedByName: String? = null
    var viewCount: Long = 0
    var favorited: Boolean = false
    var editingUsers: MutableList<String> = mutableListOf()   // 正在编辑的其他用户（presence 软锁）
}

/** 草稿 */
@Schema(description = "页面草稿（按人隔离）")
class DraftResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var content: String? = null
    var baseVersionId: Long? = null
    var updatedAt: Long? = null
    var currentVersionNo: Int? = null    // 当前已发布版本号；null = 从未发布
}

class DraftSaveResult : DataTransferObjectBase() {
    var updatedAt: Long = 0
}

/** 版本项 */
@Schema(description = "发布版本")
class VersionItemResult : DataTransferObjectBase() {
    var versionNo: Int = 0
    var title: String = ""
    var publishedByName: String? = null
    var publishedAt: Long? = null
}

class VersionListResult : DataTransferObjectBase() {
    var list: MutableList<VersionItemResult> = mutableListOf()
}

/** 版本详情（含正文） */
@Schema(description = "版本详情")
class VersionResult : DataTransferObjectBase() {
    var versionNo: Int = 0
    var title: String = ""
    var content: String? = null
    var publishedByName: String? = null
    var publishedAt: Long? = null
}

class PublishResult : DataTransferObjectBase() {
    var versionNo: Int = 0
}

/** 空间成员 */
@Schema(description = "空间成员")
class MemberResult : DataTransferObjectBase() {
    var id: Long = 0
    var userId: Long = 0
    var username: String = ""
    var displayName: String = ""
    var avatar: String? = null
    var role: Int = 3               // 1 admin 2 editor 3 viewer
}

class MemberListResult : DataTransferObjectBase() {
    var list: MutableList<MemberResult> = mutableListOf()
}

/** 回收站页面项 */
@Schema(description = "回收站页面")
class TrashNodeResult : DataTransferObjectBase() {
    var id: Long = 0
    var parentId: Long = 0
    var title: String = ""
    var deletedAt: Long? = null
}

class TrashListResult : DataTransferObjectBase() {
    var list: MutableList<TrashNodeResult> = mutableListOf()
}

/** 我的收藏项 */
@Schema(description = "收藏项")
class FavoriteResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var spaceId: Long = 0
    var title: String = ""
    var createdAt: Long? = null
}

class FavoriteListResult : DataTransferObjectBase() {
    var list: MutableList<FavoriteResult> = mutableListOf()
}

class FavoriteToggleResult : DataTransferObjectBase() {
    var favorited: Boolean = false
}

/** 最近打开项 */
@Schema(description = "最近打开项")
class RecentOpenResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var spaceId: Long = 0
    var title: String = ""
    var spaceName: String = ""
    var openedAt: Long? = null
}

class RecentOpenListResult : DataTransferObjectBase() {
    var list: MutableList<RecentOpenResult> = mutableListOf()
}

/** 搜索结果项 */
@Schema(description = "搜索结果")
class SearchItemResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var spaceId: Long = 0
    var spaceName: String = ""
    var title: String = ""
    var versionNo: Int? = null
    var updatedAt: Long? = null
}

class SearchListResult : DataTransferObjectBase() {
    var list: MutableList<SearchItemResult> = mutableListOf()
}

/** 我的草稿项（跨空间） */
@Schema(description = "我的草稿")
class DraftItemResult : DataTransferObjectBase() {
    var nodeId: Long = 0
    var spaceId: Long = 0
    var spaceName: String = ""
    var title: String = ""
    var updatedAt: Long? = null
}

class DraftItemListResult : DataTransferObjectBase() {
    var list: MutableList<DraftItemResult> = mutableListOf()
}

/** 上传结果 */
@Schema(description = "上传结果")
class UploadResult : DataTransferObjectBase() {
    var url: String = ""
}
