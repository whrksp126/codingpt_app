import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, ScrollView, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { v2 } from '../theme/v2Tokens';
import { haptic } from '../animations/haptics';
import PressableScale from '../components/ui/PressableScale';
import daemonService, { type QuickCommand, type QuickCommandLimits, type DaemonAgent } from '../services/daemonService';
import { tx } from '../text';
import { QC_TEXT } from '../text/quickCommands';

const TX = tx(QC_TEXT);

// 저장한 명령 — 관리(추가/수정/삭제). PC 미러 = `quick-commands.js` 의 renderManageInto/openEditor.
//
// 설계 규율:
//  · 새로 만들 때 스코프 기본값은 **이 워크스페이스 전용**이다. 전역이 기본이면 프로젝트 전용
//    명령이 다른 워크스페이스에서 계속 튀어나온다(PC 편집기와 같은 판단).
//  · 글자수 상한은 서버(데몬)가 준 limits 를 쓴다 — 클라가 하드코딩하면 데몬이 바뀔 때 갈린다.
//  · 색은 무채색 명암으로만 — accent 는 상태 신호 전용(2026-07-28 색 규율).
export default function QuickCommandsManageSheet({ visible, onClose, ws, host }: {
  visible: boolean;
  onClose: () => void;
  /** 홈-상대 워크스페이스 경로. ''(홈 루트)도 유효한 값. */
  ws: string;
  host: number | null;
}) {
  const C = v2.colors;
  const R = v2.radius;
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<QuickCommand[] | null>(null);
  const [limits, setLimits] = useState<QuickCommandLimits>({});
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuickCommand | 'new' | null>(null);

  const load = useCallback(() => {
    setError(null);
    daemonService.listAllQuickCommands(host)
      .then((r) => { setItems(r.items); setLimits(r.limits); })
      .catch((e) => { setItems([]); setError(e?.message || TX.failed); });
  }, [host]);

  useEffect(() => { if (visible) { setItems(null); load(); } }, [visible, load]);

  const remove = useCallback((it: QuickCommand) => {
    Alert.alert(TX.removeConfirm(it.label), undefined, [
      { text: TX.cancel, style: 'cancel' },
      {
        text: TX.remove,
        style: 'destructive',
        onPress: () => { daemonService.removeQuickCommand(it.id, host).then(setItems).catch(() => load()); },
      },
    ]);
  }, [host, load]);

  const add = useCallback(() => {
    if (limits.maxItems && items && items.length >= limits.maxItems) {
      Alert.alert(TX.limitReached(limits.maxItems));
      return;
    }
    setEditing('new');
  }, [limits.maxItems, items]);

  if (!visible) return null;
  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '84%', backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8,
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 8 }}>{TX.title}</Text>

        {items === null ? (
          <View style={{ paddingVertical: 26, alignItems: 'center' }}><ActivityIndicator size="small" color={C.text3} /></View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {error ? <Text style={{ color: C.text2, fontSize: 13, paddingVertical: 10 }}>{error}</Text> : null}
            {!error && !items.length ? (
              <Text style={{ color: C.textDim, fontSize: 12.5, lineHeight: 18, paddingVertical: 12 }}>{TX.emptyHint}</Text>
            ) : null}
            {items.map((it) => (
              <View key={it.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 10, paddingVertical: 10, borderRadius: R.sm,
                borderWidth: 1, borderColor: C.borderControl, marginBottom: 6,
              }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>{it.label}</Text>
                  <Text numberOfLines={1} style={{ color: C.text2, fontSize: 12, marginTop: 2 }}>
                    {String((it.kind === 'agent' ? it.prompt : it.text) || '').replace(/\s+/g, ' ').trim()}
                  </Text>
                  <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11, marginTop: 3 }}>
                    {(it.kind === 'agent' ? TX.kindAgent : TX.kindShell)
                      + ' · ' + (it.target === 'current' ? TX.targetCurrent : TX.targetNew)
                      + ' · ' + (it.ws == null ? TX.scopeGlobal : TX.scopeWs)}
                  </Text>
                </View>
                <PressableScale onPress={() => setEditing(it)} hitSlop={6}>
                  <Text style={{ color: C.text2, fontSize: 12, paddingHorizontal: 8, paddingVertical: 6 }}>{TX.edit}</Text>
                </PressableScale>
                <PressableScale onPress={() => remove(it)} hitSlop={6}>
                  <Text style={{ color: C.error, fontSize: 12, paddingHorizontal: 6, paddingVertical: 6 }}>{TX.remove}</Text>
                </PressableScale>
              </View>
            ))}
            <PressableScale onPress={add}>
              <View style={{
                paddingVertical: 12, borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl,
                backgroundColor: C.elevated2, alignItems: 'center', marginTop: 4,
              }}>
                <Text style={{ color: C.text, fontSize: 13.5 }}>{TX.add}</Text>
              </View>
            </PressableScale>
          </ScrollView>
        )}
      </View>

      <QuickCommandEditor
        visible={editing != null}
        existing={editing === 'new' ? null : editing}
        ws={ws}
        host={host}
        limits={limits}
        onClose={() => setEditing(null)}
        onSaved={(next) => { setEditing(null); setItems(next); }}
      />
    </Modal>
  );
}

