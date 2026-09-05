import Foundation
import GameController
import React

// 물리(외장) 키보드 연결 감지 — JS: NativeModules.HardwareKeyboard.
//
// GCKeyboard(iOS 14+)가 정답 API 다. "키보드 높이가 작으면 외장" 같은 휴리스틱은 플로팅/분할
//  키보드와 기기별 액세서리 바 높이에서 전부 틀린다. 연결/해제는 알림으로 오므로 즉시 반영된다.
//  (시뮬레이터의 I/O ▸ Keyboard ▸ Connect Hardware Keyboard 도 같은 알림을 낸다.)
@objc(HardwareKeyboard)
class HardwareKeyboard: RCTEventEmitter {
  private var listening = false

  @objc override static func requiresMainQueueSetup() -> Bool { return false }
  override func supportedEvents() -> [String]! { return ["hardwareKeyboardChanged"] }

  private var connected: Bool {
    if #available(iOS 14.0, *) { return GCKeyboard.coalesced != nil }
    return false
  }

  @objc func getConnected(_ resolve: @escaping RCTPromiseResolveBlock,
                          rejecter _: @escaping RCTPromiseRejectBlock) {
    resolve(connected)
  }

  override func startObserving() {
    guard !listening else { return }
    listening = true
    if #available(iOS 14.0, *) {
      let c = NotificationCenter.default
      c.addObserver(self, selector: #selector(changed), name: .GCKeyboardDidConnect, object: nil)
      c.addObserver(self, selector: #selector(changed), name: .GCKeyboardDidDisconnect, object: nil)
    }
  }

  override func stopObserving() {
    listening = false
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func changed() {
    guard listening else { return }
    // 해제 알림은 GCKeyboard.coalesced 가 아직 정리되기 전에 올 수 있어 한 틱 뒤에 읽는다.
    DispatchQueue.main.async { [weak self] in
      guard let self = self, self.listening else { return }
      self.sendEvent(withName: "hardwareKeyboardChanged", body: ["connected": self.connected])
    }
  }
}
