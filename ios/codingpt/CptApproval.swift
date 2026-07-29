import Foundation
import UIKit
import UserNotifications
import React

// ── 원격 승인 알림 액션(UNNotificationAction) ──
//  잠금화면/배너에서 [허용]/[거절](선택형은 옵션 라벨)을 바로 눌러 앱을 열지 않고 승인에 응답한다.
//  서버는 aps.category 로 카테고리를 지정하고(§3.5 CPT_APPROVAL), data 로 approvalId/선택지를 보낸다.
//
//  왜 이런 구조인가(전부 실측 근거):
//
//  ① 카테고리 등록
//     · permission 종류 = 정적 카테고리 `CPT_APPROVAL`([허용]/[거절]) — 라벨이 고정이므로 앱이 죽어 있어도
//       콜드 상태에서 버튼이 뜬다. 이게 주 경로다.
//     · choice 종류 = 라벨이 승인마다 달라 정적 등록이 불가능하다(iOS 는 푸시 도착 시점에 카테고리를 만들 수 없다).
//       그래서 승인 id 를 카테고리 식별자에 박은 **per-승인 카테고리** `CPT_CHOICE_<approvalId>` 를
//       앱이 살아있는 동안 미리 등록한다(JS: registerChoiceCategory). 미등록 상태로 푸시가 오면 iOS 는
//       버튼 없이 배너만 띄운다 = 요구된 "앱 열기 폴백". 카테고리 id 가 승인과 1:1 이므로
//       **라벨과 인덱스가 어긋난 오답을 보낼 가능성이 구조적으로 0** 이다(제네릭 카테고리를 쓰면 생기는 사고).
//
//  ② UNUserNotificationCenter delegate 체인 (기존 알림 회귀 방지의 핵심)
//     RNFB(@react-native-firebase/messaging)가 delegate 를 점유하지만, RNFB 는 자기가 붙는 시점
//     (UIApplicationDidFinishLaunchingNotification)에 **기존 delegate 를 originalDelegate 로 보관하고
//     모든 콜백을 그쪽으로 포워딩**한다 — RNFBMessaging+UNUserNotificationCenter.m:48-59(캡처),
//     :165-171(didReceive 포워딩 + completionHandler 위임).
//     → 우리는 application(_:didFinishLaunchingWithOptions:) 안에서, 즉 **RNFB 가 붙기 전에** delegate 를
//       선점만 하면 자동으로 RNFB 뒤에 체인된다. 기존 알림 탭·딥링크(messaging_notification_opened /
//       getInitialNotification)는 RNFB 가 먼저 그대로 처리하므로 회귀가 없다.
//     ⚠ RNFB 의 originalDelegate 프로퍼티는 **weak** (같은 파일 헤더) → 우리 delegate 객체는 반드시
//       강한 전역 참조(shared 싱글턴)로 살려둬야 한다. 지역 객체로 넣으면 조용히 포워딩이 끊긴다.
//     ⚠ willPresentNotification / openSettingsForNotification 은 **구현하지 않는다**. RNFB 는 우리에게
//       포워딩한 뒤 자기도 completionHandler 를 호출하므로(:142-150) 이중 호출이 되고, 포그라운드 표시
//       정책(messaging_ios_foreground_presentation_options)과 설정 화면 이벤트가 회귀한다.
//
//  ③ 응답 전송은 JS 경유(네이티브 직접 HTTPS + 토큰 Keychain 미러를 의도적으로 기각)
//     · accessToken TTL = 15분(back `services/userService.js:38` ACCESS_TTL). 승인 알림은 사용자가 자리를
//       비운 사이 오므로 네이티브가 미러해 둔 accessToken 은 거의 항상 만료 상태다 → 갱신이 필수.
//     · 갱신(POST /api/users/refresh)은 refreshToken 잔여가 1일 미만이면 **refreshToken 을 회전시키고
//       구 토큰을 폐기**한다(`userService.js:393-404`). 네이티브가 갱신하면 회전된 새 refreshToken 을
//       AsyncStorage(RN 내부 manifest 포맷)에 직접 써야 하고, 실패하면 사용자가 **로그아웃**된다.
//       = 승인 버튼 하나 때문에 계정 세션을 위협하는 거래. 기각.
//     · 대신: 액션을 **영속 큐(UserDefaults)에 적재** → `beginBackgroundTask` 로 프로세스를 살려두고 →
//       JS(index.js 최상단에서 번들 평가 즉시 드레인)가 기존 `apiRequest`(401 → refresh → 1회 재시도,
//       회전 토큰 write-back 포함)로 응답한다. **비밀 사본 0개 · 새 보안 표면 0개.**
//     · JS 부팅 전에 프로세스가 죽는 최악의 경우에도 큐는 디스크에 남아 다음 실행에서 재시도되고,
//       그마저 실패하면 승인은 서버 마감(24h)으로 defer = PC 터미널 다이얼로그(fail-safe). auto-allow 는 없다.

