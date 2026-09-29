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

    // 창과 RN 루트는 SceneDelegate 가 만든다(아래). iOS 27 은 최신 SDK 로 빌드한 앱에 UIScene 생명주기를
    //  강제한다 — 채택하지 않으면 실행 즉시 EXC_BREAKPOINT(_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycle
    //  Adoption)로 종료된다(2026-09-29 iOS 27 시뮬레이터 실측, iOS 18 은 정상).
    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    config.delegateClass = SceneDelegate.self
    return config
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

// UIScene 생명주기 — 창·RN 루트·딥링크(콜드/웜) 수신은 씬에서. 씬을 쓰면 URL·유니버설 링크가 AppDelegate 의
//  application(_:open:) / continue 로 오지 않으므로 여기서 같은 RCTLinkingManager 로 넘긴다.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    // 콜드 스타트 딥링크 — RN Linking.getInitialURL 은 launchOptions 의 url 을 읽는다.
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }
    if let activity = connectionOptions.userActivities.first {
      launchOptions[.userActivityDictionary] = [
        "UIApplicationLaunchOptionsUserActivityTypeKey": activity.activityType,
        "UIApplicationLaunchOptionsUserActivityKey": activity,
      ]
    }

    factory.startReactNative(
      withModuleName: "codingpt",
      in: window,
      launchOptions: launchOptions.isEmpty ? nil : launchOptions
    )
  }

  // 웜 딥링크(codingpt://…)
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }

  // 유니버설 링크(향후)
  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
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
