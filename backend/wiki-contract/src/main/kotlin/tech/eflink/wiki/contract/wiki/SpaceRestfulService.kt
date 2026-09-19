package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody

@Tag(name = "知识库-空间", description = "空间的增删改查、成员管理与页面树")
interface SpaceRestfulService {

    @Operation(summary = "我的空间列表", description = "返回我创建的、我所在的、以及全站可见的空间；系统管理员返回全部空间")
    @GetMapping
    fun list(): Result<SpaceListResult>

    @Operation(summary = "创建空间", description = "创建者自动成为空间管理员")
    @PostMapping
    fun create(@RequestBody request: SpaceUpsertRequest): Result<SpaceResult>

    @Operation(summary = "空间详情")
    @GetMapping("/{id}")
    fun detail(@Parameter(description = "空间ID") @PathVariable id: Long): Result<SpaceResult>

    @Operation(summary = "更新空间", description = "仅空间管理员可操作；visibility: 0 私有 1 登录可读")
    @PutMapping("/{id}")
    fun update(
        @PathVariable id: Long,
        @RequestBody request: SpaceUpsertRequest
    ): Result<SpaceResult>

    @Operation(summary = "删除空间", description = "软删，仅空间管理员可操作")
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long): Result<EmptyResult>

    @Operation(summary = "页面树", description = "返回空间内全部未删除页面的整棵树（内存组树）")
    @GetMapping("/{id}/tree")
    fun tree(@PathVariable id: Long): Result<TreeResult>

    @Operation(summary = "数据统计", description = "页面数/成员数/浏览量/近30日浏览趋势/发布贡献/最近更新")
    @GetMapping("/{id}/stats")
    fun stats(@PathVariable id: Long): Result<tech.eflink.wiki.contract.wiki.SpaceStatsResult>

    @Operation(summary = "成员列表")
    @GetMapping("/{id}/members")
    fun members(@PathVariable id: Long): Result<MemberListResult>

    @Operation(summary = "添加成员", description = "仅空间管理员可操作；role: 1 admin 2 editor 3 viewer")
    @PostMapping("/{id}/members")
    fun addMember(
        @PathVariable id: Long,
        @RequestBody request: AddMemberRequest
    ): Result<MemberResult>

    @Operation(summary = "修改成员角色", description = "仅空间管理员可操作")
    @PutMapping("/{id}/members/{memberId}")
    fun updateMember(
        @PathVariable id: Long,
        @PathVariable memberId: Long,
        @RequestBody request: UpdateMemberRequest
    ): Result<MemberResult>

    @Operation(summary = "移除成员", description = "仅空间管理员可操作")
    @DeleteMapping("/{id}/members/{memberId}")
    fun removeMember(
        @PathVariable id: Long,
        @PathVariable memberId: Long
    ): Result<EmptyResult>
}
