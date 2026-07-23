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

  // 오디오 세션/엔진은 전부 메인 스레드에서 직렬 처리(start/stop/재시작) — 입력 포맷 유효성 보장.

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
    // AVAudioSession/AVAudioEngine 는 메인 스레드에서 다뤄야 입력 포맷이 유효하게 잡힌다
    //  (백그라운드 큐에서 setActive 후 inputNode 포맷을 읽으면 sampleRate 0 으로 나와 실패했음).
    DispatchQueue.main.async {
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
    DispatchQueue.main.async {
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

    // Apple SpokenWord 샘플 검증 설정 — .record(재생 불필요) + .measurement(시스템 오디오 처리 off).
    //  이전 .playAndRecord+.defaultToSpeaker+.measurement 조합이 일부 기기(iPad)에서 입력 포맷을
    //  무효(sampleRate 0)로 만들어 installTap 이 ObjC assertion 으로 앱을 즉사시켰다.
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: .duckOthers)
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
    input.removeTap(onBus: 0)
    // 하드웨어 입력 포맷(inputFormat) — 세션 활성 후 항상 유효. outputFormat 은 엔진 시작 전 0 이 될 수 있다.
    let format = input.inputFormat(forBus: 0)
    // 그래도 무효면(세션/하드웨어 미준비) installTap 이 크래시하므로 throw 로 안전 처리.
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw NSError(domain: "CptSpeech", code: 2, userInfo: [NSLocalizedDescriptionKey: "마이크 입력을 준비할 수 없습니다. 다시 시도해 주세요."])
    }
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
        //  0.25s 지연 = 즉시 실패 반복 시 tight-loop 방지 + 오디오 하드웨어 해제 여유.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
          self.finishSegment()
          guard self.running else { self.send("cptSpeechEnd", [:]); return }
          do { try self.beginSession() }
          catch {
            self.running = false
            self.send("cptSpeechError", ["code": "restart_failed", "message": error.localizedDescription])
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
