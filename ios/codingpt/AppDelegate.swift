import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    FirebaseApp.configure() // FCM(@react-native-firebase) — GoogleService-Info.plist 로드

    // 승인 알림 액션([허용]/[거절]) — 카테고리 등록 + UNUserNotificationCenter delegate 선점.
    //  ⚠ 반드시 **이 메서드 안에서** 호출해야 한다. RNFB 는 UIApplicationDidFinishLaunchingNotification
    //    (= 이 메서드가 리턴한 직후)에 delegate 를 잡으면서 그때의 delegate 를 originalDelegate 로 보관해
    //    모든 콜백을 포워딩한다 → 여기서 선점하면 우리가 RNFB **뒤에** 자동 체인되고 기존 알림 탭·딥링크는
    //    손대지 않는다. 더 늦게 호출하면 우리가 RNFB 를 덮어써서 기존 동작이 통째로 죽는다.
    CptApprovalNotifDelegate.install()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "codingpt",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // 딥링크(codingpt://…) → RN Linking 으로 전달. QR 페어링 자동승인·github OAuth 콜백 등에 필요.
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return RCTLinkingManager.application(app, open: url, options: options)
  }

  // 유니버설 링크(향후) 대비.
  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
