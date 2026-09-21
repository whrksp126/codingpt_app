// DesktopSettingsSheet — 폰에서 에이전트 PC 설정(게스트 OS·자원·삭제). PC 의 desktop-sheet.js 폰판(핵심만).
//  데이터는 데몬(desktopSettingsGet/Set·desktopRpc status)에서 온다. 워크스페이스 연결·스냅샷은 PC 에서(폰은 핵심 조작만).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { AppleLogo, LinuxLogo, X } from 'phosphor-react-native';
import v2 from '../theme/v2Tokens';
import daemonService, { type DesktopSettings, type DesktopStatus } from '../services/daemonService';
import { showAppAlert } from '../components/AppAlert';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;
const fmtGB = (b?: number) => (b ? `${Math.round(b / 1024 / 1024 / 1024)} GB` : '-');

export default function DesktopSettingsSheet({ host, os, onClose }: { host: number | null; os?: 'macos' | 'linux'; onClose: () => void }) {
  const osk: 'macos' | 'linux' = os === 'linux' ? 'linux' : 'macos';
  const [cfg, setCfg] = useState<DesktopSettings | null>(null);
  const [st, setStatus] = useState<(DesktopStatus & { hostGB?: number; diskSize?: { allocated?: number } }) | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, status] = await Promise.all([
        daemonService.desktopSettingsGet(host, osk),
        daemonService.desktopRpc<DesktopStatus & { hostGB?: number; diskSize?: { allocated?: number } }>('desktop.status', host, osk),
      ]);
      setCfg(s); setStatus(status); setErr('');
    } catch (e) { setErr(String((e as Error)?.message || e)); }
  }, [host, osk]);
  useEffect(() => { void load(); }, [load]);

  const phase = st?.phase || '';
  const running = phase === 'running';

  const patch = useCallback(async (p: Partial<DesktopSettings>) => {
    setErr('');
    try { const s = await daemonService.desktopSettingsSet(p, host, osk); setCfg(s); } catch (e) { setErr(String((e as Error)?.message || e)); }
  }, [host, osk]);

  const power = useCallback((action: 'boot' | 'shutdown') => {
    const go = async () => {
      setBusy(true); setErr('');
      try { await daemonService.desktopRpc(action === 'boot' ? 'desktop.start' : 'desktop.stop', host, osk); await load(); }
      catch (e) { setErr(String((e as Error)?.message || e)); }
      finally { setBusy(false); }
    };
    void go();
  }, [host, osk, load]);

  const confirmDelete = useCallback(() => {
    showAppAlert({
      title: i18n.t('에이전트 PC 를 삭제할까요?'),
      message: i18n.t('그 안에 설치한 것과 바꾼 설정이 사라집니다. 공유 폴더의 코드는 영향받지 않습니다.'),
      buttons: [{ text: i18n.t('취소'), style: 'cancel' }, { text: i18n.t('삭제'), style: 'destructive', onPress: async () => {
        setBusy(true); setErr('');
        try { await daemonService.desktopDelete(host, osk); onClose(); } catch (e) { setErr(String((e as Error)?.message || e)); setBusy(false); }
      } }],
    });
  }, [host, osk, onClose]);

  const memGB = cfg?.memGB || 16;
  const cpu = cfg?.cpu || 8;
  const idle = Number(cfg?.idleOffMin ?? 60) || 0;
  const memOpts = [8, 12, 16, 24, 32].filter((g) => g <= Math.max(8, Math.floor(((st?.hostGB || 0) * 1024 * 1024 * 1024) / 2 / 1024 / 1024 / 1024) || 32));
  const cpuOpts = [4, 6, 8, 12, 16];
  const idleOpts: [number, string][] = [[0, i18n.t('끄지 않음')], [30, i18n.t('{n}분', { n: 30 })], [60, i18n.t('{n}시간', { n: 1 })], [180, i18n.t('{n}시간', { n: 3 })]];

  const Chip = ({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} disabled={busy}
      style={{ paddingHorizontal: 12, height: 32, borderRadius: 7, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: on ? C.text3 : C.border, backgroundColor: on ? C.elevated2 : C.base }}>
      <Text style={{ color: on ? C.text : C.text2, fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
  const GroupLabel = ({ children }: { children: string }) => (
    <Text style={{ color: C.textDim, fontSize: 11, letterSpacing: 0.4, marginTop: 18, marginBottom: 8 }}>{children}</Text>
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '86%',
        backgroundColor: C.elevated, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {osk === 'linux' ? <LinuxLogo size={17} weight="fill" color={C.text} /> : <AppleLogo size={17} weight="fill" color={C.text} />}
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>{osk === 'linux' ? 'Linux · VM' : 'macOS · VM'}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8}><X size={18} color={C.textDim} /></Pressable>
        </View>
        {!cfg && !err ? (
          <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={C.text3} /></View>
        ) : (
          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}>
            <GroupLabel>{i18n.t('상태')}</GroupLabel>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: running ? C.text : C.textDim }} />
              <Text style={{ flex: 1, color: C.text2, fontSize: 13 }}>
                {running ? i18n.t('실행 중') : phase === 'starting' ? i18n.t('켜는 중…') : phase === 'pulling' ? i18n.t('준비 중…') : i18n.t('꺼짐')}
              </Text>
              {phase !== 'unsupported' && phase !== 'no-tool' ? (
                <Chip label={running ? i18n.t('끄기') : i18n.t('켜기')} on={false} onPress={() => power(running ? 'shutdown' : 'boot')} />
              ) : null}
            </View>

            <GroupLabel>{i18n.t('메모리')}</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {memOpts.map((g) => <Chip key={g} label={`${g} GB`} on={g === memGB} onPress={() => void patch({ memGB: g })} />)}
            </View>

            <GroupLabel>CPU</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {cpuOpts.map((c) => <Chip key={c} label={`${c}${i18n.t('코어')}`} on={c === cpu} onPress={() => void patch({ cpu: c })} />)}
            </View>

            <GroupLabel>{i18n.t('안 쓰면 끄기')}</GroupLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {idleOpts.map(([v, l]) => <Chip key={v} label={l} on={v === idle} onPress={() => void patch({ idleOffMin: v })} />)}
            </View>

            {err ? <Text style={{ color: C.error, fontSize: 12, marginTop: 16 }}>{err}</Text> : null}

            <GroupLabel>{i18n.t('삭제')}</GroupLabel>
            <Pressable onPress={confirmDelete} disabled={busy}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
              <Text style={{ color: C.error, fontSize: 13 }}>
                {i18n.t('에이전트 PC 삭제')}{st?.diskSize?.allocated ? ` (${fmtGB(st.diskSize.allocated)} ${i18n.t('반환')})` : ''}
              </Text>
              {busy ? <ActivityIndicator size="small" color={C.text3} /> : null}
            </Pressable>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
