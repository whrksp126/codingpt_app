import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlass, TerminalWindow, Code, Globe, File as FileIcon, DeviceMobile } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import useKeyboardHeight from '../hooks/useKeyboardHeight';
import { haptic } from '../animations/haptics';
import daemonService from '../services/daemonService';
import { tx } from '../text';
import { PALETTE_TEXT } from '../text/palette';
import { commandsFor, formatCombo } from '../palette/commands';
import { useShortcuts, IS_APPLE } from '../palette/shortcuts';
import * as M from '../palette/match';

const TX = tx(PALETTE_TEXT);

// 명령 팔레트 — 워크스페이스 헤더의 돋보기 버튼이 여는 전체 화면 시트.
//
// **창은 하나다**(사용자 확정). 접두어 `>` 로 두 모드가 갈린다:
//  · 그냥 치면  → 열린 탭 + 이 워크스페이스의 파일
//  · `>` 로 치면 → 명령
//
// 스코프는 워크스페이스 단위다 — 그래서 버튼이 헤더의 추가 버튼들 옆에 있다(사이드바 줄이 아니라).
//  기본 모드가 파일 열기라 워크스페이스가 없으면 보여줄 것이 없다.
//
// PC 미러: `codingpt_pc/src/js/palette.js`. 판정(순위·모드)은 palette/match.ts, 명령 표는
//  palette/commands.ts, 문구는 text/palette.ts — **셋 다 PC 와 공유**(대조 테스트).
//
// 폰에서는 드롭다운이 좁아 못 읽으므로 전체 화면 시트로 낸다.
//  다만 목록이 길어 바텀시트보다 위쪽까지 쓰는 편이 낫다 — 검색창이 손가락 근처(하단)에 오도록
//  입력줄을 **아래**에 둔다(키보드가 올라오면 그 바로 위).

export type PaletteSurface = {
  paneId: string;
  /** 혼합 탭 안의 인덱스. 독립 pane 이면 -1. */
  index: number;
  kind: 'terminal' | 'ide' | 'preview' | 'emulator';
  label: string;
  active?: boolean;
};

type Row = {
  key: string;
  section: string;
  score: number;
  sortKey: string;
  icon: React.ReactNode;
  label: string;
  sub?: string;
  hint?: string;
  disabled?: boolean;
  run: () => void;
};

