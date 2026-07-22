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
}
