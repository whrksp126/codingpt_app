// DesktopSettingsSheet — 폰에서 에이전트 PC 설정(게스트 OS·자원·삭제). PC 의 desktop-sheet.js 폰판(핵심만).
//  데이터는 데몬(desktopSettingsGet/Set·desktopRpc status)에서 온다. 워크스페이스 연결·스냅샷은 PC 에서(폰은 핵심 조작만).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { AppleLogo, LinuxLogo, X } from 'phosphor-react-native';
import v2 from '../theme/v2Tokens';
import daemonService, { type DesktopSettings, type DesktopStatus } from '../services/daemonService';
import { showAppAlert } from '../components/AppAlert';
import { Sheet, PressableRow, SectionHeader, IconButton } from '../components/ui';
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
      style={{ paddingHorizontal: 12, height: 32, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: on ? C.borderControl : C.border, backgroundColor: on ? C.selected : 'transparent' }}>
      <Text style={{ color: on ? C.text : C.text2, fontSize: v2.font.size.small, fontWeight: on ? '500' : '400' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet
      visible
      onClose={onClose}
      maxHeightPct={0.86}
      header={
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {osk === 'linux' ? <LinuxLogo size={17} weight="fill" color={C.text} /> : <AppleLogo size={17} weight="fill" color={C.text} />}
            <Text style={{ color: C.text, fontSize: v2.font.size.h2, fontWeight: '600' }}>{osk === 'linux' ? 'Linux · VM' : 'macOS · VM'}</Text>
          </View>
          <IconButton icon={X} accessibilityLabel={i18n.t('닫기')} onPress={onClose} size={32} iconSize={18} />
        </View>
      }
    >
      {!cfg && !err ? (
        <View style={{ padding: 30, alignItems: 'center' }}><ActivityIndicator color={C.text3} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
          <SectionHeader title={i18n.t('상태')} style={{ paddingHorizontal: 0, marginTop: 4 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: running ? C.success : C.textDim }} />
            <Text style={{ flex: 1, color: C.text2, fontSize: v2.font.size.small }}>
              {running ? i18n.t('실행 중') : phase === 'starting' ? i18n.t('켜는 중…') : phase === 'pulling' ? i18n.t('준비 중…') : i18n.t('꺼짐')}
            </Text>
            {phase !== 'unsupported' && phase !== 'no-tool' ? (
              <Chip label={running ? i18n.t('끄기') : i18n.t('켜기')} on={false} onPress={() => power(running ? 'shutdown' : 'boot')} />
            ) : null}
          </View>

          <SectionHeader title={i18n.t('메모리')} style={{ paddingHorizontal: 0, marginTop: 18 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {memOpts.map((g) => <Chip key={g} label={`${g} GB`} on={g === memGB} onPress={() => void patch({ memGB: g })} />)}
          </View>

          <SectionHeader title="CPU" style={{ paddingHorizontal: 0, marginTop: 18 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cpuOpts.map((c) => <Chip key={c} label={`${c}${i18n.t('코어')}`} on={c === cpu} onPress={() => void patch({ cpu: c })} />)}
          </View>

          <SectionHeader title={i18n.t('안 쓰면 끄기')} style={{ paddingHorizontal: 0, marginTop: 18 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {idleOpts.map(([v, l]) => <Chip key={v} label={l} on={v === idle} onPress={() => void patch({ idleOffMin: v })} />)}
          </View>

          {err ? <Text style={{ color: C.error, fontSize: v2.font.size.caption, marginTop: 16 }}>{err}</Text> : null}

          <SectionHeader title={i18n.t('삭제')} style={{ paddingHorizontal: 0, marginTop: 18 }} />
          <PressableRow
            onPress={confirmDelete}
            disabled={busy}
            minHeight={44}
            radius={v2.radius.sm}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 0 }}
          >
            <Text style={{ color: C.error, fontSize: v2.font.size.small }}>
              {i18n.t('에이전트 PC 삭제')}{st?.diskSize?.allocated ? ` (${fmtGB(st.diskSize.allocated)} ${i18n.t('반환')})` : ''}
            </Text>
            {busy ? <ActivityIndicator size="small" color={C.text3} /> : null}
          </PressableRow>
        </ScrollView>
      )}
    </Sheet>
  );
}
