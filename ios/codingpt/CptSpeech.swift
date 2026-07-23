import Foundation
import Speech
import AVFoundation
import React

// ── 네이티브 음성인식(STT) 모듈 ──
//  SFSpeechRecognizer(locale) + AVAudioEngine 로 연속 인식(부분 결과 스트리밍).
//  · iOS 는 한 인식 태스크가 ~1분 제한 → 태스크 종료/에러 시(사용자가 stop 안 했으면) 자동 재시작.
//  · requiresOnDeviceRecognition 은 지원 로케일이면 true(오프라인·저지연).
//  · contextualStrings 로 코딩 기술용어 바이어스.
//  이벤트 5종을 RCTEventEmitter 로 JS(nativeSpeech.ts)에 보낸다:
//    cptSpeechPartial{text} · cptSpeechFinal{text} · cptSpeechError{code,message}
//    · cptSpeechVolume{level} · cptSpeechEnd{}
@objc(CptSpeech)
class CptSpeech: RCTEventEmitter {

  private let audioEngine = AVAudioEngine()
  private var recognizer: SFSpeechRecognizer?
  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?

  private var locale: String = "ko-KR"
  private var contextualStrings: [String] = []
  private var running = false          // 사용자가 stop 하기 전까지 true(자동 재시작 게이트)
  private var hasListeners = false

  // 직렬화 큐 — start/stop/재시작이 오디오 엔진을 동시에 건드리지 않게.
  private let queue = DispatchQueue(label: "com.ghmate.codingpt.cptspeech")

  override static func requiresMainQueueSetup() -> Bool { return false }

  override func supportedEvents() -> [String]! {
    return ["cptSpeechPartial", "cptSpeechFinal", "cptSpeechError", "cptSpeechVolume", "cptSpeechEnd"]
  }

  override func startObserving() { hasListeners = true }
  override func stopObserving() { hasListeners = false }

  private func send(_ name: String, _ body: [String: Any]) {
    guard hasListeners else { return }
    sendEvent(withName: name, body: body)
  }

  // MARK: - 가용성

  @objc(isAvailable:rejecter:)
  func isAvailable(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    let rec = SFSpeechRecognizer(locale: Locale(identifier: locale)) ?? SFSpeechRecognizer()
    resolve(rec?.isAvailable ?? false)
  }

  // MARK: - 권한(음성인식 + 마이크)

  @objc(requestPermission:rejecter:)
  func requestPermission(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    SFSpeechRecognizer.requestAuthorization { authStatus in
      guard authStatus == .authorized else {
        resolve(false)
        return
      }
      // 마이크 권한.
      let session = AVAudioSession.sharedInstance()
      if #available(iOS 17.0, *) {
        AVAudioApplication.requestRecordPermission { granted in resolve(granted) }
      } else {
        session.requestRecordPermission { granted in resolve(granted) }
      }
    }
  }

  // MARK: - 시작/정지

  @objc(start:resolver:rejecter:)
  func start(_ opts: NSDictionary, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if let loc = opts["locale"] as? String, !loc.isEmpty { locale = loc }
    if let ctx = opts["contextualStrings"] as? [String] { contextualStrings = ctx }
    queue.async {
      self.running = true
      do {
        try self.beginSession()
        resolve(nil)
      } catch {
        self.running = false
        reject("start_failed", error.localizedDescription, error)
      }
    }
  }

  @objc(stop:rejecter:)
  func stop(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    queue.async {
      self.running = false
      self.teardown()
      resolve(nil)
    }
  }

  // MARK: - 인식 세션

  private func beginSession() throws {
    // 이전 세션 정리(재시작 대비).
    teardown()

    let rec = SFSpeechRecognizer(locale: Locale(identifier: locale)) ?? SFSpeechRecognizer()
    guard let recognizer = rec, recognizer.isAvailable else {
      throw NSError(domain: "CptSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: "음성인식을 사용할 수 없습니다."])
    }
    self.recognizer = recognizer

    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if #available(iOS 13.0, *), recognizer.supportsOnDeviceRecognition {
      request.requiresOnDeviceRecognition = true
    }
    if #available(iOS 13.0, *) {
      request.contextualStrings = contextualStrings
    }
    self.request = request

    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      self?.request?.append(buffer)
      self?.emitVolume(from: buffer)
    }

    audioEngine.prepare()
    try audioEngine.start()

    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self = self else { return }
      if let result = result {
        let text = result.bestTranscription.formattedString
        if result.isFinal {
          if !text.isEmpty { self.send("cptSpeechFinal", ["text": text]) }
        } else {
          self.send("cptSpeechPartial", ["text": text])
        }
      }
      if error != nil || (result?.isFinal ?? false) {
        // 세그먼트 종료 — 사용자가 계속 듣기(running) 중이면 자동 재시작(iOS ~1분 제한 회피).
        self.queue.async {
          self.finishSegment()
          if self.running {
            do { try self.beginSession() }
            catch {
              self.running = false
              self.send("cptSpeechError", ["code": "restart_failed", "message": error.localizedDescription])
            }
          } else {
            self.send("cptSpeechEnd", [:])
          }
        }
      }
    }
  }

  // 오디오 버퍼 RMS → 대략적 볼륨 레벨(0~1) 이벤트.
  private func emitVolume(from buffer: AVAudioPCMBuffer) {
    guard hasListeners, let channelData = buffer.floatChannelData?[0] else { return }
    let frames = Int(buffer.frameLength)
    if frames == 0 { return }
    var sum: Float = 0
    for i in 0..<frames { let s = channelData[i]; sum += s * s }
    let rms = sqrtf(sum / Float(frames))
    // rms(대략 0~0.3)를 0~1 로 스케일.
    let level = min(1.0, rms * 6.0)
    send("cptSpeechVolume", ["level": level])
  }

  // 태스크만 정리(엔진/탭은 재시작에서 재사용 안 하므로 teardown 에서 통합 정리).
  private func finishSegment() {
    task?.finish()
    task = nil
    request?.endAudio()
    request = nil
    audioEngine.stop()
    audioEngine.inputNode.removeTap(onBus: 0)
  }

  private func teardown() {
    task?.cancel()
    task = nil
    request?.endAudio()
    request = nil
    if audioEngine.isRunning { audioEngine.stop() }
    audioEngine.inputNode.removeTap(onBus: 0)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
