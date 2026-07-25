package com.ghmate.codingpt.app

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import org.json.JSONArray

// 승인 알림 액션 브리지(Android) — iOS CptApproval.swift 와 **같은 JS 계약**을 구현한다.
//  소비자: src/services/approvalActionQueue.ts (pendingActions / ackActions /
//         registerChoiceCategory / dropChoiceCategories).
//
// 역할 분담: 네이티브는 액션을 영속 큐에 적재만 하고, HTTPS 전송은 JS 가 한다
//  (accessToken 15분 TTL + refresh 회전 로직을 JS 에만 두어 토큰 사본을 만들지 않는다).
//  Android 는 앱이 죽어 있을 때 JS 를 깨울 수단이 필요해서 알림 액션 → ApprovalResponseService
//  (헤드리스 JS) → 이 큐 드레인 순서로 흐른다. 이벤트 emit 은 하지 않는다
//  (NativeEventEmitter 는 iOS 전용 경로 — Android 는 헤드리스 태스크가 곧바로 드레인한다).
class CptApprovalModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "CptApproval"

  @ReactMethod
  fun pendingActions(promise: Promise) {
    try {
      promise.resolve(toWritable(ApprovalActionStore.pending(reactApplicationContext)))
    } catch (e: Exception) {
      promise.reject("CPT_APPROVAL_QUEUE", e)
    }
  }

  @ReactMethod
  fun ackActions(uids: ReadableArray?) {
    val set = HashSet<String>()
    if (uids != null) for (i in 0 until uids.size()) uids.getString(i)?.let { if (it.isNotEmpty()) set.add(it) }
    ApprovalActionStore.ack(reactApplicationContext, set)
  }

  // 선택형 승인의 라벨 사전 등록 — 푸시 data 에는 선택지가 없으므로, JS 가 approval_event(pending) 를
  //  받은 시점에 넣어둔 라벨로 알림 버튼을 그린다(2개 초과는 JS 가 애초에 호출하지 않는다).
  @ReactMethod
  fun registerChoiceCategory(approvalId: String?, labels: ReadableArray?) {
    if (approvalId.isNullOrEmpty() || labels == null) return
    val out = ArrayList<String>(labels.size())
    for (i in 0 until labels.size()) labels.getString(i)?.let { if (it.isNotBlank()) out.add(it) }
    ApprovalActionStore.putChoiceLabels(reactApplicationContext, approvalId, out)
  }

  @ReactMethod
  fun dropChoiceCategories(approvalIds: ReadableArray?) {
    if (approvalIds == null) return
    val out = ArrayList<String>(approvalIds.size())
    for (i in 0 until approvalIds.size()) approvalIds.getString(i)?.let { if (it.isNotEmpty()) out.add(it) }
    ApprovalActionStore.dropChoiceLabels(reactApplicationContext, out)
  }

  // NativeEventEmitter(iOS 경로) 호환용 no-op — Android 에선 호출되지 않지만 계약을 맞춘다.
  @ReactMethod fun addListener(eventName: String?) { /* noop */ }
  @ReactMethod fun removeListeners(count: Double) { /* noop */ }

  private fun toWritable(arr: JSONArray): WritableArray {
    val out = Arguments.createArray()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val m = Arguments.createMap()
      m.putString("uid", o.optString("uid"))
      m.putString("approvalId", o.optString("approvalId"))
      m.putString("decision", o.optString("decision"))
      m.putInt("questionIndex", o.optInt("questionIndex", 0))
      m.putDouble("at", o.optLong("at", 0L).toDouble())
      if (o.has("notifId")) m.putString("notifId", o.optString("notifId"))
      val labels = Arguments.createArray()
      o.optJSONArray("labels")?.let { la -> for (j in 0 until la.length()) labels.pushString(la.optString(j)) }
      m.putArray("labels", labels)
      out.pushMap(m)
    }
    return out
  }
}
