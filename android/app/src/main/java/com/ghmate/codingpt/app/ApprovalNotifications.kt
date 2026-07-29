package com.ghmate.codingpt.app

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

// 승인 알림의 **네이티브 액션 버튼** 표시 정본.
//
// 배경(실측): 서버는 승인 푸시를 notification+data 혼합으로 보내고, notification 페이로드가 있는
//  메시지는 앱이 백그라운드일 때 **Firebase SDK 가 직접 배너를 표시**한다(onMessageReceived 미호출).
//  FCM notification 페이로드에는 액션 버튼 필드가 없으므로, 버튼을 붙이려면 우리가 같은
//  (tag, id=0) 으로 **덮어써야** 한다. tag 는 서버가 준 cptnotif-<notifId> 를 그대로 유지 →
//  크로스기기 dismiss(NotifTrayModule.cancelByNotifIds)가 회수 대상을 그대로 찾는다.
//
// 알림 탭 동작 보존: 우리 알림의 contentIntent 에 **원본 FCM extras 를 그대로 복사**해서 MainActivity 로
//  보낸다. RNFB 는 Activity intent 의 "google.message_id" 로 메시지를 되찾으므로
//  (ReactNativeFirebaseMessagingModule.getInitialNotification:73 / onNewIntent:300)
//  기존 딥링크 소비 경로(onNotificationOpenedApp / getInitialNotification)가 깨지지 않는다.
object ApprovalNotifications {
  const val ACTION_RESPOND = "com.ghmate.codingpt.app.APPROVAL_RESPOND"

  const val EXTRA_APPROVAL_ID = "cpt_approval_id"
  const val EXTRA_DECISION = "cpt_decision"           // allow | deny | answer
  const val EXTRA_ALWAYS = "cpt_always"               // allow + "다음부터 묻지 않기" 플래그
  const val EXTRA_LABEL = "cpt_label"                 // answer 일 때 선택지 라벨
  const val EXTRA_QUESTION_INDEX = "cpt_question_index"
  const val EXTRA_TAG = "cpt_tag"                      // 회수할 알림 태그
  const val EXTRA_NOTIF_ID = "cpt_notif_id"            // 서버 알림 행 id(큐 적재용)
  const val EXTRA_SRC = "cpt_src_extras"               // 원본 FCM extras(탭 → 딥링크 보존용)

  private const val NOTIF_ID = 0                       // FCM SDK 가 tag+0 으로 표시 → 같은 좌표로 덮어쓴다
  private const val DEFAULT_CHANNEL = "codingpt_default" // MainApplication 이 만든 HIGH 채널 재사용

  // ── 파싱(+ 선택형 라벨 보강) ────────────────────────────────────────────────

  // 푸시 data 에는 선택지 라벨이 없다. JS 가 approval_event(pending) 시점에 등록해둔 라벨이 있으면
  //  그걸로 선택형으로 승격한다(CptApprovalModule.registerChoiceCategory ← approvalActionQueue.ts).
  fun resolve(context: Context, extras: Bundle?): ApprovalPush? {
    val base = ApprovalPush.parse(extras) ?: return null
    val labels = ApprovalActionStore.choiceLabels(context, base.approvalId) ?: return base
    return base.copy(kind = "choice", options = labels, permissionSignal = false)
  }

  // ── 표시 ──────────────────────────────────────────────────────────────────

  // 트레이 상태 3분류 — ApprovalNotifierService 의 관찰 규칙에 쓴다.
  //  액션 유무로 "SDK 기본 배너"와 "우리 버튼 알림"을 구분할 수 있다(SDK 배너엔 액션이 없다).
  enum class BannerState { ABSENT, PLAIN, WITH_ACTIONS }

  fun bannerState(context: Context, tag: String): BannerState {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return BannerState.ABSENT
    return try {
      val sbn = nm.activeNotifications.firstOrNull { it.tag == tag } ?: return BannerState.ABSENT
      if ((sbn.notification.actions?.size ?: 0) > 0) BannerState.WITH_ACTIONS else BannerState.PLAIN
    } catch (_: Exception) { BannerState.ABSENT }
  }

  fun show(context: Context, push: ApprovalPush, src: Bundle?) {
    val nm = NotificationManagerCompat.from(context)
    if (!nm.areNotificationsEnabled()) return // Android 13+ POST_NOTIFICATIONS 미허용 — 조용히 스킵

    val b = NotificationCompat.Builder(context, resolveChannel(context, push.channelId))
      .setSmallIcon(smallIcon(context))
      .setContentTitle(push.title)
      .setContentText(push.body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(push.body))
      .setPriority(NotificationCompat.PRIORITY_HIGH)          // pre-O 헤드업
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)                                 // SDK 배너를 덮어쓸 때 소리/진동 재발화 금지
      .setContentIntent(activityIntent(context, push.approvalId, src))

