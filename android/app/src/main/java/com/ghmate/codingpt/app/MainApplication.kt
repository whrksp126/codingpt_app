package com.ghmate.codingpt.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
              add(SoftInputModePackage()) // 특수키 패널 스왑용 softInputMode 런타임 전환
              add(NotifTrayPackage()) // 크로스기기 dismiss — 트레이 배너 회수
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
    createDefaultNotificationChannel()
  }

  // FCM 기본 알림 채널(Android O+). AndroidManifest 의 default_notification_channel_id 와 동일 id.
  //  선언하지 않으면 FCM 이 fcm_fallback_notification_channel 을 자동 생성하며 경고를 남긴다.
  private fun createDefaultNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channelId = "codingpt_default"
    if (manager.getNotificationChannel(channelId) != null) return
    val channel = NotificationChannel(channelId, "코딩PT 알림", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "작업 완료·승인 요청 등 코딩PT 알림"
    }
    manager.createNotificationChannel(channel)
  }
}