// MARK: - 액션 식별자 / 카테고리 식별자 (서버·Android·PC 와 공유하는 와이어 상수)

enum CptApprovalIds {
  static let categoryPermission = "CPT_APPROVAL"          // 서버 aps.category (permission 종류, 2버튼)
  // "허용하고 다음부터 묻지 않기"가 있는 permission(서버가 alwaysLabel 을 실은 경우) — 라벨이 고정이라
  //  choice 와 달리 **정적 등록**이 가능하고, 콜드 상태에서도 3버튼이 뜬다. 순서는 TUI 와 동일.
  static let categoryPermissionAlways = "CPT_APPROVAL_ALWAYS"
  static let categoryChoicePrefix = "CPT_CHOICE_"         // + approvalId (choice 종류)
  static let actionAllow = "CPT_ALLOW"
  static let actionAlways = "CPT_ALWAYS"                  // 허용 + 다음부터 묻지 않기(규칙은 데몬 보관분)
  static let actionDeny = "CPT_DENY"
  static let actionAnswerPrefix = "CPT_ANSWER_"           // + 옵션 인덱스(0,1)
  static let maxChoiceCategories = 8                      // per-승인 카테고리 보관 상한(오래된 것부터 폐기)
}

// MARK: - 큐에 쌓이는 액션 1건

private struct CptApprovalAction: Codable {
  let uid: String            // 큐 항목 식별자(JS ack 키)
  let approvalId: String
  let decision: String       // "allow" | "deny" | "answer"
  let always: Bool?          // decision=="allow" + "다음부터 묻지 않기"(CPT_ALWAYS 액션)
  let labels: [String]?      // decision=="answer" 일 때 선택한 라벨 1개
  let questionIndex: Int?    // decision=="answer" 일 때 질문 인덱스(현재 0 고정)
  let notifId: String?
  let at: Double             // epoch ms — JS 가 마감 지난 항목을 폐기하는 기준

  var jsDict: [String: Any] {
    var d: [String: Any] = ["uid": uid, "approvalId": approvalId, "decision": decision, "at": at]
    if always == true { d["always"] = true }
    if let labels = labels { d["labels"] = labels }
    if let questionIndex = questionIndex { d["questionIndex"] = questionIndex }
    if let notifId = notifId { d["notifId"] = notifId }
    return d
  }
}

// MARK: - 영속 큐 + 백그라운드 실행 시간 확보

final class CptApprovalRuntime {
  static let shared = CptApprovalRuntime()
  private init() {}

  private let key = "cpt.approval.pendingActions"
  private let lock = NSLock()
  // 알림 액션으로 백그라운드 실행됐을 때 JS 번들이 부팅해 응답을 보낼 시간을 번다.
  //  completionHandler 는 즉시 호출하고(iOS 권고), 프로세스 생존은 이 태스크로 따로 붙든다.
  private var bgTask: UIBackgroundTaskIdentifier = .invalid
  private var bgTimer: DispatchSourceTimer?

  private func load() -> [CptApprovalAction] {
    guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
    return (try? JSONDecoder().decode([CptApprovalAction].self, from: data)) ?? []
  }

  private func save(_ items: [CptApprovalAction]) {
    if items.isEmpty { UserDefaults.standard.removeObject(forKey: key); return }
    if let data = try? JSONEncoder().encode(items) { UserDefaults.standard.set(data, forKey: key) }
  }

  fileprivate func enqueue(_ item: CptApprovalAction) {
    lock.lock(); defer { lock.unlock() }
    var items = load()
    // 같은 승인에 대한 중복 적재 방지(같은 배너를 두 번 처리하는 경로는 없지만 멱등하게).
    if items.contains(where: { $0.approvalId == item.approvalId }) { return }
    items.append(item)
    if items.count > 32 { items.removeFirst(items.count - 32) }   // 폭주 가드
    save(items)
  }

  func pendingJs() -> [[String: Any]] {
    lock.lock(); defer { lock.unlock() }
    return load().map { $0.jsDict }
  }

  func ack(_ uids: [String]) {
    lock.lock()
    let wanted = Set(uids)
    let remaining = load().filter { !wanted.contains($0.uid) }
    save(remaining)
    let empty = remaining.isEmpty
    lock.unlock()
    if empty { endBackgroundHold() }   // 다 보냈으면 프로세스를 붙들 이유가 없다
  }

