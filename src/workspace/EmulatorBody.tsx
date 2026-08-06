// 모바일 화면 탭 — PC 에 붙어 있는 안드로이드 에뮬레이터/실기기·iOS 시뮬레이터를 보고 조작한다.
//
// 왜 프레임을 **당겨** 오나(푸시가 아니라): 프레임 한 장이 수십~수백 KB 다. 서버가 밀면 느린
//  회선에서 큐에 쌓여 "3초 전 화면"을 보게 되고, 그 지연이 계속 커진다. 한 장을 받고 나서
//  다음 장을 요청하면 회선이 느린 만큼 **저절로 느려질 뿐** 밀리지 않는다.
//
// 좌표는 **0~1 비율**로 보낸다. 여기서 픽셀로 환산하면 표시 배율·회전이 바뀔 때마다 어긋난다 —
//  기기 실제 픽셀을 아는 건 데몬뿐이다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, ScrollView, PixelRatio } from 'react-native';
import {
  DeviceMobile, Power, ArrowClockwise, Square,
  //  상단바 기기 조작 버튼 — 안드로이드 내비 3버튼은 기기에서 보던 모양(◁ ○ ▢)을 그대로 쓴다.
  CaretLeft, Circle, ArrowCounterClockwise, SpeakerHigh, SpeakerLow, DeviceMobileSpeaker,
} from 'phosphor-react-native';

import v2 from '../theme/v2Tokens';
import PressableScale from '../components/ui/PressableScale';
import EmulatorVideo, { type VideoStatus, type EmulatorVideoHandle } from './EmulatorVideo';
import daemonService, { type EmulatorDevice } from '../services/daemonService';
import lanLink from '../services/lanLink';
import { Buffer } from 'buffer';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;

/** 화면이 이만큼 안 바뀌면 굳이 다시 안 그린다 — 배터리·데이터를 아낀다. */
const IDLE_AFTER_MS = 60_000;

/**
 * 프레임 사이 **최소 간격**. 없으면 응답이 빠를 때 루프가 끝없이 돌아 배터리를 태우고 데몬을 두드린다.
 *  ★ 실기기(1.3초/프레임)에서는 절대 안 보인다 — PC 하네스에서 응답을 즉시 돌려주자 탭이 통째로
 *   멈춰서 잡았다(같은 규칙이 emulator-view.js 에도 있다).
 */
const MIN_FRAME_GAP_MS = 120;

/** 에뮬레이터 콜드 부팅을 기다리는 상한. 1분을 넘기는 기기가 흔해서 넉넉히 잡는다. */
const BOOT_WAIT_MS = 150_000;

/**
 * LAN 직결을 이만큼만 기다린다. 넘으면 릴레이로 먼저 그리고, 늦게 열리면 조용히 갈아탄다.
 *  같은 Wi-Fi 면 수십 ms 면 열리고, 아니면 grant 왕복 + TCP 타임아웃까지 몇 초가 걸릴 수 있다 —
 *  그동안 화면이 비어 있는 게 제일 나쁘다.
 */
const LAN_TRY_MS = 1500;

type Props = {
  host?: number | null;
  deviceId: string | null;
  onDeviceChange: (id: string | null, name?: string) => void;
  active: boolean;          // 이 탭이 화면에 보이는가 — 안 보이면 프레임을 안 당긴다
};

/**
 * 라이브 영상이 안 붙은 이유를 **사용자 말로** 바꾼다.
 *  실패는 두 시점에서 온다: 토큰 발급(즉시)과 WS 연결(나중, 데몬이 대답할 때). 두 곳이 각자
 *  문구를 만들면 한쪽만 고쳐지므로 여기 한 곳에서 옮긴다.
 */
function humanVideoNote(raw?: string): string {
  const m = String(raw || '');
  //  구 데몬은 이 스트림 종류를 모른다 — 개발자 문구를 그대로 보여 주는 대신 할 수 있는 일을 말한다.
  if (/지원하지 않는 스트림/.test(m)) {
    return i18n.t('PC 앱을 업데이트하면 화면이 훨씬 부드러워져요. 지금은 한 장씩 받고 있어요.');
  }
  if (!m) return i18n.t('영상 연결이 끊겨 한 장씩 받는 방식으로 돌아갔어요.');
  return m;
}

