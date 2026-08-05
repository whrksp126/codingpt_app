/**
 * 모바일 화면 **라이브 영상**(H.264) — WebView 안에서 WebCodecs 로 풀어 <canvas> 에 그린다.
 *
 * 왜 WebView 인가(2026-08-05, 사용자 지적 "PC 에서의 반응은 빠른데 그게 안드로이드에 표현되는 게 느리네"):
 *  폰은 지금까지 `emulator.frame` 을 폴링했다 — 매 장 전체 화면을 떠서 JPEG 로 만들어 base64 로
 *  서버를 거쳐 실어 나른다. 1~2 fps 였고, 화면이 안 바뀌어도 계속 그 값을 태웠다.
 *  PC 는 이미 scrcpy H.264 를 WebCodecs 로 풀어 25fps 를 낸다. RN 에는 WebCodecs 가 없지만
 *  **WebView 에는 있다**(Android WebView=Chrome, iOS WKWebView=Safari 17+). 그래서 PC 와
 *  **같은 디코딩 규칙**을 WebView 안에 그대로 둔다 — 화면 코드가 두 벌이 되지 않게.
 *
 * 프레임이 오는 길은 두 가지다. **바이트는 완전히 같고 전송만 다르다.**
 *  · `url`  = 릴레이(back) WS — 웹뷰가 직접 연다. 셀룰러·외부 접속의 영구 경로.
 *  · ref.push() = LAN 직결(cpt-lan `emu` 채널) — RN 이 받아 웹뷰로 넘긴다. 같은 Wi-Fi 일 때.
 *   (실측 2026-08-05: 릴레이 310~420ms vs LAN 96~109ms. 인코딩 자체는 64ms.)
 *
 * 터치는 이 WebView 가 아니라 **RN 쪽 레이어**가 받는다(EmulatorBody). 제스처 판정(탭/스와이프/
 *  롱프레스)이 이미 거기 있고, 두 곳에서 각자 판정하면 규칙이 갈라진다.
 *
 * ★ WebCodecs 는 **보안 컨텍스트에서만** 존재한다(2026-08-05 실측: 같은 폰에서 http 로 띄운
 *  같은 페이지는 `VideoDecoder` 가 undefined, https 로 띄우면 즉시 디코딩됐다). `source={{html}}`
 *  만 주면 문서 출처가 불투명(opaque)해서 보안 컨텍스트가 아니다 → 반드시 `baseUrl` 을 https 로
 *  준다. 이걸 빼면 조용히 폴링으로 되돌아가고, 아무도 왜인지 모른다.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
//  ★ RN 에는 전역 Buffer 가 없다. 안 가져오면 push() 가 매 프레임 ReferenceError 를 던지는데,
//   lanLink 의 onData 는 그걸 삼켜서 **아무 일도 안 일어난 것처럼** 보인다(2026-08-05 실사고:
//   프레임은 초당 30장 도착하는데 웹뷰로 넘어간 건 0장이었고, 화면은 12초 뒤 폴링으로 떨어졌다).
import { Buffer } from 'buffer';
import { v2 } from '../theme/v2Tokens';

const C = v2.colors;

/**
 * 문서 출처 — **https 여야 한다**(위 주석). 실제로 요청을 보내는 주소가 아니라 출처를 정하는 값이라
 *  도달 가능한 호스트일 필요는 없다. `.invalid` 는 절대 존재할 수 없는 TLD(RFC 2606)라
 *  실수로라도 네트워크를 타지 않는다.
 */
const SECURE_BASE_URL = 'https://emulator.codingpt.invalid/';

export type VideoStatus =
  | { type: 'ready'; width: number; height: number }
  | { type: 'size'; width: number; height: number }
  | { type: 'unsupported' }
  | { type: 'error'; message: string };

/** LAN 직결에서 RN 이 받은 프레임을 웹뷰로 밀어 넣는 손잡이. */
export type EmulatorVideoHandle = { push(payload: Uint8Array | Buffer, isText: boolean): void };

type Props = {
  /** 릴레이 경로: `wss://…/api/daemon/emustream/<token>`. LAN 직결이면 비운다. */
  url?: string | null;
  onStatus: (s: VideoStatus) => void;
};

