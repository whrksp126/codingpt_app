import Foundation
import UserNotifications

// 크로스기기 dismiss — 다른 기기(PC)에서 읽음 처리된 알림의, 이미 전달된 배너를 회수한다.
//  원격(FCM/APNs) 알림의 userInfo 에 서버가 넣는 notifId 로 매칭해 removeDeliveredNotifications.
//  서버의 data-only 백그라운드 푸시(content-available)가 JS 핸들러를 깨워 이 모듈을 호출한다.
@objc(NotifTray)
class NotifTray: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc func cancelByNotifIds(_ ids: NSArray) {
    let wanted = Set(ids.compactMap { $0 as? String }.filter { !$0.isEmpty })
    if wanted.isEmpty { return }
    let center = UNUserNotificationCenter.current()
    center.getDeliveredNotifications { delivered in
      let matched = delivered.filter { n in
        if let nid = n.request.content.userInfo["notifId"] as? String { return wanted.contains(nid) }
        return false
      }.map { $0.request.identifier }
      if !matched.isEmpty {
        center.removeDeliveredNotifications(withIdentifiers: matched)
      }
    }
  }

  /// 유령 배너 청소 — dismiss 데이터푸시를 놓친 배너를 인박스 대조로 회수.
  ///  keepIds = 서버 인박스의 **미읽음** 알림 id. userInfo.notifId 가 없는 알림(우리 것 아님)은 불가침.
  @objc func reconcile(_ keepIds: NSArray) {
    let keep = Set(keepIds.compactMap { $0 as? String }.filter { !$0.isEmpty })
    let center = UNUserNotificationCenter.current()
    center.getDeliveredNotifications { delivered in
      let stale = delivered.filter { n in
        guard let nid = n.request.content.userInfo["notifId"] as? String, !nid.isEmpty else { return false }
        // 인박스 조회와 배너 도착의 경합 가드 — 방금(15s 내) 뜬 배너는 목록에 아직 없을 수 있다.
        if Date().timeIntervalSince(n.date) < 15 { return false }
        return !keep.contains(nid)
      }.map { $0.request.identifier }
      if !stale.isEmpty {
        center.removeDeliveredNotifications(withIdentifiers: stale)
      }
    }
  }
}
