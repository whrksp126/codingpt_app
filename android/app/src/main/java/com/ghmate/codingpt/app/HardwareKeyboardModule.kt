package com.ghmate.codingpt.app

import android.content.ComponentCallbacks
import android.content.res.Configuration
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

// 물리(외장) 키보드 연결 감지 — JS: NativeModules.HardwareKeyboard.
//
// Configuration 이 정답 API 다. "키보드 높이가 작으면 외장" 같은 휴리스틱은 플로팅 키보드·
//  IME 종류에 따라 전부 틀린다. 연결/해제는 configuration 변경으로 통지되므로 즉시 반영된다.
//   · keyboard != KEYBOARD_NOKEYS      — 하드웨어 키가 있는 구성
//   · hardKeyboardHidden == HIDDEN_NO  — 그 키보드가 지금 **쓸 수 있는** 상태(덮개 닫힘 등 제외)
class HardwareKeyboardModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "HardwareKeyboard"

  private var callbacks: ComponentCallbacks? = null
  private var last: Boolean? = null

  private fun connected(): Boolean {
    val c = reactContext.resources.configuration
    return c.keyboard != Configuration.KEYBOARD_NOKEYS &&
        c.hardKeyboardHidden == Configuration.HARDKEYBOARDHIDDEN_NO
  }

  @ReactMethod
  fun getConnected(promise: Promise) {
    promise.resolve(connected())
  }

  // RN 이벤트 emitter 규약(NativeEventEmitter 가 호출) — 첫 리스너에서 configuration 관찰 시작.
  @ReactMethod
  fun addListener(eventName: String) {
    if (callbacks != null) return
    last = connected()
    val cb = object : ComponentCallbacks {
      override fun onConfigurationChanged(newConfig: Configuration) {
        val now = connected()
        if (now == last) return
        last = now
        val body = Arguments.createMap().apply { putBoolean("connected", now) }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("hardwareKeyboardChanged", body)
      }

      override fun onLowMemory() {}
    }
    callbacks = cb
    reactContext.applicationContext.registerComponentCallbacks(cb)
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    val cb = callbacks ?: return
    callbacks = null
    try { reactContext.applicationContext.unregisterComponentCallbacks(cb) } catch (_: Throwable) {}
  }

  override fun invalidate() {
    removeListeners(0)
    super.invalidate()
  }
}
