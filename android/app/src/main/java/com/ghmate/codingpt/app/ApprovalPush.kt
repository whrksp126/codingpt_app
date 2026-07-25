package com.ghmate.codingpt.app

import android.os.Bundle
import org.json.JSONArray

// 승인 푸시(FCM) 페이로드 파서.
//
// 왜 RemoteMessage 를 안 쓰는가: firebase-messaging 은 @react-native-firebase/messaging 의
//  `implementation` 의존(그 모듈 build.gradle:143)이라 app 모듈 **컴파일 클래스패스에 없다**
//  (런타임엔 존재). RemoteMessage 를 쓰려면 app/build.gradle 에 firebase BOM + messaging 을
//  새로 선언해야 하므로, 의존성 추가 없이 FCM 이 브로드캐스트 extras 에 펼쳐 넣는 규약을 직접 읽는다:
//   · data 페이로드 키 = 그대로 top-level extras (google./gcm. 접두사는 예약)
//   · notification 페이로드 = "gcm.notification.title" / "gcm.notification.body" / "gcm.notification.tag"
//   · 메시지 식별자 = "google.message_id" (RNFB 의 getInitialNotification/onNewIntent 가 이 키로 조회)
//
// 서버 계약(docs/구현설계-2026-07-25/기능1-승인인박스.md §3.5)과 다르게 온 필드도 흡수하도록
//  키를 관용적으로 받는다 — 못 알아들으면 null 을 돌려 기존 경로(SDK 기본 배너)를 그대로 둔다.
data class ApprovalPush(
  val approvalId: String,
  val notifId: String?,
  val tag: String,
  val title: String,
  val body: String,
  val kind: String,               // "choice" | "permission"
  val options: List<String>,      // choice 일 때 선택지 라벨(순서 보존)
  val questionIndex: Int,
  val deadlineAt: Long,           // epoch ms, 0 = 없음
  val channelId: String?,         // 서버가 지정한 채널(없으면 기본 채널)
  val permissionSignal: Boolean,  // 서버가 [허용]/[거절] 을 명시했는지(data.actions / approvalKind)
) {
  val isChoice: Boolean get() = kind == "choice"

  // 버튼을 실제로 그릴 수 있는가. isChoice 는 명시 신호로만 켜지므로 그 자체가 신호다
  //  (선택지가 3개 이상이면 [답하기] 폴백 — 라벨이 잘려 오답을 낼 위험을 피한다).
  //  ★ 신호가 전혀 없으면 **덮어쓰지 않고 SDK 기본 배너를 그대로 둔다** —
  //    잘못된 결정(선택형에 allow/deny)을 보내는 것보다 버튼 없는 배너가 안전하다.
  val actionable: Boolean get() = isChoice || permissionSignal

  companion object {
    // 승인 푸시 판별 키 — 서버가 type / kind 어느 쪽으로 보내도 받는다.
    private val APPROVAL_MARKERS = setOf("approval", "approval_request")

    fun parse(extras: Bundle?): ApprovalPush? {
      if (extras == null) return null
      val marker = (str(extras, "type") ?: str(extras, "kind") ?: "").lowercase()
      if (marker !in APPROVAL_MARKERS) return null

      val approvalId = str(extras, "approvalId") ?: str(extras, "approval_id") ?: str(extras, "id") ?: return null
      val notifId = str(extras, "notifId") ?: str(extras, "notif_id")

      // tag 는 크로스기기 dismiss 규약(cptnotif-<notifId>)을 반드시 유지해야 한다
      //  — NotifTrayModule.cancelByNotifIds 가 이 태그만 회수한다.
      val tag = str(extras, "gcm.notification.tag")
        ?: notifId?.let { "cptnotif-$it" }
        ?: "cptapr-$approvalId"

      val tool = str(extras, "tool")
      val summary = str(extras, "summary")
      val title = str(extras, "gcm.notification.title") ?: str(extras, "title") ?: "승인 필요"
      val body = str(extras, "gcm.notification.body")
        ?: str(extras, "body")
        ?: listOfNotNull(tool, summary).joinToString(" · ").ifEmpty { "코딩PT 에서 승인을 기다리고 있어요" }

      // 승인 종류 판정. 정본 신호 2개:
      //  · data.approvalKind = "choice" | "permission"  (있으면 최우선)
      //  · data.actions      = "CPT_ALLOW,CPT_DENY"     (approvalService.buildPush 가 이미 보내는 힌트)
      val explicit = (str(extras, "approvalKind") ?: str(extras, "promptKind") ?: "").lowercase()
      val actions = (str(extras, "actions") ?: "").split(',').map { it.trim().uppercase() }
      val kind = when {
        explicit == "choice" -> "choice"
        explicit == "permission" -> "permission"
        "CPT_ANSWER" in actions || "CPT_CHOICE" in actions -> "choice"
        else -> "permission"
      }
      val permissionSignal = explicit == "permission" || "CPT_ALLOW" in actions

      return ApprovalPush(
        approvalId = approvalId,
        notifId = notifId,
        tag = tag,
        title = title,
        body = body,
        kind = kind,
        options = parseOptions(str(extras, "options")),
        questionIndex = str(extras, "questionIndex")?.toIntOrNull() ?: 0,
        deadlineAt = str(extras, "deadlineAt")?.toLongOrNull() ?: 0L,
        channelId = str(extras, "channelId"),
        permissionSignal = permissionSignal,
      )
    }

    // FCM 와이어에서 data/notification 값은 항상 문자열이므로 getString 으로 충분하다
    //  (타입 불일치여도 Bundle.getString 은 예외 없이 null 을 돌려준다).
    private fun str(b: Bundle, key: String): String? {
      val s = b.getString(key)?.trim() ?: return null
      return if (s.isEmpty() || s == "null") null else s
    }

    // 선택지 라벨: JSON 배열 우선(["예","아니오"] 또는 [{"label":"예"}]), 실패 시 CSV 폴백
    //  (기존 dismiss 푸시가 ids CSV 규약이라 서버가 CSV 로 보낼 여지가 있다).
    private fun parseOptions(raw: String?): List<String> {
      if (raw.isNullOrEmpty()) return emptyList()
      val out = ArrayList<String>()
      if (raw.trimStart().startsWith("[")) {
        try {
          val arr = JSONArray(raw)
          for (i in 0 until arr.length()) {
            val label = when (val item = arr.opt(i)) {
              is org.json.JSONObject -> item.optString("label").ifEmpty { item.optString("text") }
              else -> item?.toString() ?: ""
            }
            if (label.isNotBlank()) out.add(label.trim())
          }
          return out
        } catch (_: Exception) { /* CSV 폴백 */ }
      }
      raw.split(',').forEach { if (it.isNotBlank()) out.add(it.trim()) }
      return out
    }
  }
}