    // 마감이 지나면 트레이에서 자동 소멸(만료된 승인 버튼을 누르는 사고 방지). O+ 에서만 유효.
    if (push.deadlineAt > 0) {
      val left = push.deadlineAt - System.currentTimeMillis()
      if (left > 1_000) b.setTimeoutAfter(left)
    }

    addActions(context, b, push, src)

    try { nm.notify(push.tag, NOTIF_ID, b.build()) } catch (_: SecurityException) { /* 권한 회수 — 스킵 */ }
  }

  private fun addActions(context: Context, b: NotificationCompat.Builder, push: ApprovalPush, src: Bundle?) {
    if (push.isChoice) {
      // 선택형: 버튼은 2개까지만(3개 이상은 라벨이 잘려 오답 위험) → 그 외엔 앱에서 답하기.
      if (push.options.size in 1..2) {
        push.options.forEachIndexed { i, label ->
          b.addAction(action(context, push, "answer", label, "opt$i", trim(label)))
        }
        return
      }
      b.addAction(NotificationCompat.Action(0, "답하기", activityIntent(context, push.approvalId, src)))
      return
    }
    // 권한형: TUI 순서(허용 → 묻지 않기 → 거절). 3번째는 서버가 alwaysSignal(=claude 규칙 제안)을
    //  실었을 때만 — 신호 없이 만들면 "다시 안 묻겠지" 하고 눌렀는데 계속 묻는 신뢰 붕괴가 된다.
    //  (옛 주석 "항상 허용은 claude 2.1.220 에 없다"는 2026-07-29 재실측으로 오판 판명 — 있다.)
    b.addAction(action(context, push, "allow", null, "allow", "허용"))
    if (push.alwaysSignal) b.addAction(action(context, push, "allow", null, "always", "허용하고 묻지 않기", always = true))
    b.addAction(action(context, push, "deny", null, "deny", "거절"))
  }

  private fun action(
    context: Context,
    push: ApprovalPush,
    decision: String,
    label: String?,
    key: String,
    text: String,
    always: Boolean = false,
  ): NotificationCompat.Action {
    val intent = Intent(context, ApprovalActionReceiver::class.java).apply {
      action = ACTION_RESPOND
      putExtra(EXTRA_APPROVAL_ID, push.approvalId)
      putExtra(EXTRA_DECISION, decision)
      if (always) putExtra(EXTRA_ALWAYS, true)
      if (label != null) putExtra(EXTRA_LABEL, label)
      putExtra(EXTRA_QUESTION_INDEX, push.questionIndex)
      putExtra(EXTRA_TAG, push.tag)
      if (push.notifId != null) putExtra(EXTRA_NOTIF_ID, push.notifId)
    }
    // PendingIntent 동일성은 extras 를 보지 않으므로 requestCode 로 액션을 구분해야 한다.
    val pi = PendingIntent.getBroadcast(
      context,
      ("${push.approvalId}|$key").hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    return NotificationCompat.Action(0, text, pi) // minSdk 24 = 알림 그림자에서 액션 아이콘 미표시
  }

  // 알림 본문 탭 / "답하기" — 앱을 열어 인앱 승인 카드로 간다.
  //  ★ Android 12+ 는 알림에서 리시버·서비스를 경유한 startActivity(트램폴린)를 차단하므로
  //    반드시 Activity PendingIntent 여야 한다.
  private fun activityIntent(context: Context, approvalId: String, src: Bundle?): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK
      if (src != null) putExtras(src) // google.message_id 포함 → RNFB 딥링크 경로 그대로 동작
    }
    return PendingIntent.getActivity(
      context,
      ("open|$approvalId").hashCode(),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  fun cancelTag(context: Context, tag: String) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    try { nm.cancel(tag, NOTIF_ID) } catch (_: Exception) { }
  }

  // ── 잡동사니 ──────────────────────────────────────────────────────────────

  // 서버가 지정한 채널이 실제로 존재할 때만 사용(없는 채널로 notify 하면 O+ 에서 표시 실패).
  private fun resolveChannel(context: Context, requested: String?): String {
    if (requested.isNullOrEmpty() || requested == DEFAULT_CHANNEL) return DEFAULT_CHANNEL
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return DEFAULT_CHANNEL
    return try {
      if (nm.getNotificationChannel(requested) != null) requested else DEFAULT_CHANNEL
    } catch (_: Exception) { DEFAULT_CHANNEL }
  }

  // FCM SDK 와 같은 규칙(default_notification_icon meta-data → 없으면 앱 아이콘)으로
  //  기존 배너와 동일한 모양을 유지한다.
  private fun smallIcon(context: Context): Int {
    return try {
      val ai = context.packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
      val fromMeta = ai.metaData?.getInt("com.google.firebase.messaging.default_notification_icon", 0) ?: 0
      if (fromMeta != 0) fromMeta else ai.icon
    } catch (_: Exception) { context.applicationInfo.icon }
  }

  private fun trim(label: String): String = if (label.length <= 18) label else label.take(17) + "…"
}
