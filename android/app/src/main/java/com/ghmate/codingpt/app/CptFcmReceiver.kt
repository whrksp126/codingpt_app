package com.ghmate.codingpt.app

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Process
import android.util.Log

// 승인 푸시를 가로채 **액션 버튼이 달린 알림으로 승격**시키는 리시버.
//
// 왜 서비스(ReactNativeFirebaseMessagingService 상속)가 아니라 리시버인가 — 실측 근거:
//  · FirebaseMessagingService.onMessageReceived 는 notification 페이로드가 있는 메시지를
//    **앱이 백그라운드일 때 호출되지 않는다**(SDK 가 배너를 직접 표시). 승인 버튼이 필요한 상황이
//    바로 그 백그라운드라서, 서비스 상속으로는 원천적으로 가로챌 수 없다.
//  · MESSAGING_EVENT 서비스가 둘이면 어느 쪽이 뜰지 불확정 → RNFB 배선을 깨뜨릴 위험.
//  · 반면 `com.google.android.c2dm.intent.RECEIVE` 브로드캐스트는 **모든 매칭 리시버**에 배달된다
//    (RNFB 자신도 ReactNativeFirebaseMessagingReceiver 로 이 방식을 쓴다) → 무간섭 병행 가능.
//
// 전략(설계서 §5.2 혼합): 서버는 notification+data 로 보내 **도달을 보장**하고(data-only 는 제조사
//  절전에서 유실되면 아무것도 안 뜬다), SDK 가 띄운 배너를 우리가 같은 tag/id 로 덮어써 버튼을 붙인다.
//
// ★ 이 리시버에서 절대 기다리지 않는다: c2dm 브로드캐스트는 **ordered** 라서(Firebase 리시버의
//   FINISHED_AFTER_HANDLED 메타가 그 증거) goAsync 로 붙잡으면 뒤에 있는 SDK 배너 표시 자체가
//   그만큼 밀린다 → "SDK 다음에 post" 가 불가능해진다. 기다림은 ApprovalNotifierService 로 넘긴다.
class CptFcmReceiver : BroadcastReceiver() {
  companion object { private const val TAG = "CptFcmReceiver" }

  override fun onReceive(context: Context, intent: Intent) {
    val extras = intent.extras ?: return
    // 승인 푸시가 아니면 완전 무간섭(기존 경로 유지). resolve = parse + 선택형 라벨 보강.
    val push = ApprovalNotifications.resolve(context, extras) ?: return
    // 그릴 버튼이 없으면(서버 신호 부재) SDK 기본 배너를 건드리지 않는다 — 회귀 위험 0.
    if (!push.actionable) { Log.i(TAG, "approval push without action hint — leave SDK banner"); return }

    // 포그라운드면 트레이 배너를 만들지 않는다 — 인앱 승인 카드가 담당(기존 동작 그대로).
    if (isAppInForeground(context)) return

    val appCtx = context.applicationContext
    try {
      // high priority 메시지 수신 중이라 백그라운드 서비스 시작이 임시 허용된다(RNFB 헤드리스와 동일 전제).
      appCtx.startService(Intent(appCtx, ApprovalNotifierService::class.java).apply {
        putExtra(ApprovalNotifications.EXTRA_SRC, extras)
      })
    } catch (e: Exception) {
      // 서비스 기동 실패 → 즉시 표시(최선 노력). SDK 배너가 나중에 덮으면 버튼은 사라지지만
      //  알림 자체는 도달하므로 사용자는 탭 → 인앱 카드로 응답할 수 있다.
      Log.w(TAG, "notifier service start failed — post inline", e)
      try { ApprovalNotifications.show(appCtx, push, extras) } catch (_: Exception) { }
    }
  }

  // RNFB SharedUtils.isAppInForeground 와 같은 판정(우리 프로세스가 FOREGROUND importance 인지).
  private fun isAppInForeground(context: Context): Boolean {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
    val procs = try { am.runningAppProcesses } catch (_: Exception) { null } ?: return false
    val pid = Process.myPid()
    return procs.any {
      it.pid == pid && it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }
  }
}
