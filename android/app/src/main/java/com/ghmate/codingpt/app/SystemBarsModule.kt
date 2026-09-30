package com.ghmate.codingpt.app

import androidx.core.view.WindowInsetsControllerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

// 시스템 내비게이션 바 아이콘 밝기 = 앱 테마(ThemeContext 가 스킴 확정 때마다 호출).
//  targetSdk 35+ 는 edge-to-edge 강제라 바 배경색 지정(setNavigationBarColor)은 무동작이고,
//  RN StatusBar 는 내비 바 아이콘을 다루지 않는다 → 이 한 가지만 WindowInsetsControllerCompat 로 맞춘다.
//  (상태바 아이콘은 RN StatusBar.setBarStyle 이 담당)
class SystemBarsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName() = "SystemBars"

  @ReactMethod
  fun setNavigationBarLight(light: Boolean) {
    val activity = currentActivity ?: return
    activity.runOnUiThread {
      val window = activity.window ?: return@runOnUiThread
      WindowInsetsControllerCompat(window, window.decorView).isAppearanceLightNavigationBars = light
    }
  }
}
