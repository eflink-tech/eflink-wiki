package tech.eflink.wiki.contract.wiki

import tech.eflink.wiki.core.communication.CommandObjectBase
import tech.eflink.wiki.core.communication.DataTransferObjectBase
import io.swagger.v3.oas.annotations.media.Schema

/** 空间数据统计 */
@Schema(description = "空间数据统计")
class SpaceStatsResult : DataTransferObjectBase() {
    var nodeCount: Long = 0
    var memberCount: Long = 0
    var totalViews: Long = 0
    var versionCount: Long = 0
    var dailyViews: MutableList<DailyView> = mutableListOf()
    var contributors: MutableList<Contributor> = mutableListOf()
    var recentNodes: MutableList<RecentNode> = mutableListOf()
}

class DailyView : DataTransferObjectBase() {
    var date: String = ""      // yyyy-MM-dd
    var views: Long = 0
}

class Contributor : DataTransferObjectBase() {
    var userId: Long = 0
    var displayName: String = ""
    var publishes: Long = 0
    var views: Long = 0
}

class RecentNode : DataTransferObjectBase() {
    var id: Long = 0
    var title: String = ""
    var updatedAt: Long? = null
}

class GetSpaceStatsCommand(val spaceId: Long) : CommandObjectBase<SpaceStatsResult>()
