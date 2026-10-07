// TerminalSizeCover — 터미널이 **다른 기기 크기**로 보일 때의 가림막 + "이 기기에 맞추기"(PC owner-cover.js 와 같은 계약).
//
// 한 터미널의 격자 크기는 한 기기(소유자)가 정한다(터미널 v3). 소유자가 아닌 기기에서는 화면이 제 크기가
//  아니라 읽기 어렵다 → 본문을 반투명 면으로 덮고 정중앙에 아이콘 버튼 하나 + 한 줄 설명을 둔다.
//  가림막 아무 곳이나 누르면 크기를 가져온다. "그대로 보기"는 가림막만 걷고 모서리에 작은 버튼을 남긴다.
//
//  · 웹뷰 위라 blur 는 쓰지 않는다(Android WebView 위 실시간 blur 는 스크롤을 끊는다) — 불투명도 높은 면으로 가린다.
//  · 깜빡임 방지: 뷰어 상태가 SETTLE_MS 동안 이어져야 띄운다. 탭을 바꾸면 다시 센다 — 스트림이 새 터미널의
//    스냅샷을 주기 전까지는 직전 탭의 소유 상태가 남아 있기 때문이다. 걷는 건 즉시.
//  · RN 이 그린다(WebView 안에 두면 WKWebView 가 유령 타일을 남긴다 — TerminalWebView 의 onOwner 주석).
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { CornersOut } from 'phosphor-react-native';
import { v2, tint } from '../theme/v2Tokens';
import PressableScale from '../components/ui/PressableScale';
import * as i18n from '../i18n/index.ts';

export const SIZE_COVER_SETTLE_MS = 400;

type Props = {
  /** 이 기기가 크기 소유자가 아니다(소유자가 따로 있다) */
  viewer: boolean;
  /** 소유 기기 이름(없으면 "다른 기기") */
  name: string;
  /** 지금 보고 있는 터미널(탭) — 바뀌면 판정을 다시 기다린다 */
  termKey: number | null;
  /** 터미널 본문이 화면에 있다(채팅 모드·IDE 탭·숨은 pane 이 아니다) */
  active: boolean;
  onClaim: () => void;
  /** 가림막이 뜨는 순간 — 터미널 입력 포커스를 내려 글자가 새지 않게 한다 */
  onCover?: () => void;
};

export default function TerminalSizeCover({ viewer, name, termKey, active, onClaim, onCover }: Props) {
  const C = v2.colors;
  const [settled, setSettled] = useState(false);
  const [peekKey, setPeekKey] = useState<number | null>(null);

  useEffect(() => {
    setSettled(false);
    if (!viewer || !active || termKey == null) return;
    const t = setTimeout(() => setSettled(true), SIZE_COVER_SETTLE_MS);
    return () => clearTimeout(t);
  }, [viewer, active, termKey]);
  // 소유자가 됐다 → 다음에 다시 뷰어가 되면 가림막부터.
  useEffect(() => { if (!viewer) setPeekKey(null); }, [viewer]);

  const show = settled && viewer && active && termKey != null;
  const peek = show && peekKey === termKey;
  const cover = show && !peek;
  useEffect(() => { if (cover) onCover?.(); }, [cover]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!show) return null;
  const label = i18n.t('이 기기에 맞추기');
  const desc = name ? i18n.t('{name} 크기로 보는 중').replace('{name}', name) : i18n.t('다른 기기 크기로 보는 중');

  if (peek) {
    return (
      <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)} pointerEvents="box-none"
        style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 5 }}>
        <PressableScale onPress={onClaim} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={desc}
          style={{ width: 32, height: 32, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center',
            backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderControl }}>
          <CornersOut size={16} color={C.text2} />
        </PressableScale>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(120)}
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 5 }}>
      {/* 가림막 전체가 누르는 자리 — 어디를 눌러도 이 기기 크기로 맞춘다. */}
      <Pressable onPress={onClaim} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={desc}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, backgroundColor: tint(C.base, 0.84) }}>
        <PressableScale onPress={onClaim} scaleTo={0.94} accessible={false}
          style={{ width: 52, height: 52, borderRadius: v2.radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: 10,
            backgroundColor: C.elevated, borderWidth: 1, borderColor: C.borderControl }}>
          <CornersOut size={24} color={C.text} />
        </PressableScale>
        <Text style={{ color: C.text, fontSize: v2.font.size.body, fontWeight: '500' }} numberOfLines={1}>{label}</Text>
        <Text style={{ color: C.text2, fontSize: v2.font.size.caption, marginTop: 3 }} numberOfLines={1}>{desc}</Text>
        <PressableScale onPress={() => setPeekKey(termKey)} hitSlop={8} accessibilityRole="button" accessibilityLabel={i18n.t('그대로 보기')}
          style={{ marginTop: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: v2.radius.md }}>
          <Text style={{ color: C.text3, fontSize: v2.font.size.caption }}>{i18n.t('그대로 보기')}</Text>
        </PressableScale>
      </Pressable>
    </Animated.View>
  );
}
