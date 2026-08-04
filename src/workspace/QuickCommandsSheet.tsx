import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TerminalWindow, Gear } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { haptic } from '../animations/haptics';
import PressableScale from '../components/ui/PressableScale';
import AgentLogo from './AgentLogo';
import daemonService, { type QuickCommand } from '../services/daemonService';
import { tx } from '../text';
import { QC_TEXT } from '../text/quickCommands';

const TX = tx(QC_TEXT);

// 저장한 명령 — 워크스페이스 헤더의 실행 버튼이 여는 바텀시트.
//
// 저장소는 **그 워크스페이스를 호스팅하는 PC 의 데몬 로컬 파일**이다(사용자 확정 2026-08-04).
//  폰은 자기 저장소를 갖지 않는다 — 여기서 고치면 지금 붙어 있는 그 PC 에 즉시 반영된다.
//
// PC 미러: `codingpt_pc/src/js/quick-commands.js` 의 `.pv-menu` 드롭다운. 폰에서 드롭다운은
//  좁아서 못 읽으므로 바텀시트로 낸다(AgentModeSheet 와 같은 판단).
//  ⚠ 목록 순서·문구·동작은 두 파일이 같아야 한다. 문구는 text/quickCommands.ts 에 모여 있다.
export default function QuickCommandsSheet({ visible, onClose, ws, host, tid, onManage }: {
  visible: boolean;
  onClose: () => void;
  /** 홈-상대 워크스페이스 경로. **''(홈 루트)도 유효한 값**이라 그대로 넘긴다. */
  ws: string;
  host: number | null;
  /** 지금 보고 있는 터미널 id — target:'current' 항목의 대상. 없으면 그 항목은 안내를 낸다. */
  tid: number | null;
  onManage: () => void;
}) {
  const C = v2.colors;
  const R = v2.radius;
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<QuickCommand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    daemonService.listQuickCommands(ws, host)
      .then(setItems)
      .catch((e) => { setItems([]); setError(e?.message || TX.failed); });
  }, [ws, host]);

  useEffect(() => {
    if (!visible) { setNotice(null); return; }
    setItems(null);
    load();
  }, [visible, load]);

  const run = useCallback(async (it: QuickCommand) => {
    // target:'current' 인데 보고 있는 터미널이 없으면 **조용히 넘어가지 않는다**.
    if (it.target === 'current' && tid == null) { setNotice(TX.needTerminal); return; }
    haptic.keyPress();
    setRunningId(it.id);
    setNotice(null);
    try {
      const r = await daemonService.runQuickCommand(it.id, ws, it.target === 'current' ? tid : null, host);
      if (r.busy) { setNotice(TX.busy); setRunningId(null); return; }
      // ready:false = 터미널이 준비되기 전에 보냈다는 뜻. 감추지 않고 알린 뒤 닫는다.
      if (r.ready === false) setNotice(TX.notReady);
      else onClose();
    } catch (e: any) {
      setNotice(e?.message || TX.failed);
    } finally {
      setRunningId(null);
    }
  }, [ws, host, tid, onClose]);

  if (!visible) return null;
  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8,
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: C.text }}>{TX.title}</Text>
          <PressableScale onPress={() => { onClose(); onManage(); }} hitSlop={8}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5 }}>
              <Gear size={15} color={C.text3} />
              <Text style={{ color: C.text3, fontSize: 12.5 }}>{TX.manage}</Text>
            </View>
          </PressableScale>
        </View>

        {notice ? (
          <Text style={{ color: C.text3, fontSize: 12.5, lineHeight: 18, paddingHorizontal: 4, paddingBottom: 8 }}>{notice}</Text>
        ) : null}

        {items === null ? (
          <View style={{ paddingVertical: 26, alignItems: 'center' }}><ActivityIndicator size="small" color={C.text3} /></View>
        ) : items.length === 0 ? (
          <View style={{ paddingVertical: 18, paddingHorizontal: 4 }}>
            <Text style={{ color: C.text2, fontSize: 14 }}>{error || TX.empty}</Text>
            {!error ? <Text style={{ color: C.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 5 }}>{TX.emptyHint}</Text> : null}
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {items.map((it) => {
              const isAgent = it.kind === 'agent';
              const busy = runningId === it.id;
              const body = isAgent ? it.prompt : it.text;
              return (
                <Pressable
                  key={it.id}
                  onPress={() => { if (!runningId) run(it); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 11,
                    borderRadius: R.sm, opacity: runningId && !busy ? 0.5 : 1,
                  }}
                >
                  {isAgent && it.agent
                    ? <AgentLogo brand={it.agent} size={17} />
                    : <TerminalWindow size={17} color={C.textDim} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: C.text, fontSize: 14 }}>{it.label}</Text>
                    <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, marginTop: 1 }}>
                      {oneLine(body)}
                    </Text>
                  </View>
                  {busy
                    ? <ActivityIndicator size="small" color={C.text3} />
                    : <Text style={{ color: C.textDim, fontSize: 11 }}>
                        {it.target === 'current' ? TX.targetCurrent : TX.targetNew}
                      </Text>}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function oneLine(s?: string) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}
