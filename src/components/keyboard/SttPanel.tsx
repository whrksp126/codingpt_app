import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing } from 'react-native';
import {
  Microphone,
  Backspace as BackspaceIcon,
  ArrowElbowDownLeft,
  ArrowUUpLeft,
  ArrowBendDownLeft,
  CaretUpDown,
} from 'phosphor-react-native';

import { haptic } from '../../animations/haptics';
import type { KeyTarget } from './KeyAssist';
import type { KeyboardOS } from './SpecialKeyPanel';
import type { ModFlags } from './modifierKeys';
import type { KaPalette, KaSizes } from './keyAssistSettings';
import {
  CODING_TERMS,
  getCurrentSttProvider,
  isSttProviderEnabled,
  listSttProviders,
  setCurrentSttProvider,
  useCurrentSttProvider,
} from '../../services/stt';

// ── 음성입력(STT) 패널 ──
//  SpecialKeyPanel 과 동일하게 OS 키보드가 있던 자리(같은 높이)에 렌더되며,
//  KeyAssistOverlay 가 항상 프리마운트(높이 0)해 두고 kbMode==='stt' 일 때만 펼친다.
//  active=false(패널 접힘) 로 바뀌면 인식을 즉시 정지한다.
//  · partial(중간) 텍스트는 상태줄에만 표시(터미널/에디터에서 되돌리기 어려워 입력창엔 안 넣음).
//  · final 세그먼트가 나오면 그 텍스트를 target.insertText 로 append.

const NO_FLAGS: ModFlags = { ctrl: false, alt: false, meta: false, shift: false, caps: false, fn: false };
const SHIFT_FLAGS: ModFlags = { ...NO_FLAGS, shift: true };

// 브랜드 그린 액센트(로고·스토어 그라디언트 계열) — 인식 중 소나 리플/마이크에 사용.
const ACCENT = '#10B981';
const MIC_SIZE = 88;

interface Props {
  /** 패널이 실제로 펼쳐진 상태 — false 로 바뀌면 인식 정지. */
  active: boolean;
  height: number;
  os: KeyboardOS;
  target: KeyTarget | null;
  palette: KaPalette;
  sizes: KaSizes;
}

// ── 보조키 한 줄(아이콘 버튼) ──
const AuxKey: React.FC<{
  children: React.ReactNode;
  onPress: () => void;
  p: KaPalette;
  h: number;
  disabled?: boolean;
}> = ({ children, onPress, p, h, disabled }) => {
  const [down, setDown] = useState(false);
  return (
    <Pressable
      onPressIn={() => { setDown(true); haptic.keyPress(); }}
      onPressOut={() => setDown(false)}
      onPress={onPress}
      disabled={disabled}
      hitSlop={2}
      style={{
        flex: 1, height: h, minWidth: 0, alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, backgroundColor: down ? p.keyDown : p.key, opacity: disabled ? 0.4 : 1, elevation: 1,
      }}
    >
      {children}
    </Pressable>
  );
};

