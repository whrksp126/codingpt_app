package com.ghmate.codingpt.app

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

// 승인 응답 전송(=네이티브 액션 큐 드레인)용 헤드리스 JS 태스크 진입점.
//  index.js 의 AppRegistry.registerHeadlessTask('CptApprovalResponse', …) 와 짝이며,
//  JS 는 approvalActionQueue.drainNativeApprovalActions() 로 큐를 비운다(토큰·401 refresh 재사용).
class ApprovalResponseService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    // 큐 기반이라 인텐트 페이로드가 없다 — "지금 드레인해라" 신호만 보낸다.
    // timeout 45s / isAllowedInForeground=true — 앱이 떠 있는 채로 버튼을 눌러도 태스크가 돌아야 한다
    //  (false 면 포그라운드에서 IllegalStateException 으로 죽는다).
    return HeadlessJsTaskConfig("CptApprovalResponse", Arguments.createMap(), 45_000, true)
  }
}