  var hasPending: Bool {
    lock.lock(); defer { lock.unlock() }
    return !load().isEmpty
  }

  // 최대 25초까지 프로세스를 살려둔다(백그라운드 실행 창은 ~30초).
  func beginBackgroundHold() {
    DispatchQueue.main.async {
      if self.bgTask != .invalid { return }
      self.bgTask = UIApplication.shared.beginBackgroundTask(withName: "cpt.approval.respond") { [weak self] in
        self?.endBackgroundHold()
      }
      let timer = DispatchSource.makeTimerSource(queue: .main)
      timer.schedule(deadline: .now() + 25)
      timer.setEventHandler { [weak self] in self?.endBackgroundHold() }
      timer.resume()
      self.bgTimer = timer
    }
  }

  func endBackgroundHold() {
    DispatchQueue.main.async {
      self.bgTimer?.cancel(); self.bgTimer = nil
      if self.bgTask != .invalid {
        UIApplication.shared.endBackgroundTask(self.bgTask)
        self.bgTask = .invalid
      }
    }
  }
}

// MARK: - 카테고리 등록

final class CptApprovalCategories {
  static let shared = CptApprovalCategories()
  private init() {}

  private let orderKey = "cpt.approval.choiceCategoryOrder"   // 등록 순서(오래된 것부터 폐기)
  // get→set 쌍이 겹치면 나중 set 이 앞 등록을 덮어써 카테고리가 유실된다(선택형 2건 연속 등록 시 실제 발생).
  //  → 병합 전체를 직렬화한다. 메인 스레드가 아닌 전용 큐라 semaphore 대기가 UI 를 막지 않는다.
  private let serial = DispatchQueue(label: "cpt.approval.categories")

  private func permissionCategory() -> UNNotificationCategory {
    // [허용] / [거절] — 라벨·순서는 PC/Android 와 동일(TUI 순서: 허용이 먼저). 거절은 .destructive(빨강).
    //  ⚠ 허용에 .authenticationRequired 를 주지 않는다(설계 §5.3: 잠금화면에서 바로 허용).
    //    → 폰을 물리적으로 든 사람이 잠금 해제 없이 승인할 수 있다. 위험을 감수하는 의도적 선택이며
    //      되돌리려면 아래 options 에 .authenticationRequired 한 줄만 추가하면 된다.
    let allow = UNNotificationAction(identifier: CptApprovalIds.actionAllow, title: "허용", options: [])
    let deny = UNNotificationAction(identifier: CptApprovalIds.actionDeny, title: "거절", options: [.destructive])
    return UNNotificationCategory(
      identifier: CptApprovalIds.categoryPermission,
      actions: [allow, deny],
      intentIdentifiers: [],
      options: []
    )
  }

  // 3버튼 변형 — 서버가 alwaysLabel 을 실은 permission(claude 가 규칙을 제안한 요청)에만 온다.
  //  순서는 TUI/카드와 동일: 허용 → 허용하고 묻지 않기 → 거절. 규칙 원문은 데몬이 보관하므로
  //  여기서는 고정 라벨만 그린다(개별 규칙 문자열은 알림 본문/인앱 카드에서 확인).
  private func permissionAlwaysCategory() -> UNNotificationCategory {
    let allow = UNNotificationAction(identifier: CptApprovalIds.actionAllow, title: "허용", options: [])
    let always = UNNotificationAction(identifier: CptApprovalIds.actionAlways, title: "허용하고 묻지 않기", options: [])
    let deny = UNNotificationAction(identifier: CptApprovalIds.actionDeny, title: "거절", options: [.destructive])
    return UNNotificationCategory(
      identifier: CptApprovalIds.categoryPermissionAlways,
      actions: [allow, always, deny],
      intentIdentifiers: [],
      options: []
    )
  }

  private func choiceCategory(approvalId: String, labels: [String]) -> UNNotificationCategory {
    let actions: [UNNotificationAction] = labels.prefix(2).enumerated().map { idx, label in
      UNNotificationAction(
        identifier: CptApprovalIds.actionAnswerPrefix + String(idx),
        title: Self.trim(label),
        options: []
      )
    }
    return UNNotificationCategory(
      identifier: CptApprovalIds.categoryChoicePrefix + approvalId,
      actions: actions,
      intentIdentifiers: [],
      options: []
    )
  }

  private static func trim(_ s: String) -> String {
    let one = s.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
    return one.count <= 28 ? one : String(one.prefix(27)) + "…"
  }

