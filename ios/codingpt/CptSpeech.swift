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
  // 무음(발화 멈춤) 감지 — 마지막 인식 후 일정 시간 새 결과가 없으면 endAudio 로 세그먼트를 확정시킨다.
  //  (iOS SFSpeechRecognizer 는 연속 오디오 중 isFinal 을 잘 안 쏴서, Android onResults 처럼 "말 멈추면 확정"을
  //   직접 유도해야 포커스된 입력에 텍스트가 삽입된다.)
  private var silenceWork: DispatchWorkItem?
  private let silenceDelay: TimeInterval = 1.2
  private var lastPartial = ""        // 현재 태스크의 최신 전체 인식 텍스트(누적)
  private var committedText = ""      // 이미 삽입(확정)한 접두부 — 멈출 때마다 그 이후(델타)만 삽입
  private var volumeTick = 0          // 볼륨 이벤트 스로틀 카운터

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

  // 리스닝 시작 — 오디오 엔진/탭(1회) + 첫 인식.
  private func beginSession() throws {
    teardown()
    try startAudio()
    try startRecognition()
  }

  // 오디오 세션/엔진/탭 — 리스닝 동안 계속 유지(세그먼트 전환 때 재시작하지 않아 끊김이 없다).
  //  탭 콜백은 항상 "현재 request"(self.request)에 버퍼를 붙이므로, 세그먼트 교체 시 request 만 바꾸면 된다.
  private func startAudio() throws {
    // Apple SpokenWord 샘플 검증 설정 — .record + .measurement(입력 포맷 무효/크래시 회피).
    let session = AVAudioSession.sharedInstance()
    try session.setCategory(.record, mode: .measurement, options: .duckOthers)
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    let input = audioEngine.inputNode
    input.removeTap(onBus: 0)
    let format = input.inputFormat(forBus: 0) // 하드웨어 입력 포맷 — 세션 활성 후 유효
    guard format.sampleRate > 0, format.channelCount > 0 else {
      throw NSError(domain: "CptSpeech", code: 2, userInfo: [NSLocalizedDescriptionKey: "마이크 입력을 준비할 수 없습니다. 다시 시도해 주세요."])
    }
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      self?.request?.append(buffer)
      self?.emitVolume(from: buffer)
    }
    audioEngine.prepare()
    if !audioEngine.isRunning { try audioEngine.start() }
  }

  // 인식 request/task — "연속 인식" 하나를 유지한다(pause 마다 재시작하지 않음).
  //  누적 텍스트에서 이미 삽입한 committedText 이후(델타)만 멈출 때 삽입 → Android 처럼 매끄럽고 렉 없음.
  //  태스크는 iOS ~1분 제한/에러 때만 재시작(그때 committedText 리셋).
  private func startRecognition() throws {
    if recognizer == nil {
      recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) ?? SFSpeechRecognizer()
    }
    guard let recognizer = recognizer, recognizer.isAvailable else {
      throw NSError(domain: "CptSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: "음성인식을 사용할 수 없습니다."])
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if #available(iOS 13.0, *), recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
    if #available(iOS 13.0, *) { request.contextualStrings = contextualStrings }
    self.request = request
    lastPartial = ""
    committedText = ""

    task = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self = self else { return }
      if let result = result {
        let full = result.bestTranscription.formattedString
        self.lastPartial = full
        // 패널엔 "아직 삽입 안 된 현재 구간"만 표시(누적 전체가 아니라).
        self.send("cptSpeechPartial", ["text": self.pending(full)])
        if result.isFinal {
          DispatchQueue.main.async { self.commitPending(); self.restartRecognition() } // 1분 제한 등 → 확정+재시작
          return
        }
        if !full.isEmpty { DispatchQueue.main.async { self.armSilence() } } // 멈추면 델타 확정(재시작 없음)
      }
      if let err = error {
        DispatchQueue.main.async {
          self.commitPending()
          guard self.running else { self.teardown(); self.send("cptSpeechEnd", [:]); return }
          self.restartRecognition(fullReset: true, errorMessage: err.localizedDescription)
        }
      }
    }
  }

  // 누적 인식(full)에서 이미 삽입한 committedText 이후의 새 텍스트(델타, 트림).
  private func pending(_ full: String) -> String {
    let tail = full.hasPrefix(committedText) ? String(full.dropFirst(committedText.count)) : full
    return tail.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  // 멈춤/종료 시 — 현재 델타를 확정 삽입(태스크는 그대로 유지, 재시작 없음).
  private func commitPending() {
    silenceWork?.cancel(); silenceWork = nil
    let t = pending(lastPartial)
    if !t.isEmpty { send("cptSpeechFinal", ["text": t]) }
    committedText = lastPartial
  }

  // 태스크만 새로(1분 제한/에러 후) — 오디오 엔진/탭은 유지. committedText 리셋.
  private func restartRecognition(fullReset: Bool = false, errorMessage: String? = nil) {
    task?.cancel(); task = nil
    request?.endAudio(); request = nil
    committedText = ""; lastPartial = ""
    guard running else { teardown(); send("cptSpeechEnd", [:]); return }
    do {
      if fullReset { try beginSession() } else { try startRecognition() }
    } catch {
      running = false; teardown()
      send("cptSpeechError", ["code": "restart_failed", "message": errorMessage ?? error.localizedDescription])
    }
  }

  // 오디오 버퍼 RMS → 대략적 볼륨 레벨(0~1) 이벤트.
  //  버퍼는 초당 ~40+회 오므로 매번 이벤트를 쏘면 JS 애니메이션이 폭주해 버벅인다 → 4개마다 1회로 스로틀.
  private func emitVolume(from buffer: AVAudioPCMBuffer) {
    guard hasListeners, let channelData = buffer.floatChannelData?[0] else { return }
    volumeTick &+= 1
    guard volumeTick % 4 == 0 else { return }
    let frames = Int(buffer.frameLength)
    if frames == 0 { return }
    var sum: Float = 0
    for i in 0..<frames { let s = channelData[i]; sum += s * s }
    let rms = sqrtf(sum / Float(frames))
    // rms(대략 0~0.3)를 0~1 로 스케일.
    let level = min(1.0, rms * 6.0)
    send("cptSpeechVolume", ["level": level])
  }

  // 무음 감지 타이머 — 마지막 인식 후 silenceDelay 동안 새 결과가 없으면 델타를 확정 삽입(재시작 없음).
  private func armSilence() {
    silenceWork?.cancel()
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.running else { return }
      self.commitPending()
    }
    silenceWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + silenceDelay, execute: work)
  }

  private func teardown() {
    silenceWork?.cancel(); silenceWork = nil
    task?.cancel()
    task = nil
    request?.endAudio()
    request = nil
    if audioEngine.isRunning { audioEngine.stop() }
    audioEngine.inputNode.removeTap(onBus: 0)
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
