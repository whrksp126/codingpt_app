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
}