  // setNotificationCategories 는 **전체 집합을 교체**한다 → 기존 집합을 읽어 병합한다.
  //  (우리 외에 카테고리를 등록하는 pod 은 없지만, 있어도 지우지 않도록.)
  private func merge(adding: [UNNotificationCategory], removingIds: Set<String>) {
    serial.async {
      let center = UNUserNotificationCenter.current()
      let sem = DispatchSemaphore(value: 0)
      center.getNotificationCategories { existing in
        var byId: [String: UNNotificationCategory] = [:]
        for c in existing where !removingIds.contains(c.identifier) { byId[c.identifier] = c }
        for c in adding { byId[c.identifier] = c }
        byId[CptApprovalIds.categoryPermission] = self.permissionCategory()   // 정적 카테고리는 항상 최신으로
        byId[CptApprovalIds.categoryPermissionAlways] = self.permissionAlwaysCategory()
        center.setNotificationCategories(Set(byId.values))
        sem.signal()
      }
      _ = sem.wait(timeout: .now() + 5)
    }
  }

  /// 앱 시작 시 1회 — permission 카테고리를 등록한다(콜드 상태 버튼의 전제).
  func installStatic() {
    merge(adding: [], removingIds: [])
  }

  /// pending 선택형 승인을 알게 된 순간 호출(JS). 라벨은 그 승인의 것이어야 한다.
  func registerChoice(approvalId: String, labels: [String]) {
    guard !approvalId.isEmpty, !labels.isEmpty else { return }
    var order = UserDefaults.standard.stringArray(forKey: orderKey) ?? []
    order.removeAll { $0 == approvalId }
    order.append(approvalId)
    var stale: Set<String> = []
    while order.count > CptApprovalIds.maxChoiceCategories {
      stale.insert(CptApprovalIds.categoryChoicePrefix + order.removeFirst())
    }
    UserDefaults.standard.set(order, forKey: orderKey)
    merge(adding: [choiceCategory(approvalId: approvalId, labels: labels)], removingIds: stale)
  }

  /// 해소된 승인의 카테고리 정리(선택 — 안 불러도 상한으로 자연 폐기된다).
  func dropChoice(approvalIds: [String]) {
    guard !approvalIds.isEmpty else { return }
    var order = UserDefaults.standard.stringArray(forKey: orderKey) ?? []
    order.removeAll { approvalIds.contains($0) }
    UserDefaults.standard.set(order, forKey: orderKey)
    merge(adding: [], removingIds: Set(approvalIds.map { CptApprovalIds.categoryChoicePrefix + $0 }))
  }
}

// MARK: - UNUserNotificationCenter delegate (RNFB 뒤에 체인됨)

final class CptApprovalNotifDelegate: NSObject, UNUserNotificationCenterDelegate {
  static let shared = CptApprovalNotifDelegate()   // 강한 전역 참조 필수(RNFB originalDelegate = weak)
  private override init() { super.init() }

  /// AppDelegate.didFinishLaunchingWithOptions 에서 호출 — RNFB 가 붙기 전에 delegate 를 선점한다.
  static func install() {
    UNUserNotificationCenter.current().delegate = CptApprovalNotifDelegate.shared
    CptApprovalCategories.shared.installStatic()
    // 지난 실행에서 못 보낸 응답이 남아 있으면(프로세스가 먼저 죽은 경우) JS 가 곧 드레인한다.
    if CptApprovalRuntime.shared.hasPending { CptApprovalRuntime.shared.beginBackgroundHold() }
  }

  // ⚠ 이 메서드만 구현한다(willPresent/openSettings 는 RNFB 소관 — 위 주석 ② 참고).
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    // RNFB 는 우리에게 completionHandler 를 넘기고 자기는 호출하지 않는다(:165-171) → 어떤 경로로 빠져나가도
    //  반드시 우리가 호출해야 한다. 누락 시 이후 알림 응답이 전부 멈춘다.
    defer { completionHandler() }

