// 설정 > 플러그인 — 설치 목록 + 마켓플레이스에서 찾아 설치(폰).
//
// 지켜야 하는 규율 하나: **무엇을 허용하는지 보여 주기 전에는 설치 버튼이 없다.**
//  설치는 남의 코드를 그 PC 에 놓는 일이다. 목록에서 바로 눌리면 사용자는 자기가 무엇에
//  동의했는지 모른 채 동의하게 된다 → 미리보기(허용 목록) → 설치, 두 단계다.
//
// ⚠ PC(codingpt_pc/src/js/plugins-view.js)에 같은 규율의 화면이 있다.
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, ScrollView } from 'react-native';

import v2 from '../theme/v2Tokens';
import PressableScale from './ui/PressableScale';
import daemonService, { type PluginInfo, type PluginPreview } from '../services/daemonService';
import * as i18n from '../i18n/index.ts';

const C = v2.colors;

/** 처음 화면에 둘 추천 저장소 — "빈 상점"을 면하는 최소한의 안내. */
const SUGGESTED = [{ name: 'CodingPT 공식', url: 'https://github.com/codingpt/plugins.git' }];

const KIND_LABEL: Record<string, string> = {
  quickCommands: '저장한 명령',
  commands: '팔레트 명령',
  skills: '에이전트 스킬',
  languagePacks: '번역',
};

