package com.ghmate.codingpt.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

// ── 네이티브 음성인식(STT) 모듈 ──
//  android.speech.SpeechRecognizer + RecognizerIntent(FREE_FORM, ko-KR, partial=on) 로 연속 인식.
//  · SpeechRecognizer 는 반드시 UI 스레드에서 생성/조작(runOnUiThread).
//  · 한 인식 세션은 발화 종료 시 끝나므로, running 중이면 onResults/onError(no-match·timeout)에서 자동 재시작.
//  · 이벤트 5종을 RCTDeviceEventEmitter 로 JS(nativeSpeech.ts)에 보낸다:
//    cptSpeechPartial{text} · cptSpeechFinal{text} · cptSpeechError{code,message}
//    · cptSpeechVolume{level} · cptSpeechEnd{}
class CptSpeechModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), PermissionListener {

  override fun getName() = "CptSpeech"

  private var recognizer: SpeechRecognizer? = null
  private var running = false          // 사용자가 stop 하기 전까지 true(자동 재시작 게이트)
  private var locale = "ko-KR"
  private var contextual: ArrayList<String> = ArrayList()
  private var permissionPromise: Promise? = null

  private val REQ_AUDIO = 42931

  // ── 읽어 주기(TTS) — 채팅 답변의 [읽어 주기] 버튼. 엔진은 처음 쓸 때 만든다(앱 시작 비용 0).
  //  이벤트: cptTtsEnd{id, done} — 끝까지 읽었으면 done=true, 멈춤·오류면 false.
  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var ttsPending: Triple<String, String, String>? = null   // (id, text, lang) — 엔진 준비 전 요청

  private fun ttsEnd(id: String, done: Boolean) {
    val m = Arguments.createMap(); m.putString("id", id); m.putBoolean("done", done)
    emit("cptTtsEnd", m)
  }

  private fun ttsSpeakNow(id: String, text: String, lang: String) {
    val t = tts ?: return
    try { t.language = Locale.forLanguageTag(lang) } catch (_: Exception) {}
    // 엔진 입력 한도(getMaxSpeechInputLength, 보통 4000자)를 넘으면 조각내어 큐에 넣는다. 마지막 조각 id 만 원래 id.
    val max = try { TextToSpeech.getMaxSpeechInputLength() - 1 } catch (_: Exception) { 3999 }
    val parts = ArrayList<String>()
    var rest = text
    while (rest.length > max) {
      var cut = rest.lastIndexOf('\n', max); if (cut < max / 2) cut = rest.lastIndexOf(' ', max); if (cut < max / 2) cut = max
      parts.add(rest.substring(0, cut)); rest = rest.substring(cut)
    }
    parts.add(rest)
    parts.forEachIndexed { i, p ->
      val uid = if (i == parts.size - 1) id else "$id#$i"
      t.speak(p, if (i == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD, null, uid)
    }
  }

  @ReactMethod
  fun speak(id: String, text: String, lang: String?, promise: Promise) {
    val l = if (lang.isNullOrBlank()) "ko-KR" else lang
    val t = tts
    if (t != null && ttsReady) { ttsSpeakNow(id, text, l); promise.resolve(true); return }
    ttsPending = Triple(id, text, l)
    if (t == null) {
      tts = TextToSpeech(reactApplicationContext) { status ->
        ttsReady = status == TextToSpeech.SUCCESS
        val p = ttsPending; ttsPending = null
        if (!ttsReady) { if (p != null) ttsEnd(p.first, false); return@TextToSpeech }
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) {}
          override fun onDone(utteranceId: String?) { if (utteranceId != null && !utteranceId.contains('#')) ttsEnd(utteranceId, true) }
          @Deprecated("deprecated in API") override fun onError(utteranceId: String?) { if (utteranceId != null) ttsEnd(utteranceId.substringBefore('#'), false) }
          override fun onStop(utteranceId: String?, interrupted: Boolean) { if (utteranceId != null && !utteranceId.contains('#')) ttsEnd(utteranceId, false) }
        })
        if (p != null) ttsSpeakNow(p.first, p.second, p.third)
      }
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun stopSpeaking(promise: Promise) {
    ttsPending = null
    try { tts?.stop() } catch (_: Exception) {}
    promise.resolve(true)
  }

  override fun invalidate() {
    try { tts?.shutdown() } catch (_: Exception) {}
    tts = null; ttsReady = false
    super.invalidate()
  }

  private fun emit(name: String, params: WritableMap?) {
    reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(name, params)
  }

