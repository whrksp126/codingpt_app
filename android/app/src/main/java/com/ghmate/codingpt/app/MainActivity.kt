package com.ghmate.codingpt.app

import android.os.Build
import android.os.Bundle
import android.view.View
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "codingpt"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // ★ Android 15(API 35)+ 에서 targetSdk 35+ 앱은 edge-to-edge 가 강제되어 windowSoftInputMode=adjustResize 가
    //  **창을 줄이지 않는다** → 키보드가 채팅 입력칸·터미널 아래쪽을 그대로 덮었다(2026-11-25 실측: Pixel 9a API 35,
    //  구 스토어 빌드 0.4.39 에서도 동일. Android 10 실기에선 안 보이던 문제). 앱 전체가 adjustResize 를 전제로
    //  짜여 있으므로(셸이 키보드만큼 줄어든다) 그 동작을 IME 인셋으로 되살린다: 키보드 높이만큼 콘텐츠 뷰 아래를
    //  비운다(옛 adjustResize 와 같은 결과 — 창 바닥 = 키보드 윗변). 내비게이션 바 몫을 빼면 루트 바닥에 붙는
    //  터미널 보조키 바가 그만큼 키보드 뒤에 깔린다(실측). 그 아래 API 는 원래대로 동작한다.
    if (Build.VERSION.SDK_INT >= 35) {
      val content = findViewById<View>(android.R.id.content)
      ViewCompat.setOnApplyWindowInsetsListener(content) { v, insets ->
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        val pad = maxOf(0, ime)
        if (v.paddingBottom != pad) v.setPadding(0, 0, 0, pad)
        insets
      }
    }
  }
}
