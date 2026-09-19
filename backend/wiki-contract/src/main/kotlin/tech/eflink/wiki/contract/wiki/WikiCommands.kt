package tech.eflink.wiki.contract.wiki

import org.springframework.web.multipart.MultipartFile
import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.EmptyResult

// ---------- 空间 ----------

/** 空间创建/更新请求 */
data class SpaceUpsertRequest(
    val name: String = "",
    val icon: String? = null,
    val description: String? = null,
    val visibility: Int? = null
)

class ListSpacesCommand : CommandObjectBase<SpaceListResult>()

class SpaceListResult : tech.eflink.wiki.core.communication.DataTransferObjectBase() {
    var list: MutableList<SpaceResult> = mutableListOf()
}

class CreateSpaceCommand(val request: SpaceUpsertRequest) : CommandObjectBase<SpaceResult>()

class GetSpaceCommand(val id: Long) : CommandObjectBase<SpaceResult>()

class UpdateSpaceCommand(val id: Long, val request: SpaceUpsertRequest) : CommandObjectBase<SpaceResult>()

class DeleteSpaceCommand(val id: Long) : CommandObjectBase<EmptyResult>()

class GetSpaceTreeCommand(val spaceId: Long) : CommandObjectBase<TreeResult>()

// ---------- 空间成员 ----------

class ListMembersCommand(val spaceId: Long) : CommandObjectBase<MemberListResult>()

data class AddMemberRequest(val userId: Long = 0, val role: Int = 3)

class AddMemberCommand(val spaceId: Long, val request: AddMemberRequest) : CommandObjectBase<MemberResult>()

data class UpdateMemberRequest(val role: Int)

class UpdateMemberCommand(val spaceId: Long, val memberId: Long, val request: UpdateMemberRequest) :
    CommandObjectBase<MemberResult>()

class RemoveMemberCommand(val spaceId: Long, val memberId: Long) : CommandObjectBase<EmptyResult>()

// ---------- 页面节点 ----------

data class CreateNodeRequest(
    val spaceId: Long = 0,
    val parentId: Long = 0,
    val title: String = "",
    val templateId: Long? = null   // 从模板建页：模板正文作为创建者草稿初始内容
)

class CreateNodeCommand(val request: CreateNodeRequest) : CommandObjectBase<NodeResult>()

data class UpdateNodeRequest(
    val title: String? = null,
    val parentId: Long? = null,
    val sort: Int? = null
)

class UpdateNodeCommand(val id: Long, val request: UpdateNodeRequest) : CommandObjectBase<NodeResult>()

class DeleteNodeCommand(val id: Long, val purge: Boolean = false) : CommandObjectBase<EmptyResult>()

class RestoreNodeCommand(val id: Long) : CommandObjectBase<EmptyResult>()

class GetPageCommand(val nodeId: Long) : CommandObjectBase<PageResult>()

class GetDraftCommand(val nodeId: Long) : CommandObjectBase<DraftResult>()

data class SaveDraftRequest(val content: String = "", val baseVersionId: Long? = null)

class SaveDraftCommand(val nodeId: Long, val request: SaveDraftRequest) : CommandObjectBase<DraftSaveResult>()

data class PublishRequest(val title: String? = null)

class PublishNodeCommand(val nodeId: Long, val request: PublishRequest) : CommandObjectBase<PublishResult>()

class ListVersionsCommand(val nodeId: Long) : CommandObjectBase<VersionListResult>()

class GetVersionCommand(val nodeId: Long, val versionNo: Int) : CommandObjectBase<VersionResult>()

class ListTrashCommand(val spaceId: Long) : CommandObjectBase<TrashListResult>()

// ---------- 收藏 / 搜索 / 草稿箱 / 上传 / 最近打开 ----------

class ListFavoritesCommand : CommandObjectBase<FavoriteListResult>()

class ToggleFavoriteCommand(val nodeId: Long) : CommandObjectBase<FavoriteToggleResult>()

class SearchCommand(val keyword: String, val spaceId: Long? = null) : CommandObjectBase<SearchListResult>()

class ListMyDraftsCommand : CommandObjectBase<DraftItemListResult>()

class UploadFileCommand(val file: MultipartFile) : CommandObjectBase<UploadResult>()

/** 版本回滚：把版本快照写入我的草稿 */
class RestoreVersionCommand(val nodeId: Long, val versionNo: Int) : CommandObjectBase<DraftResult>()

/** 放弃我的草稿 */
class DeleteDraftCommand(val nodeId: Long) : CommandObjectBase<EmptyResult>()

// ---------- 最近打开 ----------

/** 记录页面打开（存在则刷新时间） */
class RecordRecentOpenCommand(val nodeId: Long) : CommandObjectBase<EmptyResult>()

/** 我的最近打开页面列表 */
class ListRecentOpensCommand : CommandObjectBase<RecentOpenListResult>()
