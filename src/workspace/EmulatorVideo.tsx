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
 * 터치는 이 WebView 가 아니라 **RN 쪽 레이어**가 받는다(EmulatorBody). 제스처 판정(탭/스와이프/
 *  롱프레스)이 이미 거기 있고, 두 곳에서 각자 판정하면 규칙이 갈라진다.
 *
 * ★ WebCodecs 는 **보안 컨텍스트에서만** 존재한다(2026-08-05 실측: 같은 폰에서 http 로 띄운
 *  같은 페이지는 `VideoDecoder` 가 undefined, https 로 띄우면 즉시 디코딩됐다). `source={{html}}`
 *  만 주면 문서 출처가 불투명(opaque)해서 보안 컨텍스트가 아니다 → 반드시 `baseUrl` 을 https 로
 *  준다. 이걸 빼면 조용히 폴링으로 되돌아가고, 아무도 왜인지 모른다.
 */
import React, { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
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

type Props = {
  /** `wss://…/api/daemon/emustream/<token>` */
  url: string;
  onStatus: (s: VideoStatus) => void;
};

/**
 * WebView 안에서 도는 코드. PC(emulator-view.js)의 디코딩 규칙과 **같은 계약**을 쓴다:
 *  · 첫 텍스트 메시지 = `{type:'meta'|'error'}`
 *  · 바이너리 = [플래그 1바이트][H.264 Annex-B]   (1=config, 2=keyframe)
 *  · Annex-B 는 첫 IDR 앞에 SPS/PPS 가 있어야 하므로 config 를 첫 키프레임에 붙인다.
 */
function pageHtml(url: string): string {
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
  var ctx = cv.getContext('2d');
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

  //  회선이 못 따라가면 서버가 그 시청자를 끊는다(델타를 버리면 화면이 깨진 채 남기 때문).
  //  그건 영구 실패가 아니라 "다시 붙으라"는 뜻이라 몇 번은 조용히 재접속한다.
  var tries = 0, ws = null, giveUp = null;
  function connect() {
    ws = new WebSocket(${JSON.stringify(url)});
    ws.binaryType = 'arraybuffer';
    giveUp = setTimeout(function () { post({ type: 'error', message: '화면이 오지 않아요' }); }, 12000);
    ws.onmessage = onMessage;
    ws.onerror = function () { };
    ws.onclose = function () {
      clearTimeout(giveUp);
      //  다시 붙으면 서버가 config 를 먼저 주므로 깨끗하게 시작한다 — 디코더 상태만 되돌린다.
      if (++tries <= 3) { sawKey = false; setTimeout(connect, 400 * tries); return; }
      post({ type: 'error', message: '영상 연결이 끊겼어요' });
    };
  }
  function onMessage(ev) {
    if (typeof ev.data === 'string') {
      var m = {}; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.type === 'error') { clearTimeout(giveUp); post({ type: 'error', message: m.message || '' }); }
      return;
    }
    var b = new Uint8Array(ev.data);
    var flags = b[0], body = b.subarray(1);
    if (flags & 1) { configBytes = body.slice(); return; }
    var isKey = !!(flags & 2);
    if (!sawKey) { if (!isKey) return; sawKey = true; }
    var data = body;
    if (isKey && configBytes) {
      data = new Uint8Array(configBytes.length + body.length);
      data.set(configBytes, 0); data.set(body, configBytes.length);
    }
    clearTimeout(giveUp);
    tries = 0;                 // 한 장이라도 받았으면 재시도 예산을 되돌린다
    pts += 1000;
    try { dec.decode(new EncodedVideoChunk({ type: isKey ? 'key' : 'delta', timestamp: pts, data: data })); } catch (e) {}
  };
  connect();
})();
</script></body></html>`;
}

export default function EmulatorVideo({ url, onStatus }: Props) {
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  //  url 이 바뀔 때만 페이지를 다시 만든다 — 매 렌더 새 html 이면 WebView 가 통째로 리로드되고
  //  그때마다 디코더가 처음부터 다시 시작한다(첫 키프레임까지 검은 화면).
  const html = useMemo(() => pageHtml(url), [url]);
  return (
    <View style={{ flex: 1, backgroundColor: C.base }} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: SECURE_BASE_URL }}
        onMessage={(e) => {
          try { onStatusRef.current(JSON.parse(e.nativeEvent.data)); } catch (_) { /* 우리 형식이 아니다 */ }
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
}