/**
 * WebView 안에서 도는 코드. PC(emulator-view.js)의 디코딩 규칙과 **같은 계약**을 쓴다:
 *  · 첫 텍스트 메시지 = `{type:'meta'|'error'}`
 *  · 바이너리 = [플래그 1바이트][H.264 Annex-B]   (1=config, 2=keyframe)
 *  · Annex-B 는 첫 IDR 앞에 SPS/PPS 가 있어야 하므로 config 를 첫 키프레임에 붙인다.
 *
 * `url` 이 비면 WS 를 열지 않고 **RN 이 넣어 주는 것만** 받는다(LAN 직결).
 */
function pageHtml(url: string | null): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;height:100%;background:${C.base};overflow:hidden}
  /* 캔버스는 화면에 꽉 채우되 비율을 지킨다 — RN 쪽 좌표 환산(contain)과 같은 규칙이어야 한다. */
  canvas{width:100%;height:100%;object-fit:contain;display:block;touch-action:none}
</style></head><body>
<canvas id="c"></canvas>
<script>
(function () {
  var post = function (o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} };
  if (typeof VideoDecoder !== 'function' || typeof EncodedVideoChunk !== 'function') {
    post({ type: 'unsupported' });
    return;
  }
  var cv = document.getElementById('c');
  //  desynchronized: 합성기 큐를 건너뛰는 저지연 캔버스 힌트. alpha:false 는 합성 한 겹을 덜어 준다.
  //   (지원 안 하는 엔진은 이 키들을 그냥 무시한다 — 폴백 분기가 필요 없다.)
  var ctx = cv.getContext('2d', { alpha: false, desynchronized: true });
  var configBytes = null, sawKey = false, pts = 0, gotFrame = false;
  var dec = new VideoDecoder({
    output: function (f) {
      if (cv.width !== f.displayWidth || cv.height !== f.displayHeight) {
        cv.width = f.displayWidth; cv.height = f.displayHeight;
        post({ type: 'size', width: f.displayWidth, height: f.displayHeight });
      }
      ctx.drawImage(f, 0, 0);
      f.close();
      if (!gotFrame) { gotFrame = true; post({ type: 'ready', width: cv.width, height: cv.height }); }
    },
    error: function (e) { post({ type: 'error', message: String(e && e.message || e) }); },
  });
  dec.configure({ codec: 'avc1.640028', optimizeForLatency: true });

  var giveUp = setTimeout(function () { post({ type: 'error', message: '화면이 오지 않아요' }); }, 12000);

  function onText(s) {
    var m = {}; try { m = JSON.parse(s); } catch (e) { return; }
    if (m.type === 'error') { clearTimeout(giveUp); post({ type: 'error', message: m.message || '' }); }
  }
  function onBinary(b) {
    //  ★ 바이트가 오고 있으면 "화면이 오지 않아요" 라고 말하면 안 된다. 예전엔 **풀 수 있는** 프레임이
    //   와야 이 타이머를 껐는데, 키프레임을 기다리는 동안 12초가 지나 멀쩡한 스트림을 두고 폴링으로
    //   떨어졌다(2026-08-05 실측 — 폰이 실제로 그렇게 됐다).
    clearTimeout(giveUp);
    var flags = b[0], body = b.subarray(1);
    if (flags & 1) { configBytes = body.slice(); return; }
    var isKey = !!(flags & 2);
    if (!sawKey) { if (!isKey) return; sawKey = true; }
    var data = body;
    if (isKey && configBytes) {
      data = new Uint8Array(configBytes.length + body.length);
      data.set(configBytes, 0); data.set(body, configBytes.length);
    }
    pts += 1000;
    try { dec.decode(new EncodedVideoChunk({ type: isKey ? 'key' : 'delta', timestamp: pts, data: data })); } catch (e) {}
  }

  // ── 경로 1: 릴레이 WS(웹뷰가 직접 연다) ──────────────────────────────
  var URL_ = ${JSON.stringify(url || '')};
  if (URL_) {
    //  회선이 못 따라가면 서버가 그 시청자를 끊는다(델타를 버리면 화면이 깨진 채 남기 때문).
    //  그건 영구 실패가 아니라 "다시 붙으라"는 뜻이라 몇 번은 조용히 재접속한다.
    var tries = 0, ws = null;
    (function connect() {
      ws = new WebSocket(URL_);
      ws.binaryType = 'arraybuffer';
      ws.onmessage = function (ev) {
        if (typeof ev.data === 'string') { onText(ev.data); return; }
        tries = 0;                 // 한 장이라도 받았으면 재시도 예산을 되돌린다
        onBinary(new Uint8Array(ev.data));
      };
      ws.onerror = function () { };
      ws.onclose = function () {
        clearTimeout(giveUp);
        //  다시 붙으면 서버가 config 를 먼저 주므로 깨끗하게 시작한다 — 디코더 상태만 되돌린다.
        if (++tries <= 3) { sawKey = false; setTimeout(connect, 400 * tries); return; }
        post({ type: 'error', message: '영상 연결이 끊겼어요' });
      };
    })();
  }

  // ── 경로 2: LAN 직결(RN 이 넣어 준다) ───────────────────────────────
  //  형식: 'T'+본문 = 텍스트, 'B'+base64 = 바이너리. 프레임마다 JSON 을 감싸면 60KB 프레임에
  //   따옴표 이스케이프 비용이 붙어서, 앞 1글자로만 구분한다.
  function b64(s) {
    var raw = atob(s), n = raw.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function fromHost(ev) {
    var d = ev && ev.data; if (typeof d !== 'string' || !d) return;
    var k = d.charAt(0), rest = d.slice(1);
    if (k === 'T') { onText(rest); return; }
    if (k === 'B') { try { onBinary(b64(rest)); } catch (e) {} }
  }
  //  안드로이드는 document, iOS 는 window 로 온다 — 둘 다 단다.
  document.addEventListener('message', fromHost);
  window.addEventListener('message', fromHost);
  //  ★ 페이지가 준비되기 전에 온 프레임은 사라진다. 특히 **config(SPS/PPS)를 놓치면 영원히
  //   검은 화면**이라(다음 키프레임은 몇 분 뒤다), RN 이 config 를 들고 있다가 이 신호에 다시 준다.
  post({ type: 'hello' });
})();
</script></body></html>`;
}

const EmulatorVideo = forwardRef<EmulatorVideoHandle, Props>(function EmulatorVideo({ url, onStatus }, ref) {
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  const webRef = useRef<WebView>(null);
  //  웹뷰가 hello 를 보내기 전 프레임은 버린다(도착해도 못 그린다). 단 **config 만은 보관**했다가
  //   hello 직후에 다시 준다 — 이걸 빼면 LAN 경로에서 첫 화면이 영영 안 뜬다.
  const readyRef = useRef(false);
  const configRef = useRef<string | null>(null);
  const metaRef = useRef<string | null>(null);

  //  url 이 바뀔 때만 페이지를 다시 만든다 — 매 렌더 새 html 이면 WebView 가 통째로 리로드되고
  //  그때마다 디코더가 처음부터 다시 시작한다(첫 키프레임까지 검은 화면).
  const html = useMemo(() => pageHtml(url || null), [url]);

  useImperativeHandle(ref, () => ({
    push(payload, isText) {
      const buf = payload as Buffer;
      if (isText) {
        const s = Buffer.isBuffer(buf) ? buf.toString('utf8') : Buffer.from(buf).toString('utf8');
        metaRef.current = s;
        if (readyRef.current) webRef.current?.postMessage(`T${s}`);
        return;
      }
      const b64 = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf).toString('base64');
      if ((buf[0] & 1) !== 0) configRef.current = b64;   // 1 = config(SPS/PPS)
      if (readyRef.current) webRef.current?.postMessage(`B${b64}`);
    },
  }), []);

  return (
    <View style={{ flex: 1, backgroundColor: C.base }} pointerEvents="none">
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: SECURE_BASE_URL }}
        onMessage={(e) => {
          let msg: { type: string } & Record<string, unknown>;
          try { msg = JSON.parse(e.nativeEvent.data); } catch (_) { return; /* 우리 형식이 아니다 */ }
          if (msg.type === 'hello') {
            readyRef.current = true;
            if (metaRef.current) webRef.current?.postMessage(`T${metaRef.current}`);
            if (configRef.current) webRef.current?.postMessage(`B${configRef.current}`);
            return;
          }
          onStatusRef.current(msg as unknown as VideoStatus);
        }}
        javaScriptEnabled
        androidLayerType="hardware"
        overScrollMode="never"
        scrollEnabled={false}
        //  터치는 RN 레이어가 받는다(제스처 판정이 거기 한 벌이다) → 웹뷰는 그림만 그린다.
        pointerEvents="none"
        style={{ flex: 1, backgroundColor: C.base }}
      />
    </View>
  );
});

export default EmulatorVideo;
