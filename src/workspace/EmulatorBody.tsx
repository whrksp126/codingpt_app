// 모바일 화면 탭 — PC 에 붙어 있는 안드로이드 에뮬레이터/실기기·iOS 시뮬레이터를 보고 조작한다.
//
// 왜 프레임을 **당겨** 오나(푸시가 아니라): 프레임 한 장이 수십~수백 KB 다. 서버가 밀면 느린
//  회선에서 큐에 쌓여 "3초 전 화면"을 보게 되고, 그 지연이 계속 커진다. 한 장을 받고 나서
//  다음 장을 요청하면 회선이 느린 만큼 **저절로 느려질 뿐** 밀리지 않는다.
//
// 좌표는 **0~1 비율**로 보낸다. 여기서 픽셀로 환산하면 표시 배율·회전이 바뀔 때마다 어긋난다 —
//  기기 실제 픽셀을 아는 건 데몬뿐이다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { DeviceMobile, Power, ArrowClockwise, House, ArrowLeft, Square } from 'phosphor-react-native';

import v2 from '../theme/v2Tokens';
import PressableScale from '../components/ui/PressableScale';
import daemonService, { type EmulatorDevice } from '../services/daemonService';
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

type Props = {
  host?: number | null;
  deviceId: string | null;
  onDeviceChange: (id: string | null) => void;
  active: boolean;          // 이 탭이 화면에 보이는가 — 안 보이면 프레임을 안 당긴다
};

export default function EmulatorBody({ host = null, deviceId, onDeviceChange, active }: Props) {
  const [devices, setDevices] = useState<EmulatorDevice[] | null>(null);
  const [tools, setTools] = useState<Record<string, boolean> | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const stop = useRef(false);
  const lastTouch = useRef(Date.now());
  // ⚠ 이 둘은 **컴포넌트 안**에 있어야 한다. 모듈 전역에 두면 pane 을 두 개 열었을 때 서로의
  //   터치·비율을 덮어쓴다(그리고 선언보다 먼저 쓰이면 TDZ 로 렌더가 통째로 죽는다).
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const frameAspect = useRef<number | null>(null);
  const dev = devices?.find((d) => d.id === deviceId) || null;

  const loadDevices = useCallback(async () => {
    setErr(null);
    try {
      const r = await daemonService.emulatorList(host);
      setDevices(r.devices || []);
      setTools(r.tools || {});
    } catch (e) {
      setDevices([]);
      setErr(String((e as Error)?.message || e));
    }
  }, [host]);

  useEffect(() => { void loadDevices(); }, [loadDevices]);

  // 프레임 루프 — **한 장을 받고 나서** 다음 장을 요청한다(겹쳐 쏘지 않는다).
  useEffect(() => {
    if (!deviceId || !active) return;
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
          const f = await daemonService.emulatorFrame(deviceId, { maxWidth: 420, quality: 55 }, host);
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
  }, [deviceId, active, host]);

  /** 화면 위 좌표 → 0~1. 이미지가 `contain` 으로 들어가므로 **여백을 빼고** 계산해야 한다. */
  const toRatio = useCallback((x: number, y: number) => {
    if (!box.w || !box.h || !dev) return null;
    // 기기 비율은 마지막 프레임의 실제 크기로 안다(없으면 화면을 꽉 채운 것으로 본다).
    const ar = frameAspect.current;
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
  }, [box, dev]);

  useEffect(() => {
    if (!frame) return;
    Image.getSize(frame, (w, h) => { if (w && h) frameAspect.current = w / h; }, () => { /* noop */ });
  }, [frame]);

  const send = useCallback(async (body: Record<string, unknown>) => {
    if (!deviceId) return;
    lastTouch.current = Date.now();
    try { await daemonService.emulatorInput({ id: deviceId, ...body }, host); setErr(null); }
    catch (e) { setErr(String((e as Error)?.message || e)); }
  }, [deviceId, host]);

  const power = useCallback(async (action: 'boot' | 'shutdown') => {
    if (!deviceId) return;
    setBusy(true);
    try { await daemonService.emulatorPower(deviceId, action, host); }
    catch (e) { setErr(String((e as Error)?.message || e)); }
    finally {
      setBusy(false);
      // 켜는 데 수십 초가 걸린다 — 목록을 몇 번 다시 읽어 상태가 바뀌는 걸 잡는다.
      for (const d of [1500, 5000, 12000, 25000]) setTimeout(() => { void loadDevices(); }, d);
    }
  }, [deviceId, host, loadDevices]);

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
            onPress={() => { lastTouch.current = Date.now(); onDeviceChange(d.id); }}
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
                {d.state === 'booted' ? i18n.t('켜짐') : i18n.t('꺼짐')}
                {d.caps && d.caps.frame && !d.caps.input ? ` · ${i18n.t('보기 전용')}` : ''}
              </Text>
            </View>
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
      {/* 머리줄 — 기기 이름(누르면 목록으로) + 켜기/끄기 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, height: 34, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <PressableScale onPress={() => onDeviceChange(null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          <DeviceMobile size={14} color={C.text2} />
          <Text style={{ color: C.text2, fontSize: 12 }} numberOfLines={1}>{dev ? dev.name : deviceId}</Text>
        </PressableScale>
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
        {frame ? (
          <Pressable
            style={{ flex: 1 }}
            disabled={!canInput}
            onPressIn={(e) => { touchStart.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY, t: Date.now() }; }}
            onPressOut={(e) => {
              const s = touchStart.current;
              if (!s) return;
              touchStart.current = null;
              const ex = e.nativeEvent.locationX; const ey = e.nativeEvent.locationY;
              const dist = Math.hypot(ex - s.x, ey - s.y);
              const a = toRatio(s.x, s.y);
              if (!a) return;
              // 손가락이 많이 움직였으면 스와이프, 아니면 탭. 오래 누르면 롱프레스.
              if (dist > 24) {
                const b = toRatio(ex, ey);
                if (b) void send({ type: 'swipe', x: a.x, y: a.y, x2: b.x, y2: b.y, durationMs: Math.max(80, Math.min(800, Date.now() - s.t)) });
                return;
              }
              void send({ type: Date.now() - s.t > 550 ? 'longPress' : 'tap', x: a.x, y: a.y });
            }}
          >
            <Image source={{ uri: frame }} style={{ flex: 1 }} resizeMode="contain" fadeDuration={0} />
          </Pressable>
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

      {/* 아래 버튼줄 — 안드로이드 3버튼. 조작이 안 되는 기기면 왜 안 되는지 적는다. */}
      {canInput ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', height: 40, borderTopWidth: 1, borderTopColor: C.border }}>
          <Pressable onPress={() => void send({ type: 'key', key: 'recents' })} hitSlop={10}><Square size={16} color={C.text2} /></Pressable>
          <Pressable onPress={() => void send({ type: 'key', key: 'home' })} hitSlop={10}><House size={17} color={C.text2} /></Pressable>
          <Pressable onPress={() => void send({ type: 'key', key: 'back' })} hitSlop={10}><ArrowLeft size={17} color={C.text2} /></Pressable>
        </View>
      ) : dev && dev.caps && dev.caps.inputHint ? (
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
