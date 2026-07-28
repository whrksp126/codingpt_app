package com.ghmate.codingpt.app

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

// 크로스기기 dismiss — 다른 기기(PC)에서 읽음 처리된 알림의 트레이 배너를 회수한다.
//  FCM SDK 는 서버가 android.notification.tag 로 지정한 태그(cptnotif-<id>)와 id=0 으로 표시하므로
//  cancel(tag, 0) 이 정확히 그 배너만 지운다. 태그 없던 구버전 발송분 대비로 activeNotifications
//  스윕(태그 매칭)도 함께 수행. RN Firebase 데이터 메시지 핸들러(JS)에서 호출된다.
class NotifTrayModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "NotifTray"

  @ReactMethod
  fun cancelByNotifIds(ids: ReadableArray) {
    val manager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    val tags = HashSet<String>()
    for (i in 0 until ids.size()) {
      val id = ids.getString(i) ?: continue
      if (id.isNotEmpty()) tags.add("cptnotif-$id")
    }
    if (tags.isEmpty()) return
    for (tag in tags) {
      try { manager.cancel(tag, 0) } catch (_: Exception) { /* noop */ }
    }
    // 안전망: FCM SDK 가 다른 id 로 표시한 경우까지 태그 매칭으로 스윕(M23+).
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      try {
        for (sbn in manager.activeNotifications) {
          if (sbn.tag != null && tags.contains(sbn.tag)) manager.cancel(sbn.tag, sbn.id)
        }
      } catch (_: Exception) { /* noop */ }
    }
  }

  // 유령 배너 청소 — dismiss 데이터푸시를 놓친(앱 재설치/오프라인/데몬 급사) 배너를 인박스 대조로 회수.
  //  keepIds = 서버 인박스의 **미읽음** 알림 id 목록. 우리 네임스페이스(cptnotif-*)만 건드린다 —
  //  다른 태그(FCM 기본/포그라운드 서비스 등)는 불가침. 앱 포그라운드 인박스 로드 직후 호출된다.
  @ReactMethod
  fun reconcile(keepIds: ReadableArray) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val manager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    val keep = HashSet<String>()
    for (i in 0 until keepIds.size()) {
      val id = keepIds.getString(i) ?: continue
      if (id.isNotEmpty()) keep.add("cptnotif-$id")
    }
    try {
      val now = System.currentTimeMillis()
      var swept = 0
      for (sbn in manager.activeNotifications) {
        val tag = sbn.tag ?: continue
        if (!tag.startsWith("cptnotif-")) continue
        // 인박스 조회와 배너 도착의 경합 가드 — 방금(15s 내) 뜬 배너는 목록에 아직 없을 수 있다.
        if (now - sbn.postTime < 15_000) continue
        if (!keep.contains(tag)) { manager.cancel(tag, sbn.id); swept++ }
      }
      android.util.Log.d("NotifTray", "reconcile keep=${keep.size} swept=$swept active=${manager.activeNotifications.size}")
    } catch (e: Exception) { android.util.Log.d("NotifTray", "reconcile err=${e.message}") }
  }
}