/**
 * 상단바에 그릴 기기 조작 키 — 기기가 알려 준 목록(`caps.keys`)을 그대로 쓴다.
 *  구 데몬은 목록을 안 준다 → 그때만 안드로이드 3버튼으로 폴백한다(그 시절 동작 유지).
 *  그림을 모르는 키는 안 그린다 — 눌렀는데 오류만 나는 버튼을 만들지 않기 위해서다.
 */
const EMU_KEY_TITLES: Record<string, string> = {
  back: '뒤로', home: '홈', recents: '최근 앱',
  rotateLeft: '왼쪽으로 회전', rotateRight: '오른쪽으로 회전',
  volumeUp: '볼륨 올리기', volumeDown: '볼륨 내리기',
  power: '기기 전원(화면 켜기/끄기)', lock: '잠금(화면 끄기)',
};
function keyRow(dev?: EmulatorDevice | null): string[] {
  const ks = dev && dev.caps && Array.isArray(dev.caps.keys) ? dev.caps.keys : null;
  return (ks && ks.length ? ks : ['recents', 'home', 'back']).filter((k) => EMU_KEY_TITLES[k]);
}

/**
 * ★ 아이콘은 **기기에서 늘 보던 그 모양**이어야 한다(2026-08-06 사용자 지적 — "아이콘만 보고
 *  기능을 알 수 없다"). 우리가 새로 발명한 그림은 아무리 예뻐도 못 읽는다.
 *   · 안드로이드 내비 3버튼 = 기기 화면 아래의 ◁ ○ ▢ 그대로
 *   · 회전은 **좌/우 두 개** — 실제 시뮬레이터 메뉴(Rotate Left/Right)와 안드로이드 패널도 둘이다
 *   · 볼륨은 스피커 + 옆의 +/− (파형 개수로만 구분하면 둘을 나란히 놓고 봐야 알 수 있다)
 */
function EmuKeyIcon({ name }: { name: string }) {
  const c = C.text2;
  if (name === 'back') return <CaretLeft size={16} color={c} weight="fill" />;
  if (name === 'home') return <Circle size={14} color={c} />;
  if (name === 'recents') return <Square size={13} color={c} />;
  if (name === 'rotateLeft') return <ArrowCounterClockwise size={16} color={c} />;
  if (name === 'rotateRight') return <ArrowClockwise size={16} color={c} />;
  if (name === 'volumeUp') return <SpeakerHigh size={15} color={c} />;
  if (name === 'volumeDown') return <SpeakerLow size={15} color={c} />;
  return <DeviceMobileSpeaker size={15} color={c} />;   // power · lock = 기기 옆면 전원 버튼
}