    let info = response.notification.request.content.userInfo
    guard let action = Self.parse(actionIdentifier: response.actionIdentifier, userInfo: info) else {
      return   // 본문 탭(default)/스와이프 삭제(dismiss)는 RNFB 딥링크 경로가 이미 처리했다
    }
    CptApprovalRuntime.shared.enqueue(action)
    CptApprovalRuntime.shared.beginBackgroundHold()
    CptApproval.emitPending()   // 앱이 살아있으면 즉시 전송, 아니면 부팅 직후 드레인
  }

  private static func parse(actionIdentifier: String, userInfo: [AnyHashable: Any]) -> CptApprovalAction? {
    if actionIdentifier == UNNotificationDefaultActionIdentifier
      || actionIdentifier == UNNotificationDismissActionIdentifier { return nil }

    guard let approvalId = str(userInfo["approvalId"]), !approvalId.isEmpty else { return nil }
    let notifId = str(userInfo["notifId"])
    let now = Date().timeIntervalSince1970 * 1000
    let uid = UUID().uuidString

    switch actionIdentifier {
    case CptApprovalIds.actionAllow:
      return CptApprovalAction(uid: uid, approvalId: approvalId, decision: "allow", always: nil,
                               labels: nil, questionIndex: nil, notifId: notifId, at: now)
    case CptApprovalIds.actionAlways:
      // 허용 + 다음부터 묻지 않기 — 플래그만 보낸다(실제 규칙은 데몬이 보관한 claude 제안 그대로).
      return CptApprovalAction(uid: uid, approvalId: approvalId, decision: "allow", always: true,
                               labels: nil, questionIndex: nil, notifId: notifId, at: now)
    case CptApprovalIds.actionDeny:
      return CptApprovalAction(uid: uid, approvalId: approvalId, decision: "deny", always: nil,
                               labels: nil, questionIndex: nil, notifId: notifId, at: now)
    default:
      guard actionIdentifier.hasPrefix(CptApprovalIds.actionAnswerPrefix),
            let idx = Int(actionIdentifier.dropFirst(CptApprovalIds.actionAnswerPrefix.count))
      else { return nil }
      // 라벨은 **그 알림의 payload** 에서 읽는다(카테고리 등록 당시 값이 아니라) → 어긋난 오답 방지.
      guard let labels = optionLabels(userInfo), idx >= 0, idx < labels.count else { return nil }
      return CptApprovalAction(uid: uid, approvalId: approvalId, decision: "answer", always: nil,
                               labels: [labels[idx]], questionIndex: questionIndex(userInfo),
                               notifId: notifId, at: now)
    }
  }

  private static func str(_ v: Any?) -> String? {
    if let s = v as? String { return s }
    if let n = v as? NSNumber { return n.stringValue }
    return nil
  }

  /// FCM data 는 문자열만 실을 수 있으므로 선택지는 JSON 문자열(`options`)로 온다.
  private static func optionLabels(_ userInfo: [AnyHashable: Any]) -> [String]? {
    if let arr = userInfo["options"] as? [String] { return arr }      // 로컬 알림(테스트) 대비
    guard let raw = str(userInfo["options"]), let data = raw.data(using: .utf8) else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String]
  }

  private static func questionIndex(_ userInfo: [AnyHashable: Any]) -> Int {
    if let n = userInfo["questionIndex"] as? NSNumber { return n.intValue }
    if let s = str(userInfo["questionIndex"]), let i = Int(s) { return i }
    return 0
  }
}

// MARK: - RN 브리지 모듈 (JS: NativeModules.CptApproval)

@objc(CptApproval)
class CptApproval: RCTEventEmitter {

  private static weak var instance: CptApproval?
  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool { return false }

  override func supportedEvents() -> [String]! { return ["cptApprovalActions"] }

  override func startObserving() {
    hasListeners = true
    CptApproval.instance = self
    // 리스너가 붙은 순간 남은 큐가 있으면 바로 알린다(부팅 레이스 방어).
    if CptApprovalRuntime.shared.hasPending { sendEvent(withName: "cptApprovalActions", body: nil) }
  }

  override func stopObserving() { hasListeners = false }

  static func emitPending() {
    DispatchQueue.main.async {
      guard let m = CptApproval.instance, m.hasListeners else { return }
      m.sendEvent(withName: "cptApprovalActions", body: nil)
    }
  }

  // 큐 조회(비우지 않는다 — 전송 성공 후 ackActions 로 지운다. 프로세스가 중간에 죽어도 유실 0).
  @objc(pendingActions:rejecter:)
  func pendingActions(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    resolve(CptApprovalRuntime.shared.pendingJs())
  }

  @objc(ackActions:)
  func ackActions(_ uids: NSArray) {
    CptApprovalRuntime.shared.ack(uids.compactMap { $0 as? String })
  }

  // 선택형 승인의 알림 액션 라벨을 미리 등록(pending 승인을 알게 된 시점에 호출).
  @objc(registerChoiceCategory:labels:)
  func registerChoiceCategory(_ approvalId: NSString, labels: NSArray) {
    CptApprovalCategories.shared.registerChoice(
      approvalId: approvalId as String,
      labels: labels.compactMap { $0 as? String }
    )
  }

  @objc(dropChoiceCategories:)
  func dropChoiceCategories(_ approvalIds: NSArray) {
    CptApprovalCategories.shared.dropChoice(approvalIds: approvalIds.compactMap { $0 as? String })
  }
}