  private fun hasAudioPermission(): Boolean =
      ContextCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) ==
          PackageManager.PERMISSION_GRANTED

  // ── 가용성 ──
  @ReactMethod
  fun isAvailable(promise: Promise) {
    try {
      promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactApplicationContext))
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  // ── 권한(RECORD_AUDIO 런타임) ──
  @ReactMethod
  fun requestPermission(promise: Promise) {
    if (hasAudioPermission()) {
      promise.resolve(true)
      return
    }
    val activity = currentActivity
    if (activity == null || activity !is PermissionAwareActivity) {
      promise.resolve(false)
      return
    }
    permissionPromise = promise
    (activity as PermissionAwareActivity)
        .requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_AUDIO, this)
  }

  override fun onRequestPermissionsResult(
      requestCode: Int,
      permissions: Array<String>,
      grantResults: IntArray
  ): Boolean {
    if (requestCode != REQ_AUDIO) return false
    val granted = grantResults.isNotEmpty() &&
        grantResults[0] == PackageManager.PERMISSION_GRANTED
    permissionPromise?.resolve(granted)
    permissionPromise = null
    return true
  }

  // ── 시작/정지 ──
  @ReactMethod
  fun start(opts: ReadableMap, promise: Promise) {
    if (opts.hasKey("locale")) opts.getString("locale")?.let { if (it.isNotEmpty()) locale = it }
    contextual = ArrayList()
    if (opts.hasKey("contextualStrings")) {
      opts.getArray("contextualStrings")?.let { arr ->
        for (i in 0 until arr.size()) arr.getString(i)?.let { contextual.add(it) }
      }
    }
    if (!hasAudioPermission()) {
      promise.reject("no_permission", "마이크 권한이 없습니다.")
      return
    }
    running = true
    val act = currentActivity
    val runnable = Runnable {
      try {
        beginSession()
        promise.resolve(null)
      } catch (e: Exception) {
        running = false
        promise.reject("start_failed", e.message ?: "음성인식을 시작할 수 없습니다.", e)
      }
    }
    if (act != null) act.runOnUiThread(runnable) else runnable.run()
  }

  @ReactMethod
  fun stop(promise: Promise) {
    running = false
    val act = currentActivity
    val runnable = Runnable {
      teardown()
      promise.resolve(null)
    }
    if (act != null) act.runOnUiThread(runnable) else runnable.run()
  }

  // NativeEventEmitter 규약(iOS 와 동일 인터페이스) — Android 는 별도 구독 관리 불필요, no-op.
  @ReactMethod
  fun addListener(eventName: String?) { /* no-op */ }

  @ReactMethod
  fun removeListeners(count: Int) { /* no-op */ }

  // ── 인식 세션(UI 스레드에서만 호출) ──
  private fun buildIntent(): android.content.Intent =
      android.content.Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactApplicationContext.packageName)
        // 짧은 침묵에 세션이 끝나지 않도록 완료 침묵 시간을 넉넉히(연속 발화 대비).
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
      }

  private fun beginSession() {
    teardown()
    val rec = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)
    rec.setRecognitionListener(listener)
    recognizer = rec
    rec.startListening(buildIntent())
  }

  private fun teardown() {
    try { recognizer?.stopListening() } catch (_: Exception) {}
    try { recognizer?.cancel() } catch (_: Exception) {}
    try { recognizer?.destroy() } catch (_: Exception) {}
    recognizer = null
  }

  // running 중이면 세션 종료 후 자동 재시작(UI 스레드 예약).
  private fun restartIfRunning() {
    if (!running) {
      emit("cptSpeechEnd", Arguments.createMap())
      return
    }
    currentActivity?.runOnUiThread {
      if (running) {
        try { beginSession() } catch (e: Exception) {
          running = false
          val m = Arguments.createMap()
          m.putString("code", "restart_failed")
          m.putString("message", e.message ?: "재시작 실패")
          emit("cptSpeechError", m)
        }
      }
    }
  }

  private val listener = object : RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}

    override fun onRmsChanged(rmsdB: Float) {
      // RecognizerIntent 의 rms 는 대략 -2..10 dB — 0~1 로 스케일.
      val level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
      val m = Arguments.createMap()
      m.putDouble("level", level.toDouble())
      emit("cptSpeechVolume", m)
    }

    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}

    override fun onError(error: Int) {
      // no-match / speech-timeout 은 조용히 재시작(연속 인식 자연스럽게 유지).
      if (error == SpeechRecognizer.ERROR_NO_MATCH ||
          error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
        restartIfRunning()
        return
      }
      // recognizer busy 도 재시작으로 흡수.
      if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
        restartIfRunning()
        return
      }
      val m = Arguments.createMap()
      m.putString("code", error.toString())
      m.putString("message", errorText(error))
      emit("cptSpeechError", m)
      // 치명 오류가 아니면 계속 시도.
      restartIfRunning()
    }

    override fun onPartialResults(partialResults: Bundle?) {
      val text = firstResult(partialResults) ?: return
      if (text.isEmpty()) return
      val m = Arguments.createMap()
      m.putString("text", text)
      emit("cptSpeechPartial", m)
    }

    override fun onResults(results: Bundle?) {
      val text = firstResult(results)
      if (!text.isNullOrEmpty()) {
        val m = Arguments.createMap()
        m.putString("text", text)
        emit("cptSpeechFinal", m)
      }
      restartIfRunning()
    }

    override fun onEvent(eventType: Int, params: Bundle?) {}
  }

  private fun firstResult(bundle: Bundle?): String? {
    val list = bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
    return if (!list.isNullOrEmpty()) list[0] else null
  }

  private fun errorText(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_AUDIO -> "오디오 오류"
    SpeechRecognizer.ERROR_CLIENT -> "클라이언트 오류"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "마이크 권한이 필요합니다."
    SpeechRecognizer.ERROR_NETWORK -> "네트워크 오류"
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "네트워크 시간 초과"
    SpeechRecognizer.ERROR_SERVER -> "서버 오류"
    else -> "음성인식 오류($error)"
  }
}