// ── 편집기 ───────────────────────────────────────────────────────────────────
function QuickCommandEditor({ visible, existing, ws, host, limits, onClose, onSaved }: {
  visible: boolean;
  existing: QuickCommand | null;
  ws: string;
  host: number | null;
  limits: QuickCommandLimits;
  onClose: () => void;
  onSaved: (items: QuickCommand[]) => void;
}) {
  const C = v2.colors;
  const R = v2.radius;
  const insets = useSafeAreaInsets();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<'shell' | 'agent'>('shell');
  const [text, setText] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agent, setAgent] = useState('');
  const [target, setTarget] = useState<'new' | 'current'>('new');
  const [scopedToWs, setScopedToWs] = useState(true);
  const [agents, setAgents] = useState<DaemonAgent[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLabel(existing?.label || '');
    setKind(existing?.kind || 'shell');
    setText(existing?.text || '');
    setPrompt(existing?.prompt || '');
    setAgent(existing?.agent || '');
    setTarget(existing?.target || 'new');
    // 새로 만들 땐 이 워크스페이스 전용이 기본(전역은 명시적으로 고르게).
    setScopedToWs(existing ? existing.ws != null : true);
    setError(null);
    daemonService.listAgents(host, false)
      .then((r) => setAgents(r.agents.filter((a) => a.installed)))
      .catch(() => setAgents([]));
  }, [visible, existing, host]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const item: Partial<QuickCommand> = {
        ...(existing ? { id: existing.id } : {}),
        label,
        kind,
        target,
        ws: scopedToWs ? ws : null,
        ...(kind === 'agent' ? { agent, prompt } : { text }),
      };
      const r = await daemonService.saveQuickCommand(item, host);
      onSaved(r.items);
    } catch (e: any) {
      setError(e?.message || TX.failed);
    } finally {
      setSaving(false);
    }
  }, [existing, label, kind, target, scopedToWs, ws, agent, prompt, text, host, onSaved]);

  if (!visible) return null;
  const inputStyle = {
    backgroundColor: C.elevated2, color: C.text, borderRadius: R.sm,
    borderWidth: 1, borderColor: C.borderControl, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
  } as const;

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '90%', backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8,
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 10 }}>
          {existing ? TX.edit : TX.add}
        </Text>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Seg
            left={TX.kindShell} right={TX.kindAgent} rightOn={kind === 'agent'}
            onPick={(isAgent) => setKind(isAgent ? 'agent' : 'shell')}
          />

          <Field label={TX.labelField}>
            <TextInput
              value={label} onChangeText={setLabel} placeholder={TX.labelPlaceholder}
              placeholderTextColor={C.textDim} style={inputStyle} maxLength={limits.maxLabel || 40}
            />
          </Field>

          {kind === 'agent' ? (
            <>
              <Field label={TX.agentPick}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {agents.map((a) => {
                    const on = a.id === agent || (!agent && agents[0]?.id === a.id);
                    return (
                      <PressableScale key={a.id} onPress={() => setAgent(a.id)}>
                        <View style={{
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.sm, borderWidth: 1,
                          borderColor: on ? C.text2 : C.borderControl, backgroundColor: on ? C.elevated2 : 'transparent',
                        }}>
                          <Text style={{ color: on ? C.text : C.textDim, fontSize: 12.5 }}>{a.name}</Text>
                        </View>
                      </PressableScale>
                    );
                  })}
                </View>
              </Field>
              <Field label={TX.agentField}>
                <TextInput
                  value={prompt} onChangeText={setPrompt} placeholder={TX.agentPlaceholder}
                  placeholderTextColor={C.textDim} style={[inputStyle, { minHeight: 84, textAlignVertical: 'top' }]}
                  multiline maxLength={limits.maxAgentPrompt || 4000}
                />
              </Field>
            </>
          ) : (
            <Field label={TX.shellField}>
              <TextInput
                value={text} onChangeText={setText} placeholder={TX.shellPlaceholder}
                placeholderTextColor={C.textDim} style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]}
                multiline autoCapitalize="none" autoCorrect={false} maxLength={limits.maxShellText || 2000}
              />
            </Field>
          )}

          <Field label={TX.targetField}>
            <Seg
              left={TX.targetNew} right={TX.targetCurrent} rightOn={target === 'current'}
              onPick={(isCur) => setTarget(isCur ? 'current' : 'new')}
            />
            <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17, marginTop: 6 }}>
              {target === 'current' ? TX.targetCurrentHint : TX.targetNewHint}
            </Text>
          </Field>

          <Field label={TX.scopeField}>
            <Seg
              left={TX.scopeGlobal} right={TX.scopeWs} rightOn={scopedToWs}
              onPick={(wsOnly) => setScopedToWs(wsOnly)}
            />
          </Field>

          {error ? <Text style={{ color: C.error, fontSize: 12.5, marginTop: 8 }}>{error}</Text> : null}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <PressableScale onPress={onClose}>
              <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: R.sm, borderWidth: 1, borderColor: C.borderControl }}>
                <Text style={{ color: C.text2, fontSize: 13.5 }}>{TX.cancel}</Text>
              </View>
            </PressableScale>
            <PressableScale onPress={() => { if (!saving) { haptic.keyPress(); save(); } }}>
              <View style={{
                paddingHorizontal: 18, paddingVertical: 10, borderRadius: R.sm, borderWidth: 1,
                borderColor: C.text2, backgroundColor: C.elevated2, opacity: saving ? 0.5 : 1,
              }}>
                <Text style={{ color: C.text, fontSize: 13.5 }}>{TX.save}</Text>
              </View>
            </PressableScale>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const C = v2.colors;
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: C.textDim, fontSize: 11.5, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

/** 두 갈래 토글. 켜짐은 무채색 명암으로만 표현한다(accent 는 상태 신호 전용). */
function Seg({ left, right, rightOn, onPick }: {
  left: string; right: string; rightOn: boolean; onPick: (right: boolean) => void;
}) {
  const C = v2.colors;
  const R = v2.radius;
  const btn = (text: string, on: boolean, val: boolean) => (
    <PressableScale key={text} onPress={() => onPick(val)} style={{ flex: 1 }}>
      <View style={{
        paddingVertical: 9, borderRadius: R.sm, borderWidth: 1, alignItems: 'center',
        borderColor: on ? C.text2 : C.borderControl, backgroundColor: on ? C.elevated2 : 'transparent',
      }}>
        <Text style={{ color: on ? C.text : C.textDim, fontSize: 12.5 }}>{text}</Text>
      </View>
    </PressableScale>
  );
  return <View style={{ flexDirection: 'row', gap: 6 }}>{btn(left, !rightOn, false)}{btn(right, rightOn, true)}</View>;
}