// 텍스트 라벨 보조키(마침표/쉼표/물음표/스페이스) — 아이콘이 없는 글리프는 글자로.
const AuxLabel: React.FC<{ label: string; onPress: () => void; p: KaPalette; h: number; font: number }> = ({ label, onPress, p, h, font }) => (
  <AuxKey onPress={onPress} p={p} h={h}>
    <Text style={{ color: p.keyText, fontSize: font, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
  </AuxKey>
);

const SttPanel: React.FC<Props> = ({ active, height, os, target, palette: p, sizes: s }) => {
  const provider = useCurrentSttProvider();
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // 콜백에서 항상 최신 타깃/상태 참조(리스너 재구독 없이).
  const targetRef = useRef<KeyTarget | null>(target);
  targetRef.current = target;
  const listeningRef = useRef(false);
  listeningRef.current = listening;

  // 듣는 중 소나 리플(2겹 스태거) + 볼륨 반응 마이크 스케일.
  const r1 = useRef(new Animated.Value(0)).current;
  const r2 = useRef(new Animated.Value(0)).current;
  const volume = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!listening) { r1.stopAnimation(); r2.stopAnimation(); r1.setValue(0); r2.setValue(0); return; }
    const mk = (v: Animated.Value) => Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    const l1 = mk(r1); const l2 = mk(r2);
    l1.start();
    const stagger = setTimeout(() => l2.start(), 800); // 두 번째 링을 반 박자 늦게 → 끊김 없는 물결
    return () => { l1.stop(); l2.stop(); clearTimeout(stagger); };
  }, [listening, r1, r2]);

  const stopListening = useCallback(async () => {
    setListening(false);
    setPartial('');
    try { await provider.stop(); } catch (_) { /* noop */ }
  }, [provider]);

  const startListening = useCallback(async () => {
    setError(null);
    try {
      const ok = await provider.requestPermission();
      if (!ok) { setError('마이크 권한이 필요합니다.'); return; }
      setPartial('');
      setListening(true);
      await provider.start({
        locale: 'ko-KR',
        contextualStrings: CODING_TERMS,
        onPartial: (text) => setPartial(text),
        onFinal: (text) => {
          const t = text.trim();
          if (!t) return;
          // final 세그먼트를 입력 타깃에 append(앞 세그먼트와 띄어쓰기).
          targetRef.current?.insertText?.(t + ' ');
          setPartial('');
        },
        onError: (e) => {
          setError(e.message || '인식 오류');
          setListening(false);
        },
        onVolume: (level) => {
          Animated.timing(volume, { toValue: Math.max(0, Math.min(1, level)), duration: 90, useNativeDriver: true }).start();
        },
        // 세그먼트 종료 — provider(네이티브)가 stop 안 했으면 자동 재시작하므로 여기선 무시.
        onEnd: () => {},
      });
    } catch (e) {
      setListening(false);
      setError(e instanceof Error ? e.message : '음성인식을 시작할 수 없습니다.');
    }
  }, [provider, volume]);

  const toggleMic = useCallback(() => {
    haptic.keyTap();
    if (listeningRef.current) void stopListening();
    else void startListening();
  }, [startListening, stopListening]);

  // 패널이 접히면(active=false) 또는 언마운트 시 인식 정지 — 백그라운드 마이크 방지.
  useEffect(() => {
    if (!active && listeningRef.current) void stopListening();
  }, [active, stopListening]);
  useEffect(() => () => { if (listeningRef.current) void provider.stop().catch(() => {}); }, [provider]);

  // provider 교체 시 진행 중 인식 정지.
  useEffect(() => { if (listeningRef.current) void stopListening(); }, [provider.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const t = targetRef.current;
  const applyKey = (name: 'Backspace' | 'Enter', flags: ModFlags) => t?.applyKey?.(name, flags, os);
  const insert = (text: string) => t?.insertText?.(text);

  const auxH = Math.max(34, s.keyH);
  const iconSz = Math.round(auxH * 0.5);

  const providers = listSttProviders();

  return (
    <View style={{ height, backgroundColor: p.panelBg, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 10 }}>
      {/* 우상단 구석 — 모델(provider) 선택 버튼 */}
      <View style={{ position: 'absolute', top: 8, right: 10, zIndex: 20 }}>
        <Pressable
          onPress={() => { haptic.keyTap(); setPickerOpen((v) => !v); }}
          hitSlop={4}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 8, backgroundColor: p.modOff, elevation: 1 }}
        >
          <Text style={{ color: p.modOffText, fontSize: 12, fontWeight: '700' }}>{provider.label}</Text>
          <CaretUpDown size={13} color={p.modOffText} weight="bold" />
        </Pressable>
        {pickerOpen ? (
          <View style={{ position: 'absolute', top: 34, right: 0, minWidth: 130, backgroundColor: p.key, borderRadius: 10, paddingVertical: 4,
            shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 12 }}>
            {providers.map((pr) => {
              const enabled = isSttProviderEnabled(pr.id);
              const sel = pr.id === provider.id;
              return (
                <Pressable
                  key={pr.id}
                  disabled={!enabled}
                  onPress={() => { haptic.keyTap(); setCurrentSttProvider(pr.id); setPickerOpen(false); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 9, paddingHorizontal: 12, opacity: enabled ? 1 : 0.45 }}
                >
                  <Text style={{ color: p.keyText, fontSize: 13, fontWeight: sel ? '800' : '600' }}>{pr.label}</Text>
                  <Text style={{ color: p.keyText, fontSize: 11, fontWeight: '600' }}>
                    {sel ? '●' : enabled ? '' : '준비 중'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {/* 1) 큰 마이크 버튼 */}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Pressable onPress={toggleMic} hitSlop={8} style={{ width: MIC_SIZE + 4, height: MIC_SIZE + 4, alignItems: 'center', justifyContent: 'center' }}>
          {/* 듣는 중 소나 리플 — 액센트 링 2겹이 부드럽게 퍼지며 사라진다(브랜드 톤 통일) */}
          {listening ? [r1, r2].map((rv, i) => (
            <Animated.View
              key={i}
              pointerEvents="none"
              style={{
                position: 'absolute', width: MIC_SIZE, height: MIC_SIZE, borderRadius: MIC_SIZE / 2,
                borderWidth: 2, borderColor: ACCENT,
                opacity: rv.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
                transform: [{ scale: rv.interpolate({ inputRange: [0, 1], outputRange: [0.85, 2.15] }) }],
              }}
            />
          )) : null}
          {/* 마이크 — 듣는 중엔 액센트 채움 + 볼륨에 따라 은은한 글로우/스케일 */}
          <Animated.View style={{
            width: MIC_SIZE, height: MIC_SIZE, borderRadius: MIC_SIZE / 2, alignItems: 'center', justifyContent: 'center',
            backgroundColor: listening ? ACCENT : p.key,
            shadowColor: ACCENT, shadowOffset: { width: 0, height: 0 },
            shadowOpacity: listening ? 0.55 : 0, shadowRadius: 18, elevation: listening ? 6 : 2,
            transform: [{ scale: listening ? volume.interpolate({ inputRange: [0, 1], outputRange: [1, 1.09] }) : 1 }],
          }}>
            <Microphone size={38} color={listening ? '#FFFFFF' : p.keyText} weight={listening ? 'fill' : 'regular'} />
          </Animated.View>
        </Pressable>

        {/* 2) 상태 텍스트 / 실시간 partial */}
        <View style={{ marginTop: 12, minHeight: 22, paddingHorizontal: 16 }}>
          <Text
            numberOfLines={2}
            style={{ color: error ? '#EF4444' : partial ? p.keyText : p.modOffText, fontSize: 14, fontWeight: partial ? '600' : '500', textAlign: 'center' }}
          >
            {error ? error : partial ? partial : listening ? '듣는 중…' : '말하면 누르세요'}
          </Text>
        </View>
      </View>

      {/* 3) 보조키 한 줄 */}
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        {/* 백스페이스 */}
        <AuxKey onPress={() => applyKey('Backspace', NO_FLAGS)} p={p} h={auxH}>
          <BackspaceIcon size={iconSz} color={p.keyText} weight="regular" />
        </AuxKey>
        {/* 스페이스 */}
        <AuxLabel label="␣" onPress={() => insert(' ')} p={p} h={auxH} font={s.barFont + 3} />
        {/* 줄바꿈(Shift+Enter = 멀티라인 개행, 전송 아님) */}
        <AuxKey onPress={() => applyKey('Enter', SHIFT_FLAGS)} p={p} h={auxH}>
          <ArrowBendDownLeft size={iconSz} color={p.keyText} weight="regular" />
        </AuxKey>
        {/* 마침표 */}
        <AuxLabel label="." onPress={() => insert('.')} p={p} h={auxH} font={s.barFont} />
        {/* 쉼표 */}
        <AuxLabel label="," onPress={() => insert(',')} p={p} h={auxH} font={s.barFont} />
        {/* 물음표 */}
        <AuxLabel label="?" onPress={() => insert('?')} p={p} h={auxH} font={s.barFont} />
        {/* 실행취소 — 터미널/에디터에 신뢰할 수 있는 공용 undo 키가 없어 베스트에포트 no-op.
            (터미널은 Ctrl+Z 가 프로세스 중단이라 위험, 에디터는 웹뷰 자체 undo 경로 없음.) */}
        <AuxKey onPress={() => { /* no-op: 신뢰할 undo 시퀀스 없음 */ }} p={p} h={auxH} disabled>
          <ArrowUUpLeft size={iconSz} color={p.keyText} weight="regular" />
        </AuxKey>
        {/* 엔터(전송, shift 없음) */}
        <AuxKey onPress={() => applyKey('Enter', NO_FLAGS)} p={p} h={auxH}>
          <ArrowElbowDownLeft size={iconSz} color={p.keyText} weight="bold" />
        </AuxKey>
      </View>
    </View>
  );
};

export default SttPanel;
