package com.ghmate.codingpt.app

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log

// 승인 배너를 "액션 버튼 알림"으로 승격시키는 짧은 수명 서비스.
//
// 왜 서비스인가: FCM 브로드캐스트는 ordered 라서 리시버에서 기다리면(goAsync) 뒤에 오는
//  Firebase SDK 의 배너 표시 자체가 밀린다 → "SDK 다음에 덮어쓰기"가 성립하지 않는다.
//  그래서 리시버는 즉시 반환하고, 이 서비스가 브로드캐스트 체인 밖에서 트레이를 관찰한다.
//
// 관찰 규칙(순서 가정을 하지 않는다 — 어느 리시버가 먼저 돌든 동일하게 수렴):
//  · 우리 tag 로 떠 있는 알림에 액션이 **없다** = SDK 기본 배너 → 즉시 같은 tag/id 로 덮어쓴다.
//  · 액션이 **있다** = 이미 우리 알림 → 종료.
//  · 아무것도 없다 = SDK 가 아직 안 띄웠다 → 계속 관찰. 타임아웃이면 우리가 직접 표시
//    (data-only 로 왔거나 SDK 표시가 억제된 경우).
//  · 한 번 봤다가 사라졌다 = 사용자가 이미 치웠다 → **되살리지 않는다**.
class ApprovalNotifierService : Service() {
  companion object {
    private const val TAG = "CptApprovalNotifier"
    private const val POLL_MS = 120L
    private const val MAX_WAIT_MS = 3_000L
    private const val WAKE_MS = 8_000L
  }

  private val handler = Handler(Looper.getMainLooper())
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val src = intent?.getBundleExtra(ApprovalNotifications.EXTRA_SRC)
    val push = ApprovalNotifications.resolve(this, src)
    if (push == null || !push.actionable) { stopSelf(startId); return START_NOT_STICKY }

    // 화면 꺼진 상태에서 폴링 중 CPU 가 잠들지 않게(짧은 partial wakelock, 타임아웃 자동 해제).
    if (wakeLock == null) {
      wakeLock = try {
        (getSystemService(Context.POWER_SERVICE) as? PowerManager)
          ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "codingpt:approval-notify")
          ?.also { it.acquire(WAKE_MS) }
      } catch (_: Exception) { null }
    }

    val startedAt = SystemClock.uptimeMillis()
    var sawBanner = false

    val tick = object : Runnable {
      override fun run() {
        val state = ApprovalNotifications.bannerState(this@ApprovalNotifierService, push.tag)
        val elapsed = SystemClock.uptimeMillis() - startedAt
        val seen = sawBanner
        if (state != ApprovalNotifications.BannerState.ABSENT) sawBanner = true
        when {
          state == ApprovalNotifications.BannerState.WITH_ACTIONS -> finish(startId)  // 이미 승격됨
          state == ApprovalNotifications.BannerState.PLAIN -> {                        // SDK 배너 → 덮어쓰기
            show(push, src); finish(startId)
          }
          seen -> finish(startId)                                                      // 봤다가 사라짐 = 사용자가 치웠다
          elapsed >= MAX_WAIT_MS -> { show(push, src); finish(startId) }               // SDK 가 안 띄웠다
          else -> handler.postDelayed(this, POLL_MS)
        }
      }
    }
    handler.post(tick)
    return START_NOT_STICKY
  }

  private fun show(push: ApprovalPush, src: Bundle?) {
    try { ApprovalNotifications.show(this, push, src) } catch (e: Exception) { Log.w(TAG, "post failed", e) }
  }

  private fun finish(startId: Int) {
    handler.removeCallbacksAndMessages(null)
    stopSelf(startId)
  }

  override fun onDestroy() {
    handler.removeCallbacksAndMessages(null)
    try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) { }
    wakeLock = null
    super.onDestroy()
  }
}
