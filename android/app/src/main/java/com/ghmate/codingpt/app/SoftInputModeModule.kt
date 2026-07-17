package com.ghmate.codingpt.app

import android.view.WindowManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// 특수키 패널 전환용 — 창 softInputMode 를 런타임에 전환한다(카카오톡/노션식 패널 스왑의 핵심).
//  · adjustResize(평소): 키보드가 창을 줄인다 — 일반 입력 UX.
//  · adjustNothing(패널 세션): 키보드가 창을 줄이지 않고 "위에 덮는다" → 패널을 키보드 뒤에
//    실제로 깔 수 있고, 키보드가 내려가면 그 자리가 그대로 드러난다(보조바 위치 불변).
class SoftInputModeModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SoftInputMode"

  @ReactMethod
  fun setMode(mode: String) {
    val activity = currentActivity ?: return
    activity.runOnUiThread {
      val flag = when (mode) {
        "nothing" -> WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING
        else -> WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
      }
      activity.window.setSoftInputMode(flag)
    }
  }
}