export default function PaletteSheet({
  visible, onClose, wsPath, host, surfaces, tid,
  onActivateSurface, onOpenFile, onRunCommand, isCommandAvailable,
}: {
  visible: boolean;
  onClose: () => void;
  /** 홈-상대 워크스페이스 경로. ''(홈 루트)도 유효한 값이라 그대로 넘긴다. */
  wsPath: string;
  host: number | null;
  surfaces: PaletteSurface[];
  tid: number | null;
  onActivateSurface: (paneId: string, index: number) => void;
  onOpenFile: (rel: string) => void;
  onRunCommand: (id: string) => void;
  isCommandAvailable: (id: string) => boolean;
}) {
  const C = v2.colors;
  const insets = useSafeAreaInsets();
  const binds = useShortcuts();
  // ★ Android(targetSdk 35 edge-to-edge)에서는 adjustResize 가 Modal 창을 줄이지 않는다 →
  //   입력줄이 키보드에 통째로 가린다(실기기에서 확인한 결함: 목록만 보이고 검색창이 안 보였다).
  //   가린 높이만큼 시트 바닥을 올린다(컴포저가 쓰는 것과 같은 훅).
  const kb = useKeyboardHeight();
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<string[] | null>(null);
  const [filesErr, setFilesErr] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const inputRef = useRef<TextInput | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setFiles(null); setFilesErr(null); setTruncated(false);
    let alive = true;
    daemonService.fsTree(wsPath, host)
      .then((r) => { if (!alive) return; setFiles((r.items || []).map((i) => i.path)); setTruncated(!!r.truncated); })
      .catch((e: any) => { if (!alive) return; setFiles([]); setFilesErr(e?.message || TX.empty); });
    const t = setTimeout(() => inputRef.current?.focus(), 220);
    return () => { alive = false; clearTimeout(t); };
  }, [visible, wsPath, host]);

  const { mode, term } = useMemo(() => M.parseQuery(q), [q]);

  const rows: Row[] = useMemo(() => {
    if (mode === M.MODE_COMMAND) {
      const cmds: Row[] = [];
      for (const c of commandsFor('app')) {
        if (!c.palette) continue;
        const label = TX.cmd[c.id] || c.id;
        const groupName = TX.group[c.group] || c.group;
        const score = M.scoreLabeled(label, `${groupName} ${c.id}`, term);
        if (score == null) continue;
        const usable = isCommandAvailable(c.id);
        cmds.push({
          key: 'cmd:' + c.id,
          section: TX.secCommands,
          score, sortKey: label,
          icon: null,
          label,
          sub: groupName,
          hint: binds[c.id] ? formatCombo(binds[c.id], IS_APPLE) : '',
          disabled: !usable,
          run: () => onRunCommand(c.id),
        });
      }
      return M.rankRows(cmds, term, 40);
    }

    const tabs: Row[] = [];
    for (const s of surfaces) {
      const score = M.scoreLabeled(s.label, s.kind, term);
      if (score == null) continue;
      tabs.push({
        key: `tab:${s.paneId}:${s.index}`,
        section: TX.secOpenTabs,
        score, sortKey: s.label,
        icon: s.kind === 'ide' ? <Code size={15} color={C.textDim} />
          : s.kind === 'emulator' ? <DeviceMobile size={15} color={C.textDim} />
          : s.kind === 'preview' ? <Globe size={15} color={C.textDim} />
            : <TerminalWindow size={15} color={C.textDim} />,
        label: s.label,
        hint: s.active ? '●' : '',
        run: () => onActivateSurface(s.paneId, s.index),
      });
    }
    const fr: Row[] = M.rankPaths(files || [], term, 40).map((p) => ({
      key: 'file:' + p,
      section: TX.secFiles,
      score: 0, sortKey: p,
      icon: <FileIcon size={15} color={C.textDim} />,
      label: p.split('/').pop() || p,
      sub: p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '',
      run: () => onOpenFile(p),
    }));
    return [...M.rankRows(tabs, term, 8), ...fr];
  }, [mode, term, surfaces, files, binds, tid, wsPath, host,
    onActivateSurface, onOpenFile, onRunCommand, isCommandAvailable, C.textDim]);

  const choose = useCallback((r: Row) => {
    if (r.disabled) return;
    haptic.keyPress();
    onClose();
    try { r.run(); } catch (_) { /* 실행부가 자기 방식으로 알린다 */ }
  }, [onClose]);

  if (!visible) return null;

  const foot = mode === M.MODE_FILE
    ? (filesErr || (files === null ? TX.loading : truncated ? TX.truncated : ''))
    : '';

  let lastSection: string | null = null;

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: Math.max(insets.top, 12) + 28,
        backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingBottom: kb > 0 ? kb : Math.max(insets.bottom, 12),
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginTop: 10, marginBottom: 8 }} />

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {rows.length === 0 ? (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              {files === null && mode === M.MODE_FILE
                ? <ActivityIndicator size="small" color={C.text3} />
                : <Text style={{ color: C.textDim, fontSize: 13 }}>
                    {mode === M.MODE_FILE && files && files.length === 0 ? TX.emptyFiles : TX.empty}
                  </Text>}
            </View>
          ) : rows.map((r) => {
            const head = r.section !== lastSection ? r.section : null;
            lastSection = r.section;
            return (
              <View key={r.key}>
                {head ? (
                  <Text style={{ color: C.textDim, fontSize: 11, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 3 }}>{head}</Text>
                ) : null}
                <Pressable
                  onPress={() => choose(r)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 9,
                    paddingHorizontal: 8, paddingVertical: 10, borderRadius: 9,
                    opacity: r.disabled ? 0.45 : 1,
                  }}
                >
                  <View style={{ width: 16, alignItems: 'center' }}>{r.icon}</View>
                  <Text numberOfLines={1} style={{ flexShrink: 1, color: C.text, fontSize: 14 }}>{r.label}</Text>
                  {r.sub ? (
                    <Text numberOfLines={1} style={{ flex: 1, color: C.textDim, fontSize: 11.5 }}>{r.sub}</Text>
                  ) : <View style={{ flex: 1 }} />}
                  <Text style={{ color: C.textDim, fontSize: 11.5 }}>
                    {r.disabled ? TX.unavailable : (r.hint || '')}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>

        {foot ? (
          <Text style={{ color: C.textDim, fontSize: 11.5, paddingHorizontal: 18, paddingBottom: 6 }}>{foot}</Text>
        ) : null}

        {/* 입력줄은 **아래**다 — 폰은 키보드가 화면 절반을 먹으므로, 검색창이 위에 있으면 결과가
            키보드에 가려 한두 줄만 보인다. */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 9,
          paddingHorizontal: 14, paddingVertical: 10,
          borderTopWidth: 1, borderTopColor: C.borderControl,
        }}>
          <MagnifyingGlass size={16} color={C.textDim} />
          <TextInput
            ref={inputRef}
            value={q}
            onChangeText={setQ}
            placeholder={mode === M.MODE_COMMAND ? TX.placeholderCommand : TX.placeholder}
            placeholderTextColor={C.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="go"
            onSubmitEditing={() => { const first = rows.find((r) => !r.disabled); if (first) choose(first); }}
            style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 15, padding: 0 }}
          />
          {/* `>` 를 손으로 치기 번거로우니 한 번에 넣는 칩. 창을 하나로 둔 대가를 여기서 갚는다. */}
          <Pressable
            onPress={() => setQ(mode === M.MODE_COMMAND ? '' : '> ')}
            hitSlop={8}
            style={{
              paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7,
              borderWidth: 1, borderColor: C.borderControl,
              backgroundColor: mode === M.MODE_COMMAND ? C.elevated2 : 'transparent',
            }}
          >
            <Text style={{ color: mode === M.MODE_COMMAND ? C.text : C.text2, fontSize: 12 }}>
              {mode === M.MODE_COMMAND ? TX.secCommands : '>'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
