package com.ghmate.codingpt.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

// 알림 액션 버튼([허용]/[거절]/선택지) 탭 수신 → 배너 즉시 회수 → **영속 큐 적재** → 헤드리스 JS 드레인.
//
// 응답 HTTPS 를 네이티브가 직접 쏘지 않는 이유(iOS 와 동일한 결론 — src/services/approvalActionQueue.ts):
//  · accessToken TTL 15분이라 알림 도착 시점엔 거의 만료 → 갱신 필수인데, 갱신은 refreshToken 을
//    회전시켜서(구 토큰 폐기) 네이티브가 갱신하면 회전 토큰을 AsyncStorage 에 직접 써야 하고
//    실패 시 사용자가 로그아웃된다. 토큰 사본 = 보안 감사 표면 증가.
//  · 기존 apiRequest(401 → refresh → 1회 재시도 + 회전 write-back)를 그대로 재사용하면 새 표면이 0.
//  · 409(ALREADY_RESOLVED)·HOST_OFFLINE 해석과 재시도 정책이 이미 JS 에 있다.
//
// Android 만의 추가 문제: 앱이 종료돼 있으면 JS 를 깨울 사람이 없다 → 알림 PendingIntent 실행은
//  백그라운드 실행 제한의 **임시 화이트리스트** 대상이라 여기서 HeadlessJsTaskService 를 띄울 수 있다.
//  기동에 실패해도 큐는 디스크에 남아 다음 앱 실행(AppState active 드레인)에서 전송된다 → 유실 0.
class ApprovalActionReceiver : BroadcastReceiver() {
  companion object { private const val TAG = "CptApprovalAction" }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ApprovalNotifications.ACTION_RESPOND) return
    val approvalId = intent.getStringExtra(ApprovalNotifications.EXTRA_APPROVAL_ID) ?: return
    val decision = intent.getStringExtra(ApprovalNotifications.EXTRA_DECISION) ?: return
    val label = intent.getStringExtra(ApprovalNotifications.EXTRA_LABEL)
    val questionIndex = intent.getIntExtra(ApprovalNotifications.EXTRA_QUESTION_INDEX, 0)
    val tag = intent.getStringExtra(ApprovalNotifications.EXTRA_TAG)
    val notifId = intent.getStringExtra(ApprovalNotifications.EXTRA_NOTIF_ID)

    val appCtx = context.applicationContext
    // 1) 즉시 회수 — 반응성 + 같은 버튼 두 번 누르기 방지(큐도 승인당 1건만 받는다).
    if (!tag.isNullOrEmpty()) ApprovalNotifications.cancelTag(appCtx, tag)

    // 2) 디스크 먼저(프로세스가 곧 죽어도 결정이 살아남는다).
    ApprovalActionStore.enqueue(
      appCtx, approvalId, decision,
      if (label != null) listOf(label) else emptyList(),
      questionIndex, notifId,
    )

    // 3) JS 드레인 기동.
    try {
      appCtx.startService(Intent(appCtx, ApprovalResponseService::class.java))
      HeadlessJsTaskService.acquireWakeLockNow(appCtx) // 서비스 기동 전 잠들지 않게(RN 권장 순서)
    } catch (e: Exception) {
      // 백그라운드 실행 제한/OEM 제약 → 큐에 남겨두고 앱을 다음에 열 때 전송한다.
      //  ★ Android 12+ 는 알림 → 리시버 → startActivity(트램폴린)를 차단하므로 여기서 화면을 열지 않는다.
      Log.w(TAG, "headless start failed — queued for next app start", e)
    }
  }
}