export default function PluginSettings({ host = null }: { host?: number | null }) {
  const [installed, setInstalled] = useState<PluginInfo[] | null>(null);
  const [market, setMarket] = useState<{ name: string; plugins: any[] } | null>(null);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<(PluginPreview & { url: string; ref?: string; subdir?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await daemonService.pluginsList(host);
      setInstalled(r.plugins || []);
      setErr('');
    } catch (e) {
      setInstalled([]);
      setErr(String((e as Error)?.message || e));
    }
  }, [host]);

  useEffect(() => { void load(); }, [load]);

  const openMarket = useCallback(async (u: string) => {
    if (!u.trim()) return;
    setBusy(true);
    try { setMarket(await daemonService.pluginsMarketplace(u.trim(), host)); setErr(''); }
    catch (e) { setMarket(null); setErr(String((e as Error)?.message || e)); }
    finally { setBusy(false); }
  }, [host]);

  const showPreview = useCallback(async (u: string, ref?: string, subdir?: string) => {
    setBusy(true);
    try {
      const pv = await daemonService.pluginsPreview(u, ref, subdir, host);
      setPreview({ ...pv, url: u, ref, subdir });
      setErr('');
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy(false); }
  }, [host]);

  const doInstall = useCallback(async () => {
    if (!preview) return;
    setBusy(true);
    try {
      // 동의 지문은 미리보기가 준 것을 **그대로** 보낸다 — 화면이 A 를 보여 주고 B 가 깔리는
      //  레이스를 데몬이 여기서 잡는다(리포가 그 사이 바뀌면 설치가 거부된다).
      // 동의 지문이 없으면(구 데몬) 설치를 시도조차 하지 않는다 — 빈 값으로 보내면 데몬이
      //  거부하지만, 그 실패가 "왜 안 되는지 모르는 오류"로 보인다.
      if (!preview.consent) throw new Error(i18n.t('PC 앱을 업데이트해 주세요'));
      await daemonService.pluginsInstall(preview.url, preview.consent, preview.ref, preview.subdir, host);
      setPreview(null);
      await load();
    } catch (e) { setErr(String((e as Error)?.message || e)); }
    finally { setBusy(false); }
  }, [preview, host, load]);

  // ── 설치 전 동의 화면 ──
  if (preview) {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <Text style={{ color: C.text, fontSize: 16, fontWeight: '700' }}>
          {preview.manifest.name} {preview.manifest.version}
        </Text>
        <Text style={{ color: C.textDim, fontSize: 12, marginTop: 4, marginBottom: 16 }}>
          {preview.manifest.description || preview.manifest.key}
        </Text>
        <Text style={{ color: C.text2, fontSize: 12.5, marginBottom: 6 }}>{i18n.t('이 플러그인이 하는 일')}</Text>
        {preview.permissions.map((p) => (
          <Text key={p.kind} style={{ color: C.text, fontSize: 13, lineHeight: 24 }}>· {p.label || p.kind}</Text>
        ))}
        {/* 커밋을 보여 준다 — "지금 이 코드"를 설치한다는 사실이 화면에 있어야 한다. */}
        <View style={{ marginTop: 16, gap: 5 }}>
          <KV k={i18n.t('가져올 커밋')} v={String(preview.commit || '').slice(0, 12)} />
          <KV k={i18n.t('저장소')} v={preview.url} />
        </View>
        {err ? <Text style={{ color: C.error, fontSize: 12, marginTop: 12 }}>{err}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Btn label={i18n.t('취소')} onPress={() => { setPreview(null); setErr(''); }} />
          <Btn label={busy ? i18n.t('설치 중…') : i18n.t('허용하고 설치')} primary disabled={busy} onPress={doInstall} />
        </View>
      </ScrollView>
    );
  }

  const installedKeys = new Set((installed || []).map((p) => p.key));

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginBottom: 8 }}>{i18n.t('설치된 플러그인')}</Text>
      <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surface, paddingHorizontal: 12 }}>
        {installed === null ? (
          <View style={{ padding: 14 }}><ActivityIndicator color={C.text3} /></View>
        ) : !installed.length ? (
          <Text style={{ color: C.textDim, fontSize: 12, paddingVertical: 14 }}>
            {i18n.t('아직 없어요. 아래에서 저장소를 열어 찾아보세요.')}
          </Text>
        ) : installed.map((p, i) => (
          <View key={p.key} style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
            borderTopWidth: i ? 1 : 0, borderTopColor: C.border, opacity: p.enabled ? 1 : 0.5,
          }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: C.text, fontSize: 13 }} numberOfLines={1}>{`${p.name} ${p.version || ''}`.trim()}</Text>
              <Text style={{ color: C.textDim, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                {p.missing || !p.contributes
                  ? i18n.t('폴더가 사라졌어요')
                  : Object.keys(p.contributes).filter((k) => (p.contributes as any)[k].length)
                    .map((k) => `${i18n.t(KIND_LABEL[k] || k)} ${(p.contributes as any)[k].length}`).join(' · ')}
              </Text>
            </View>
            <Btn
              label={p.enabled ? i18n.t('켜짐') : i18n.t('꺼짐')}
              onPress={async () => {
                try { await daemonService.pluginsSetEnabled(p.key, !p.enabled, host); await load(); }
                catch (e) { setErr(String((e as Error)?.message || e)); }
              }}
            />
            <RemoveBtn onConfirm={async () => {
              try { await daemonService.pluginsUninstall(p.key, host); await load(); }
              catch (e) { setErr(String((e as Error)?.message || e)); }
            }} />
          </View>
        ))}
      </View>

      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', marginTop: 20, marginBottom: 8 }}>{i18n.t('마켓플레이스')}</Text>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder={i18n.t('저장소 주소 (https://github.com/…/plugins.git)')}
          placeholderTextColor={C.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => void openMarket(url)}
          style={{
            flex: 1, color: C.text, fontSize: 12.5, paddingHorizontal: 10, paddingVertical: 8,
            borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.surface,
          }}
        />
        <Btn label={busy ? i18n.t('여는 중…') : i18n.t('열기')} disabled={busy} onPress={() => void openMarket(url)} />
      </View>

      {!market ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 }}>
          <Text style={{ color: C.textDim, fontSize: 11.5 }}>{i18n.t('추천')}</Text>
          {SUGGESTED.map((g) => (
            <Btn key={g.url} label={g.name} onPress={() => { setUrl(g.url); void openMarket(g.url); }} />
          ))}
        </View>
      ) : (
        <View style={{ marginTop: 10, borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surface, paddingHorizontal: 12 }}>
          <Text style={{ color: C.text2, fontSize: 11.5, paddingVertical: 8 }}>{market.name}</Text>
          {!market.plugins.length ? (
            <Text style={{ color: C.textDim, fontSize: 12, paddingBottom: 12 }}>{i18n.t('이 저장소에는 아직 플러그인이 없어요.')}</Text>
          ) : market.plugins.map((it) => (
            <View key={it.id} style={{
              flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
              borderTopWidth: 1, borderTopColor: C.border,
            }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: C.text, fontSize: 13 }} numberOfLines={1}>{it.id}</Text>
                <Text style={{ color: C.textDim, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                  {it.description || it.source.url}
                </Text>
              </View>
              <Btn
                label={installedKeys.has(it.id) ? i18n.t('설치됨') : i18n.t('보기')}
                disabled={installedKeys.has(it.id) || busy}
                onPress={() => void showPreview(it.source.url, it.source.ref, it.source.subdir)}
              />
            </View>
          ))}
        </View>
      )}

      <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 19, marginTop: 14 }}>
        {i18n.t('플러그인은 저장한 명령·팔레트 명령·에이전트 스킬·번역을 더할 수 있어요. 화면을 직접 그리지는 않아요.')}
      </Text>
      {err ? <Text style={{ color: C.error, fontSize: 12, marginTop: 10 }}>{err}</Text> : null}
    </ScrollView>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
      <Text style={{ color: C.textDim, fontSize: 11.5 }}>{k}</Text>
      <Text style={{ color: C.text2, fontSize: 11.5, flexShrink: 1 }} numberOfLines={1}>{v}</Text>
    </View>
  );
}

function Btn({ label, onPress, primary, disabled }: {
  label: string; onPress: () => void; primary?: boolean; disabled?: boolean;
}) {
  return (
    <PressableScale
      onPress={disabled ? () => {} : onPress}
      style={{
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
        borderWidth: 1, borderColor: C.border,
        backgroundColor: primary ? C.hover : 'transparent',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ color: primary ? C.text : C.text2, fontSize: 12 }}>{label}</Text>
    </PressableScale>
  );
}

/** 삭제는 **두 번 눌러야** 한다 — 되돌리려면 다시 받아야 하는데 목록에서 한 번에 지워지면 위험하다. */
function RemoveBtn({ onConfirm }: { onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <Btn
      label={armed ? i18n.t('한 번 더') : i18n.t('삭제')}
      onPress={() => { if (armed) onConfirm(); else setArmed(true); }}
    />
  );
}
