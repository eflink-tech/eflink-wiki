package tech.eflink.wiki.app.impl.wiki.restful

import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tech.eflink.wiki.app.impl.wiki.handler.AddMemberCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.CreateSpaceCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.DeleteSpaceCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetSpaceCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.GetSpaceTreeCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListMembersCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.ListSpacesCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.RemoveMemberCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.UpdateMemberCommandHandler
import tech.eflink.wiki.app.impl.wiki.handler.UpdateSpaceCommandHandler
import tech.eflink.wiki.contract.wiki.AddMemberCommand
import tech.eflink.wiki.contract.wiki.AddMemberRequest
import tech.eflink.wiki.contract.wiki.CreateSpaceCommand
import tech.eflink.wiki.contract.wiki.DeleteSpaceCommand
import tech.eflink.wiki.contract.wiki.GetSpaceCommand
import tech.eflink.wiki.contract.wiki.GetSpaceTreeCommand
import tech.eflink.wiki.contract.wiki.ListMembersCommand
import tech.eflink.wiki.contract.wiki.ListSpacesCommand
import tech.eflink.wiki.contract.wiki.MemberListResult
import tech.eflink.wiki.contract.wiki.MemberResult
import tech.eflink.wiki.contract.wiki.RemoveMemberCommand
import tech.eflink.wiki.contract.wiki.SpaceListResult
import tech.eflink.wiki.contract.wiki.SpaceRestfulService
import tech.eflink.wiki.contract.wiki.SpaceResult
import tech.eflink.wiki.contract.wiki.SpaceUpsertRequest
import tech.eflink.wiki.contract.wiki.TreeResult
import tech.eflink.wiki.contract.wiki.UpdateMemberCommand
import tech.eflink.wiki.contract.wiki.UpdateMemberRequest
import tech.eflink.wiki.contract.wiki.UpdateSpaceCommand
import tech.eflink.wiki.core.communication.EmptyResult
import tech.eflink.wiki.core.dto.Result

@RestController
@RequestMapping("/api/wiki/spaces")
class SpaceRestfulServiceImpl : SpaceRestfulService {

    override fun list(): Result<SpaceListResult> = ListSpacesCommand().executeWithResult()

    override fun create(@RequestBody request: SpaceUpsertRequest): Result<SpaceResult> =
        CreateSpaceCommand(request).executeWithResult()

    override fun detail(@PathVariable id: Long): Result<SpaceResult> =
        GetSpaceCommand(id).executeWithResult()

    override fun update(@PathVariable id: Long, @RequestBody request: SpaceUpsertRequest): Result<SpaceResult> =
        UpdateSpaceCommand(id, request).executeWithResult()

    override fun delete(@PathVariable id: Long): Result<EmptyResult> =
        DeleteSpaceCommand(id).executeWithResult()

    override fun tree(@PathVariable id: Long): Result<TreeResult> =
        GetSpaceTreeCommand(id).executeWithResult()

    override fun stats(@PathVariable id: Long): Result<tech.eflink.wiki.contract.wiki.SpaceStatsResult> =
        tech.eflink.wiki.contract.wiki.GetSpaceStatsCommand(id).executeWithResult()

    override fun members(@PathVariable id: Long): Result<MemberListResult> =
        ListMembersCommand(id).executeWithResult()

    override fun addMember(@PathVariable id: Long, @RequestBody request: AddMemberRequest): Result<MemberResult> =
        AddMemberCommand(id, request).executeWithResult()

    override fun updateMember(
        @PathVariable id: Long,
        @PathVariable memberId: Long,
        @RequestBody request: UpdateMemberRequest
    ): Result<MemberResult> = UpdateMemberCommand(id, memberId, request).executeWithResult()

    override fun removeMember(@PathVariable id: Long, @PathVariable memberId: Long): Result<EmptyResult> =
        RemoveMemberCommand(id, memberId).executeWithResult()
}
