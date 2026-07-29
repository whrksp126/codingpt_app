package com.ghmate.codingpt.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

// 알림 액션(승인 [허용]/[거절]/선택지)의 **영속 큐** + 선택형 라벨 레지스트리.
//
// 왜 영속인가: 액션은 앱이 종료된 상태에서도 눌린다. 그때 프로세스가 전송 전에 죽으면 결정이 사라진다
//  → 디스크에 먼저 적재하고(commit = 동기 쓰기), 전송 성공/확정실패 때만 ack(삭제)한다.
//  전송은 JS(src/services/approvalActionQueue.ts)가 담당 — 토큰/401 refresh 회전을 재사용하기 위해
//  네이티브에 토큰 사본을 두지 않는다(iOS 와 동일한 계약: NativeModules.CptApproval).
//
// 선택형 라벨: 승인 푸시(data)에는 선택지 라벨이 없다. JS 가 approval_event(pending) 를 받는 순간
//  registerChoiceCategory 로 라벨을 미리 넣어두고(iOS 카테고리 등록과 같은 타이밍), 푸시가 도착하면
//  여기서 꺼내 버튼 라벨로 쓴다.
object ApprovalActionStore {
  private const val PREFS = "cpt_approval"
  private const val KEY_QUEUE = "pending_actions"
  private const val KEY_LABELS = "choice_labels"
  private const val MAX_QUEUE = 32
  private const val MAX_LABELS = 16

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun readArray(context: Context, key: String): JSONArray =
    try { JSONArray(prefs(context).getString(key, "[]") ?: "[]") } catch (_: Exception) { JSONArray() }

  private fun readObject(context: Context, key: String): JSONObject =
    try { JSONObject(prefs(context).getString(key, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }

  // ── 액션 큐 ───────────────────────────────────────────────────────────────

  /** 액션 적재. 같은 승인이 이미 큐에 있으면 무시(첫 탭이 승자 — 이중 응답 방지). */
  @Synchronized
  fun enqueue(
    context: Context,
    approvalId: String,
    decision: String,
    labels: List<String>,
    questionIndex: Int,
    notifId: String?,
    always: Boolean = false, // "허용하고 다음부터 묻지 않기" — 플래그만(규칙은 데몬 보관분 그대로)
  ) {
    val arr = readArray(context, KEY_QUEUE)
    for (i in 0 until arr.length()) {
      if (arr.optJSONObject(i)?.optString("approvalId") == approvalId) return
    }
    val item = JSONObject().apply {
      put("uid", UUID.randomUUID().toString())
      put("approvalId", approvalId)
      put("decision", decision)
      if (always) put("always", true)
      put("labels", JSONArray(labels))
      put("questionIndex", questionIndex)
      if (notifId != null) put("notifId", notifId)
      put("at", System.currentTimeMillis())
    }
    arr.put(item)
    // 상한 초과분은 가장 오래된 것부터 버린다(마감이 지난 승인은 어차피 410/404).
    while (arr.length() > MAX_QUEUE) arr.remove(0)
    prefs(context).edit().putString(KEY_QUEUE, arr.toString()).commit() // 즉시 디스크(프로세스 급사 대비)
  }

  @Synchronized
  fun pending(context: Context): JSONArray = readArray(context, KEY_QUEUE)

  @Synchronized
  fun ack(context: Context, uids: Set<String>) {
    if (uids.isEmpty()) return
    val src = readArray(context, KEY_QUEUE)
    val out = JSONArray()
    for (i in 0 until src.length()) {
      val o = src.optJSONObject(i) ?: continue
      if (o.optString("uid") !in uids) out.put(o)
    }
    prefs(context).edit().putString(KEY_QUEUE, out.toString()).commit()
  }

  // ── 선택형 라벨 ───────────────────────────────────────────────────────────

  @Synchronized
  fun putChoiceLabels(context: Context, approvalId: String, labels: List<String>) {
    if (approvalId.isEmpty() || labels.isEmpty()) return
    val obj = readObject(context, KEY_LABELS)
    obj.put(approvalId, JSONArray(labels))
    // 상한 — 오래된 키부터 정리(순서는 JSONObject 삽입 순서에 의존하므로 best-effort).
    while (obj.length() > MAX_LABELS) {
      val it = obj.keys()
      if (!it.hasNext()) break
      obj.remove(it.next())
    }
    prefs(context).edit().putString(KEY_LABELS, obj.toString()).commit()
  }

  @Synchronized
  fun choiceLabels(context: Context, approvalId: String): List<String>? {
    val arr = readObject(context, KEY_LABELS).optJSONArray(approvalId) ?: return null
    val out = ArrayList<String>(arr.length())
    for (i in 0 until arr.length()) {
      val s = arr.optString(i)?.trim()
      if (!s.isNullOrEmpty()) out.add(s)
    }
    return if (out.isEmpty()) null else out
  }

  @Synchronized
  fun dropChoiceLabels(context: Context, approvalIds: List<String>) {
    if (approvalIds.isEmpty()) return
    val obj = readObject(context, KEY_LABELS)
    var changed = false
    for (id in approvalIds) if (obj.has(id)) { obj.remove(id); changed = true }
    if (changed) prefs(context).edit().putString(KEY_LABELS, obj.toString()).commit()
  }
}
