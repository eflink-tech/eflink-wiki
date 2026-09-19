package tech.eflink.wiki.contract

enum class ErrorCodes(val value: Int) {

    NOT_ACCEPTABLE(406),
    PRECONDITION_FAILED(412),
    INTERNAL_SERVER_ERROR(500)

}