export default function EmulatorBody({ host = null, deviceId, onDeviceChange, active }: Props) {
  const [devices, setDevices] = useState<EmulatorDevice[] | null>(null);
  const [tools, setTools] = useState<Record<string, boolean> | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  /**
   * 받을 프레임의 가로 픽셀 수.
   *
   * ★ 420 고정이었다(2026-08-06 실사고). 3배 밀도 아이폰(1179px)을 420 으로 줄여 보내고 폰의
   *  레티나 화면에서 다시 늘려 그리니 **두 번 뭉개져** 글씨가 안 읽혔다. 보이는 폭 x 화면 배율,
   *  즉 실제로 찍히는 점의 수만큼만 받는다. ref 에 두는 이유는 창 크기가 바뀔 때마다 프레임
   *  루프를 다시 시작시키지 않기 위해서다.
   */
  const wantW = useRef(480);
  /**
   * 켜는 중인 AVD 이름 — **id 가 바뀌기 때문에** 필요하다(2026-08-05 실사고).
   *  꺼진 AVD 는 `avd:Pixel_9a`, 켜지면 `android:emulator-5554` 다. 켜기를 누른 뒤 우리가 들고 있던
   *  id 는 목록에서 사라지고, 화면은 그 죽은 id 를 붙든 채 영원히 '꺼짐' 으로 남아 있었다.
   *  이 이름이 남아 있는 동안은 목록을 다시 읽을 때마다 같은 이름의 새 행을 찾아 **따라간다**.
   */
  const [bootingAvd, setBootingAvd] = useState<string | null>(null);
  /**
   * 라이브 영상(H.264). 붙으면 폴링을 아예 안 돈다.
   *  · `url` = back 릴레이 WS. 실패하면 **조용히 폴링으로 돌아가고 이유를 한 줄 적는다**(빈 화면 금지).
   *  · `size` = 지금 보고 있는 영상 크기 — 입력 좌표는 이 좌표계로 보내야 한다(scrcpy 가 기기
   *    픽셀을 보내면 그 이벤트를 버린다).
   */
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  //  LAN 직결로 프레임을 받는 중인가. 릴레이(videoUrl)와 배타적이다 — 둘 다 켜면 같은 화면에
  //   두 갈래가 들어와 디코더 상태가 섞인다.
  const [videoLan, setVideoLan] = useState(false);
  //  직접 연결(WebRTC) 세션 — 붙으면 영상이 서버를 안 지난다(외부망에서 가장 빠른 길).
  const [videoRtc, setVideoRtc] = useState(false);
  const rtcSession = useRef<string | null>(null);
  const videoRef = useRef<EmulatorVideoHandle>(null);
  //  웹뷰가 붙기 전에 온 프레임 중 **meta 와 config 만** 들고 있다가 붙는 순간 넘긴다.
  //   델타는 버려도 되지만(어차피 못 그린다), config(SPS/PPS)를 놓치면 다음 키프레임까지
  //   — 실측상 몇 분 — 검은 화면이다.
  const preQ = useRef<Array<[Buffer, boolean]>>([]);
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [videoNote, setVideoNote] = useState('');
  const videoOn = !!videoUrl || videoLan || videoRtc;

  const stop = useRef(false);
  const lastTouch = useRef(Date.now());
  // ⚠ 이 둘은 **컴포넌트 안**에 있어야 한다. 모듈 전역에 두면 pane 을 두 개 열었을 때 서로의
  //   터치·비율을 덮어쓴다(그리고 선언보다 먼저 쓰이면 TDZ 로 렌더가 통째로 죽는다).
  const touchStart = useRef<
    { x: number; y: number; t: number; streamed: boolean; lastX?: number; lastY?: number } | null
  >(null);
  /** touch 스트리밍을 모르는 구 데몬을 만났는가 — 그때만 예전 swipe 방식으로 돌아간다. */
  const touchStreamOff = useRef(false);
  /** 앞 요청이 아직 안 끝났으면 그 프레임의 move 는 건너뛴다(큐를 쌓지 않는다). */
  const touchInFlight = useRef(false);
  const frameAspect = useRef<number | null>(null);
  const dev = devices?.find((d) => d.id === deviceId) || null;

  const loadDevices = useCallback(async () => {
    setErr(null);
    try {
      const r = await daemonService.emulatorList(host);
      const list = r.devices || [];
      setDevices(list);
      setTools(r.tools || {});
      //  ★ 복원 직후에는 id 만 있고 이름은 목록을 받아야 안다 — 알게 된 그 순간 탭 제목에 올린다.
      const cur = deviceId ? list.find((d) => d.id === deviceId) : null;
      if (cur) onDeviceChange(cur.id, cur.name);
      return list;
    } catch (e) {
      setDevices([]);
      setErr(String((e as Error)?.message || e));
      return null;
    }
  }, [host, deviceId, onDeviceChange]);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  /**
   * 라이브 영상 붙이기 — 안드로이드는 scrcpy, iOS 는 serve-sim(시뮬레이터 프레임버퍼).
   *  둘 다 같은 바이트([플래그][Annex-B H.264])를 주므로 이 아래 코드는 갈라지지 않는다.
   *  ⚠ 실패를 삼키지 않는다: 왜 느린지 화면에 한 줄 남긴다(그 PC 에 경로가 없으면 폴링으로 남는다).
   */
  useEffect(() => {
    setVideoUrl(null); setVideoLan(false); setVideoRtc(false); setVideoSize(null); setVideoNote('');
    preQ.current = [];
    if (!deviceId || !active || !/^(android|ios):/.test(deviceId)) return;
    let alive = true;
    let lanChan: { close(): void } | null = null;

    //  웹뷰가 아직 안 붙었으면 meta/config 만 남긴다(위 preQ 주석).
    const feed = (b: Buffer, isText: boolean) => {
      const h = videoRef.current;
      if (!h) {
        if (isText || (b.length > 0 && (b[0] & 1) !== 0)) preQ.current.push([b, isText]);
        return;
      }
      if (preQ.current.length) for (const [x, t] of preQ.current.splice(0)) h.push(x, t);
      h.push(b, isText);
    };

    let settled = false;   // 둘 중 하나가 이미 화면을 잡았다

    (async () => {
      //  ① 같은 Wi-Fi 면 LAN 직결. 실측 96~109ms — 릴레이(310~420ms)보다 3~4배 빠르다.
      //     실패는 **조용히** 릴레이로 강등한다(lanLink 규율: 사용자에게 문구를 만들지 않는다).
      if (host != null) {
        try {
          const open = lanLink.openEmu(host, { id: deviceId }, feed, () => {
            //  LAN 이 끊기면 화면을 비우지 말고 릴레이로 갈아탄다.
            if (alive && lanChan) { lanChan = null; settled = false; setVideoLan(false); void relay(); }
          });
          //  ★ LAN 탐색이 오래 걸려도 그림이 늦어선 안 된다(셀룰러·다른 망에서는 grant 왕복 +
          //   TCP connect 타임아웃까지 갈 수 있다). 기다리다 늦게 열리면 그때 갈아탄다.
          const ch = await Promise.race([open, new Promise<null>((r) => setTimeout(() => r(null), LAN_TRY_MS))]);
          if (!alive) { void open.then((c) => c?.close()).catch(() => {}); return; }
          //  경로 선택은 **조용히** 하되 보이지는 않게 하지 않는다 — 어느 길로 갔는지 한 줄 남긴다.
          //   (이 줄이 없어서 "LAN 이 붙었는데 영상은 릴레이로 가고 있다"를 소켓 바이트를 세서야 알았다.)
          //  여기서 'lan 실패' 만 말한다 — 다음에 무엇을 쓸지는 아래 사슬이 정한다(예전 문구는
          //   WebRTC 가 이기는 경우에도 "relay" 라고 찍혀 로그만 보면 경로를 오해했다).
          if (ch) console.log(`[emu] 영상 경로 lan host=${host} dev=${deviceId}`);
          else console.log(`[emu] lan 대기 초과 — 다음 경로로 host=${host}`);
          if (ch) { lanChan = ch; settled = true; setVideoLan(true); return; }
          //  시간 안에 못 열었다 — 릴레이로 가되, 늦게 열리면 그때 조용히 승격한다.
          void open.then((late) => {
            if (!alive || !late) { late?.close(); return; }
            lanChan = late; settled = true;
            setVideoUrl(null); setVideoLan(true);
          }).catch(() => { /* 릴레이 그대로 */ });
        } catch (_) { /* 릴레이로 간다 */ }
      }
      //  ② 밖에서는 직접 연결(WebRTC). P2P 가 뚫리면 서버를 아예 안 지나고, 안 뚫리면 TURN 이
      //     중계한다. 실패는 조용히 릴레이로 내려간다.
      if (!settled && host != null && (await tryWebrtc())) return;
      await relay();
    })();

    /** 직접 연결 시도. 성공하면 true. 어떤 실패도 사용자 문구를 만들지 않는다(릴레이가 받아 준다). */
    async function tryWebrtc(): Promise<boolean> {
      try {
        const off = await daemonService.emulatorWebrtcOffer(deviceId!, host);
        if (!alive) { void daemonService.emulatorWebrtcClose(off.sessionId, host); return false; }
        const { iceServers } = await daemonService.turnCredentials();
        rtcSession.current = off.sessionId;
        setVideoRtc(true);
        //  웹뷰가 붙는 걸 기다렸다 offer 를 넣는다 — 핸들이 없으면 EmulatorVideo 가 보관했다 재생한다.
        const deadline = Date.now() + 4000;
        while (!videoRef.current && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
        if (!alive) return false;
        videoRef.current?.offer(off.sdp, iceServers);
        settled = true;
        console.log(`[emu] 영상 경로 webrtc host=${host} dev=${deviceId}`);
        return true;
      } catch (e) {
        console.log(`[emu] 직접 연결 실패 — 릴레이로: ${(e as Error)?.message || e}`);
        rtcSession.current = null;
        setVideoRtc(false);
        return false;
      }
    }

    async function relay() {
      if (settled) return;   // 그 사이 LAN 이 잡았다
      try {
        const token = await daemonService.emulatorStreamToken(deviceId!, host);
        if (alive) setVideoUrl(daemonService.buildEmulatorStreamWsUrl(token));
      } catch (e) {
        if (alive) setVideoNote(humanVideoNote(String((e as Error)?.message || e)));
      }
    }

    return () => {
      alive = false;
      if (lanChan) { const c = lanChan; lanChan = null; c.close(); }
      //  직접 연결 세션을 남기면 PC 에서 인코더가 계속 돈다.
      if (rtcSession.current) { void daemonService.emulatorWebrtcClose(rtcSession.current, host); rtcSession.current = null; }
    };
  }, [deviceId, active, host]);

  /** 영상이 못 붙거나 끊기면 폴링으로 — 화면이 비는 것보다 느린 게 낫다. */
  const onVideoStatus = useCallback((st: VideoStatus) => {
    //  웹뷰가 만든 answer 를 데몬에 돌려주면 연결이 성립한다(왕복 두 번의 두 번째).
    if (st.type === 'rtc-answer') {
      const sid = rtcSession.current;
      if (sid) void daemonService.emulatorWebrtcAnswer(sid, st.sdp, host).catch(() => { /* 실패는 아래 error 로 온다 */ });
      return;
    }
    if (st.type === 'rtc-unsupported') { setVideoRtc(false); return; }
    if (st.type === 'ready' || st.type === 'size') { setVideoSize({ w: st.width, h: st.height }); return; }
    setVideoUrl(null);
    setVideoLan(false);
    setVideoRtc(false);
    setVideoSize(null);
    setVideoNote(st.type === 'unsupported'
      ? i18n.t('이 기기는 영상 디코딩을 지원하지 않아 화면을 한 장씩 받아요.')
      : humanVideoNote(st.message));
  }, [host]);

  /**
   * 켜는 중이면 다 뜰 때까지 목록을 다시 읽고, 뜨는 순간 **새 id 로 갈아탄다**.
   *  콜드 부팅은 1분이 넘기도 한다 — 고정된 몇 번의 타이머로는 늘 놓친다(그게 '꺼짐' 으로 굳던 이유다).
   */
  useEffect(() => {
    if (!bootingAvd) return;
    let alive = true;
    const started = Date.now();
    (async () => {
      while (alive && Date.now() - started < BOOT_WAIT_MS) {
        await new Promise((r) => setTimeout(r, 2500));
        if (!alive) return;
        const list = await loadDevices();
        if (!alive || !list) continue;
        const hit = list.find((d) => d.avdName === bootingAvd && d.state === 'booted');
        if (hit) {
          setBootingAvd(null);
          lastTouch.current = Date.now();
          if (hit.id !== deviceId) onDeviceChange(hit.id, hit.name);   // ★ 여기서 따라간다
          return;
        }
      }
      if (alive) setBootingAvd(null);   // 시간이 다 됐다 — 목록에 그대로 두고 사용자가 판단하게
    })();
    return () => { alive = false; };
  }, [bootingAvd, loadDevices, deviceId, onDeviceChange]);

  useEffect(() => {
    const px = Math.round((box.w || 0) * PixelRatio.get());
    wantW.current = Math.max(360, Math.min(900, px || 480));
  }, [box.w]);

  // 프레임 루프 — **한 장을 받고 나서** 다음 장을 요청한다(겹쳐 쏘지 않는다).
  useEffect(() => {
    if (!deviceId || !active || videoOn) return;
    stop.current = false;
    let alive = true;
    (async () => {
      while (alive && !stop.current) {
        // 한동안 아무도 안 만졌으면 쉰다 — 배경에서 계속 도는 화면이 데이터를 먹는 게 제일 나쁘다.
        if (Date.now() - lastTouch.current > IDLE_AFTER_MS) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        const t0 = Date.now();
        try {
          const f = await daemonService.emulatorFrame(deviceId, { maxWidth: wantW.current, quality: 68 }, host);
          if (!alive) return;
          setFrame(`data:${f.mime};base64,${f.base64}`);
          setErr(null);
        } catch (e) {
          if (!alive) return;
          setErr(String((e as Error)?.message || e));
          await new Promise((r) => setTimeout(r, 2000));   // 실패했는데 계속 두드리지 않는다
          continue;
        }
        const spent = Date.now() - t0;
        if (spent < MIN_FRAME_GAP_MS) await new Promise((r) => setTimeout(r, MIN_FRAME_GAP_MS - spent));
      }
    })();
    return () => { alive = false; stop.current = true; };
  }, [deviceId, active, host, videoOn]);

  /** 화면 위 좌표 → 0~1. 이미지가 `contain` 으로 들어가므로 **여백을 빼고** 계산해야 한다. */
  const toRatio = useCallback((x: number, y: number) => {
    if (!box.w || !box.h || !dev) return null;
    //  비율은 라이브면 영상 크기, 폴링이면 마지막 프레임 크기로 안다(없으면 꽉 채운 것으로 본다).
    //  ⚠ 이 판정이 캔버스의 `object-fit: contain` 과 **같은 규칙**이어야 여백을 누른 것이 걸러진다.
    const ar = videoSize ? videoSize.w / videoSize.h : frameAspect.current;
    if (!ar) return { x: x / box.w, y: y / box.h };
    const boxAr = box.w / box.h;
    let dw = box.w; let dh = box.h;
    if (boxAr > ar) dw = box.h * ar; else dh = box.w / ar;
    const ox = (box.w - dw) / 2;
    const oy = (box.h - dh) / 2;
    const rx = (x - ox) / dw;
    const ry = (y - oy) / dh;
    if (rx < 0 || rx > 1 || ry < 0 || ry > 1) return null;   // 여백을 눌렀다 — 기기 밖이다
    return { x: rx, y: ry };
  }, [box, dev, videoSize]);

  useEffect(() => {
    if (!frame) return;
    Image.getSize(frame, (w, h) => { if (w && h) frameAspect.current = w / h; }, () => { /* noop */ });
  }, [frame]);

  const send = useCallback(async (body: Record<string, unknown>) => {
    if (!deviceId) return;
    lastTouch.current = Date.now();
    //  ★ 라이브 영상일 때는 **지금 보고 있는 영상 크기**를 같이 보낸다. scrcpy 는 클라이언트가 말한
    //   화면 크기가 인코딩 중인 영상 크기와 다르면 그 입력을 조용히 버린다(눌러도 아무 일이 없다).
    const vs = videoSize ? { videoWidth: videoSize.w, videoHeight: videoSize.h } : {};
    try { await daemonService.emulatorInput({ id: deviceId, ...vs, ...body }, host); setErr(null); return true; }
    catch (e) { setErr(String((e as Error)?.message || e)); return false; }
  }, [deviceId, host, videoSize]);

  /**
   * 터치 한 단계를 흘린다. 좌표가 절대값이라 밀린 move 는 그냥 버려도 화면이 어긋나지 않는다.
   *  ★ **begin 이 실패했을 때만** 스트리밍을 끈다 — move/end 의 일시적 실패로 꺼 버리면
   *   되던 기능이 한 번의 딸꾹질로 영영 레거시가 된다.
   */
  const streamTouch = useCallback((phase: 'begin' | 'move' | 'end', r: { x: number; y: number }) => {
    if (touchStreamOff.current) return false;
    if (phase === 'move' && touchInFlight.current) return true;
    touchInFlight.current = true;
    void send({ type: 'touch', phase, x: r.x, y: r.y }).then((ok) => {
      touchInFlight.current = false;
      if (!ok && phase === 'begin') touchStreamOff.current = true;
    });
    return true;
  }, [send]);

  const power = useCallback(async (action: 'boot' | 'shutdown', target?: EmulatorDevice) => {
    const id = target?.id || deviceId;
    if (!id) return;
    setBusy(true);
    try {
      const r = await daemonService.emulatorPower(id, action, host);
      // 켜는 중이면 그 AVD 이름을 물고 간다(응답에 없으면 행에서 읽는다 — 둘 다 없으면 못 따라간다).
      if (action === 'boot') {
        const avd = (r as { avdName?: string } | undefined)?.avdName
          || target?.avdName
          || (devices || []).find((d) => d.id === id)?.avdName
          || null;
        setBootingAvd(avd);
      }
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally {
      setBusy(false);
      void loadDevices();
    }
  }, [deviceId, host, loadDevices, devices]);

  // ── 기기 선택 ──────────────────────────────────────────────────────────────
  if (!deviceId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: C.base }} contentContainerStyle={{ padding: 14 }}>
        <Text style={{ color: C.text, fontSize: 14, fontWeight: '700', marginBottom: 2 }}>{i18n.t('모바일 화면')}</Text>
        <Text style={{ color: C.textDim, fontSize: 12, marginBottom: 12 }}>
          {i18n.t('이 PC 에 붙어 있는 기기예요. 고르면 화면이 보이고, 눌러서 조작할 수 있어요.')}
        </Text>
        {devices === null ? <ActivityIndicator color={C.text3} /> : null}
        {devices && !devices.length ? (
          <Text style={{ color: C.textDim, fontSize: 12.5, lineHeight: 20 }}>
            {tools && !tools.adb && !tools.simctl
              ? i18n.t('안드로이드 SDK 도 Xcode 도 찾지 못했어요. PC 에 설치하면 여기 나타나요.')
              : i18n.t('켜져 있는 기기가 없어요.')}
          </Text>
        ) : null}
        {(devices || []).map((d) => (
          <PressableScale
            key={d.id}
            onPress={() => { lastTouch.current = Date.now(); onDeviceChange(d.id, d.name); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingVertical: 11, paddingHorizontal: 12, marginBottom: 7,
              borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
            }}
          >
            <DeviceMobile size={17} color={d.state === 'booted' ? C.text : C.textDim} weight={d.state === 'booted' ? 'fill' : 'regular'} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.text, fontSize: 13.5 }} numberOfLines={1}>{d.name}</Text>
              <Text style={{ color: C.textDim, fontSize: 11, marginTop: 1 }}>
                {bootingAvd && d.avdName === bootingAvd ? i18n.t('켜는 중…')
                  : d.state === 'booted' ? i18n.t('켜짐') : i18n.t('꺼짐')}
                {d.caps && d.caps.frame && !d.caps.input ? ` · ${i18n.t('보기 전용')}` : ''}
              </Text>
            </View>
            {/* 꺼진 기기는 목록에서 바로 켠다 — 예전엔 골라 들어가야 전원 버튼이 보였는데,
                꺼진 기기를 고르면 화면이 없어서 "고를 이유가 없는 것을 골라야" 하는 흐름이었다. */}
            {d.state !== 'booted' && !d.physical ? (
              bootingAvd && d.avdName === bootingAvd
                ? <ActivityIndicator size="small" color={C.text3} />
                : (
                  <Pressable onPress={() => void power('boot', d)} hitSlop={10}
                    accessibilityRole="button" accessibilityLabel={`${d.name} ${i18n.t('켜기')}`}>
                    <Power size={16} color={C.text3} />
                  </Pressable>
                )
            ) : null}
          </PressableScale>
        ))}
        {err ? <Text style={{ color: C.error, fontSize: 12, marginTop: 8 }}>{err}</Text> : null}
        <PressableScale onPress={() => void loadDevices()} style={{ alignSelf: 'flex-start', marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ArrowClockwise size={14} color={C.text3} />
          <Text style={{ color: C.text3, fontSize: 12.5 }}>{i18n.t('다시 찾기')}</Text>
        </PressableScale>
      </ScrollView>
    );
  }

  const canInput = !!(dev && dev.caps && dev.caps.input);
  const isBooted = dev ? dev.state === 'booted' : false;

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      {/*  머리줄 — 기기 이름(누르면 목록으로) · **기기 조작 버튼** · 켜기/끄기.
           ★ 조작 버튼을 아래 별도 줄에 두면 그만큼 화면이 줄어든다(2026-08-06 사용자 확정).
             실제 시뮬레이터/에뮬레이터도 조작부를 창 테두리에 붙여 둔다. 맨 오른쪽 전원은
             **에뮬레이터를 끄는** 버튼이라 기기 전원 아이콘과 모양을 다르게 둔다. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, height: 34, borderBottomWidth: 1, borderBottomColor: C.border }}>
        {/*  ★ 기기 이름은 **탭 제목**이 말한다(2026-08-06 사용자 확정) — 여기 또 쓰면 같은 글자가
             두 줄에 겹쳐 조작 버튼 자리만 먹는다. 목록으로 돌아가는 길만 아이콘으로 남긴다. */}
        <PressableScale onPress={() => onDeviceChange(null)} accessibilityLabel={i18n.t('기기 목록으로')}
          style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 6 }}>
          <DeviceMobile size={15} color={C.text2} />
        </PressableScale>
        <View style={{ flex: 1 }} />
        {canInput ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {keyRow(dev).map((k) => (
              <Pressable key={k} onPress={() => void send({ type: 'key', key: k })} hitSlop={6}
                style={{ paddingHorizontal: 4, paddingVertical: 3 }}
                accessibilityRole="button" accessibilityLabel={i18n.t(EMU_KEY_TITLES[k] || k)}>
                <EmuKeyIcon name={k} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {busy ? <ActivityIndicator size="small" color={C.text3} /> : (
          <Pressable onPress={() => void power(isBooted ? 'shutdown' : 'boot')} hitSlop={8}>
            <Power size={15} color={isBooted ? C.text2 : C.text3} weight={isBooted ? 'fill' : 'regular'} />
          </Pressable>
        )}
      </View>

      {/* 화면 — 탭·스와이프를 그대로 기기에 보낸다 */}
      <View
        style={{ flex: 1 }}
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {videoOn || frame ? (
          <View
            style={{ flex: 1 }}
            /*  ★ 손가락을 **따라가는** 입력(2026-08-06). 예전엔 뗄 때 swipe(시작→끝) 한 방만 보내서,
                끄는 동안 화면이 꿈쩍도 안 하고 iOS 제스처 인식기가 몰아친 입력을 무시하기도 했다.
                이제 누르는 순간부터 begin → move… → end 를 그대로 흘린다. 좌표가 절대값이라
                느린 회선에서 중간 move 를 버려도 화면이 어긋나지 않는다(H.264 델타와 정반대). */
            onStartShouldSetResponder={() => canInput}
            onMoveShouldSetResponder={() => canInput}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) => {
              const x = e.nativeEvent.locationX; const y = e.nativeEvent.locationY;
              touchStart.current = { x, y, t: Date.now(), streamed: false };
              const r = toRatio(x, y);
              if (r) touchStart.current.streamed = streamTouch('begin', r);
            }}
            onResponderMove={(e) => {
              const s = touchStart.current;
              if (!s || !s.streamed) return;
              const x = e.nativeEvent.locationX; const y = e.nativeEvent.locationY;
              if (Math.hypot(x - s.lastX!, y - s.lastY!) < 3 && s.lastX != null) return;
              s.lastX = x; s.lastY = y;
              const r = toRatio(x, y);
              if (r) streamTouch('move', r);
            }}
            onResponderRelease={(e) => {
              const s = touchStart.current;
              if (!s) return;
              touchStart.current = null;
              const ex = e.nativeEvent.locationX; const ey = e.nativeEvent.locationY;
              const a = toRatio(s.x, s.y);
              if (!a) return;
              const b = toRatio(ex, ey) || a;
              //  begin 이 (구 데몬이라) 실패했으면 그 드래그도 레거시로 살린다.
              if (s.streamed && !touchStreamOff.current) { streamTouch('end', b); return; }
              // 레거시: 손가락이 많이 움직였으면 스와이프, 아니면 탭. 오래 누르면 롱프레스.
              if (Math.hypot(ex - s.x, ey - s.y) > 24) {
                void send({ type: 'swipe', x: a.x, y: a.y, x2: b.x, y2: b.y, durationMs: Math.max(80, Math.min(800, Date.now() - s.t)) });
                return;
              }
              void send({ type: Date.now() - s.t > 550 ? 'longPress' : 'tap', x: a.x, y: a.y });
            }}
            //  손이 화면 밖으로 나가도 **뗀 것으로** 마무리한다 — 안 그러면 기기가 계속 눌린 줄 안다.
            onResponderTerminate={() => {
              const s = touchStart.current;
              touchStart.current = null;
              if (s && s.streamed && !touchStreamOff.current) {
                const r = toRatio(s.lastX ?? s.x, s.lastY ?? s.y);
                if (r) streamTouch('end', r);
              }
            }}
          >
            {videoOn
              ? <EmulatorVideo ref={videoRef} url={videoUrl} onStatus={onVideoStatus} />
              : <Image source={{ uri: frame! }} style={{ flex: 1 }} resizeMode="contain" fadeDuration={0} />}
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {isBooted ? <ActivityIndicator color={C.text3} /> : (
              <>
                <Text style={{ color: C.textDim, fontSize: 12.5 }}>{i18n.t('꺼져 있어요')}</Text>
                <PressableScale
                  onPress={() => void power('boot')}
                  style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: C.border }}
                >
                  <Text style={{ color: C.text, fontSize: 12.5 }}>{i18n.t('켜기')}</Text>
                </PressableScale>
              </>
            )}
          </View>
        )}
      </View>

      {/*  라이브 영상이 안 붙었으면 **왜** 인지 한 줄 — 느린 까닭을 사용자가 짐작하게 두지 않는다. */}
      {videoNote ? (
        <Text style={{ color: C.textDim, fontSize: 11, paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.border }}>
          {videoNote}
        </Text>
      ) : null}

      {/*  조작 버튼은 **상단바**로 옮겼다(위 머리줄). 여기는 조작이 안 되는 기기의 이유만 적는다. */}
      {!canInput && dev && dev.caps && dev.caps.inputHint ? (
        <Text style={{ color: C.textDim, fontSize: 11.5, textAlign: 'center', paddingVertical: 9, paddingHorizontal: 10 }}>
          {dev.caps.inputHint}
        </Text>
      ) : null}

      {err ? (
        <Text style={{ color: C.error, fontSize: 11.5, paddingHorizontal: 10, paddingBottom: 6 }} numberOfLines={2}>{err}</Text>
      ) : null}
    </View>
  );
}
