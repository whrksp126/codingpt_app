import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
  Text,
  View,
} from 'react-native';
import {
  Check,
  Copy,
  Gear,
  PaperPlaneTilt,
} from 'phosphor-react-native';

import { useWorkspaceShell } from '../../contexts/WorkspaceShellContext';
import { type AccountDevice } from '../../services/daemonService';
import e2eeSvc, { type TrustedDeviceKey } from '../../services/e2ee';
import { v2 } from '../../theme/v2Tokens';
import KeyTextInput from '../keyboard/KeyTextInput';
import PressableScale from '../ui/PressableScale';
import * as i18n from '../../i18n/index.ts';

const C = v2.colors;
const R = v2.radius;
const DOWNLOAD_URL = 'https://codingpt.ghmate.com/download';
const POLL_MS = 3000;

type GateStage =
  | 'loading'
  | 'install'
  | 'select-host'
  | 'prepare-key'
  | 'claim-key'
  | 'share-key'
  | 'offline'
  | 'ready';

function isLocalHost(device: AccountDevice): boolean {
  return device.role === 'host' && device.runnerKind === 'local' && !device.virtual;
}

export function keyMatchesHost(key: TrustedDeviceKey, host: AccountDevice): boolean {
  if (key.state !== 'trusted') return false;
  // 표시 이름과 OS는 인증 수단이 아니다. 서버의 안정 machineId에 귀속된 deviceId만 신뢰한다.
  return key.deviceId != null && String(key.deviceId) === String(host.id);
}

function platformLabel(platform: string | null): string {
  const value = platform?.trim().toLowerCase();
  if (value === 'darwin' || value === 'macos') return 'macOS';
  if (value === 'win32' || value === 'windows') return 'Windows';
  if (value === 'linux') return 'Linux';
  return platform?.trim() || 'PC';
}

function resolveStage({
  loading,
  mobileReady,
  hosts,
  trustedHosts,
  selectedHost,
  selectedHostTrusted,
}: {
  loading: boolean;
  mobileReady: boolean;
  hosts: AccountDevice[];
  trustedHosts: AccountDevice[];
  selectedHost?: AccountDevice;
  selectedHostTrusted: boolean;
}): GateStage {
  if (loading) return 'loading';
  if (hosts.length === 0) return 'install';
  if (mobileReady && trustedHosts.some((host) => host.online)) return 'ready';
  if (!selectedHost) return 'select-host';
  if (!mobileReady && selectedHostTrusted) return 'claim-key';
  if (!mobileReady) return 'prepare-key';
  if (!selectedHostTrusted) return 'share-key';
  if (!selectedHost.online) return 'offline';
  return 'ready';
}

function PrimaryButton({
  label,
  busy,
  disabled,
  icon,
  onPress,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      baseOpacity={disabled || busy ? 0.45 : 1}
      onPress={onPress}
      style={{
        minHeight: 48,
        borderRadius: R.md,
        backgroundColor: C.text,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 20,
      }}
    >
      {busy ? <ActivityIndicator size="small" color={C.base} /> : icon}
      <Text style={{ color: C.base, fontSize: 14, fontWeight: '700' }}>{label}</Text>
    </PressableScale>
  );
}

function QuietButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        minHeight: 44,
        borderRadius: R.md,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 7,
        paddingHorizontal: 16,
      }}
    >
      {icon}
      <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '600' }}>{label}</Text>
    </PressableScale>
  );
}

function Progress({ stage }: { stage: GateStage }) {
  const active = stage === 'install' || stage === 'select-host' ? 0
    : stage === 'prepare-key' || stage === 'claim-key' || stage === 'share-key' ? 1
      : 2;
  const labels = [i18n.t('PC 준비'), i18n.t('안전하게 연동'), i18n.t('연결 완료')];
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: active + 1 }}
      style={{ flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 420, alignSelf: 'center' }}
    >
      {labels.map((label, index) => (
        <React.Fragment key={label}>
          {index > 0 ? <View style={{ flex: 1, height: 1, backgroundColor: index <= active ? C.text3 : C.border }} /> : null}
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={{
              width: index === active ? 22 : 7,
              height: 7,
              borderRadius: 999,
              backgroundColor: index <= active ? C.text : C.borderControl,
            }} />
            <Text style={{ color: index === active ? C.text2 : C.textDim, fontSize: 10.5 }}>{label}</Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function Hero({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{
        color: C.text,
        fontSize: 22,
        lineHeight: 29,
        fontWeight: '700',
        letterSpacing: -0.3,
        textAlign: 'center',
      }}>
        {title}
      </Text>
      <Text style={{
        color: C.text2,
        fontSize: 14,
        lineHeight: 21,
        textAlign: 'center',
        marginTop: 9,
        maxWidth: 390,
      }}>
        {body}
      </Text>
    </View>
  );
}

export default function ConnectionOnboardingGate({ children }: { children: React.ReactNode }) {
  const S = useWorkspaceShell();
  const { loadDevices, refreshE2ee } = S;
  const [keys, setKeys] = useState<TrustedDeviceKey[]>([]);
  const [keyringLoaded, setKeyringLoaded] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkUntil, setLinkUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);

  const hosts = useMemo(() => S.devices.filter(isLocalHost), [S.devices]);
  const trustedHosts = useMemo(
    () => hosts.filter((host) => keys.some((key) => keyMatchesHost(key, host))),
    [hosts, keys],
  );
  const selectedHost = useMemo(
    () => hosts.find((host) => String(host.id) === selectedHostId),
    [hosts, selectedHostId],
  );
  const selectedHostTrusted = !!selectedHost
    && keys.some((key) => keyMatchesHost(key, selectedHost));
  const stage = resolveStage({
    loading: S.loading || !keyringLoaded,
    mobileReady: S.e2ee.ready,
    hosts,
    trustedHosts,
    selectedHost,
    selectedHostTrusted,
  });

  const refresh = useCallback(async () => {
    await Promise.allSettled([loadDevices(), refreshE2ee()]);
    try {
      const ring = await e2eeSvc.loadKeyring();
      setKeys(ring.devices);
    } finally {
      setKeyringLoaded(true);
    }
  }, [loadDevices, refreshE2ee]);

  useEffect(() => {
    if (stage === 'ready') return;
    void refresh();
    const timer = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, stage]);

  useEffect(() => {
    if (stage === 'ready') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [stage]);

  useEffect(() => {
    if (!linkUntil) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [linkUntil]);

  useEffect(() => () => e2eeSvc.linkCancel(), []);

  useEffect(() => {
    if (stage !== 'share-key') {
      e2eeSvc.linkCancel();
      setLinkCode(null);
      setLinkUntil(0);
    }
  }, [stage]);

  const issueLinkCode = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const link = await e2eeSvc.linkStart();
      setLinkCode(link.code);
      setLinkUntil(Date.now() + link.ttlMs);
      setNow(Date.now());
    } catch (e: any) {
      setError(e?.message || i18n.t('연동 코드를 만들지 못했어요.'));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (stage === 'share-key' && !linkCode && !busy) void issueLinkCode();
  }, [stage, linkCode, busy, issueLinkCode]);

  const claimLink = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await e2eeSvc.linkClaim(input);
      setInput('');
      await refresh();
    } catch (e: any) {
      setError(e?.message || i18n.t('코드를 확인하고 다시 시도해 주세요.'));
    } finally {
      setBusy(false);
    }
  }, [input, refresh]);

  const shareDownload = useCallback(async () => {
    try {
      await Share.share({
        title: i18n.t('CodingPT PC 앱'),
        message: `PC에서 CodingPT를 설치하세요.\n${DOWNLOAD_URL}`,
        url: Platform.OS === 'ios' ? DOWNLOAD_URL : undefined,
      });
    } catch (_) { /* 사용자가 공유 시트를 닫은 경우 */ }
  }, []);

  const copyDownload = useCallback(() => {
    Clipboard.setString(DOWNLOAD_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, []);

  if (stage === 'ready') return <>{children}</>;

  const secondsLeft = Math.max(0, Math.floor((linkUntil - now) / 1000));
  const codeExpired = !!linkCode && secondsLeft <= 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.base }}>
      <View style={{
        minHeight: 52,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={i18n.t('설정 열기')}
          onPress={S.openSettings}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}
        >
          <Gear size={19} color={C.text2} />
        </PressableScale>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, paddingHorizontal: 24, paddingBottom: 20 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }}
        >
          <View style={{ width: '100%', maxWidth: 420 }}>
            {stage === 'loading' ? (
              <View style={{ alignItems: 'center', gap: 14 }}>
                <ActivityIndicator color={C.text3} />
                <Text style={{ color: C.text2, fontSize: 14 }}>{i18n.t('연결 상태를 확인하고 있어요…')}</Text>
              </View>
            ) : null}

            {stage === 'install' ? (
              <>
                <Hero
                  title={i18n.t('작업할 PC를 연결하세요')}
                  body={i18n.t('PC에 CodingPT를 설치하고 같은 계정으로 로그인한 뒤, 안전하게 연동하세요.')}
                />
                <View style={{ marginTop: 30, gap: 4 }}>
                  <PrimaryButton
                    label={i18n.t('다운로드 링크 보내기')}
                    icon={<PaperPlaneTilt size={17} color={C.base} />}
                    onPress={() => void shareDownload()}
                  />
                  <QuietButton
                    label={copied ? i18n.t('주소를 복사했어요') : i18n.t('다운로드 주소 복사')}
                    icon={copied ? <Check size={16} color={C.text2} /> : <Copy size={16} color={C.text2} />}
                    onPress={copyDownload}
                  />
                </View>
              </>
            ) : null}

            {stage === 'select-host' ? (
              <>
                <Hero
                  title={i18n.t('연동할 PC를 선택하세요')}
                  body={i18n.t('이 모바일에서 원격으로 사용할 PC를 선택하세요.')}
                />
                <View style={{ marginTop: 28, gap: 10 }}>
                  {hosts.map((host) => {
                    const trusted = keys.some((key) => keyMatchesHost(key, host));
                    const platform = platformLabel(host.platform);
                    return (
                      <PressableScale
                        key={String(host.id)}
                        accessibilityRole="button"
                        accessibilityLabel={`${host.name}, ${platform}, ${host.online ? i18n.t('온라인') : i18n.t('오프라인')}`}
                        onPress={() => {
                          setSelectedHostId(String(host.id));
                          setError(null);
                        }}
                        style={{
                          minHeight: 72,
                          borderWidth: 1,
                          borderColor: C.borderControl,
                          borderRadius: R.md,
                          paddingHorizontal: 16,
                          paddingVertical: 13,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text numberOfLines={1} style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                            {host.name}
                          </Text>
                          <Text style={{ color: C.textDim, fontSize: 12.5, marginTop: 5 }}>
                            {platform} · {trusted ? i18n.t('연동됨') : i18n.t('연동 필요')}
                          </Text>
                        </View>
                        <Text style={{ color: host.online ? C.text2 : C.textDim, fontSize: 12.5 }}>
                          {host.online ? i18n.t('온라인') : i18n.t('오프라인')}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </View>
              </>
            ) : null}

            {stage === 'prepare-key' ? (
              <View style={{ alignItems: 'center' }}>
                <ActivityIndicator color={C.text3} />
                <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginTop: 18 }}>
                  
                  {i18n.t('암호화를 준비하고 있어요')}
                </Text>
                <Text style={{ color: C.text2, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 }}>
                  
                  {i18n.t('준비가 끝나면')} {selectedHost?.name || 'PC'}  {i18n.t('연동을 이어갑니다.')}
                </Text>
                {S.e2ee.reason ? <Text style={{ color: C.error, fontSize: 12.5, marginTop: 12 }}>{S.e2ee.reason}</Text> : null}
              </View>
            ) : null}

            {stage === 'claim-key' ? (
              <>
                <Hero
                  title={i18n.t('이 기기를 연동하세요')}
                  body={`${selectedHost?.name || i18n.t('선택한 PC')}의 CodingPT 앱에서 설정 → 계정 및 기기 → 이 기기를 열고, 표시된 8자리 코드를 입력하세요.`}
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 28 }}>
                  <KeyTextInput
                    value={input}
                    onChangeText={(text: string) => setInput(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                    placeholder={i18n.t('8자리 코드')}
                    placeholderTextColor={C.textDim}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    accessibilityLabel={i18n.t('PC에 표시된 8자리 연동 코드')}
                    style={{
                      flex: 1,
                      minHeight: 48,
                      borderWidth: 1,
                      borderColor: C.borderControl,
                      borderRadius: R.md,
                      paddingHorizontal: 14,
                      color: C.text,
                      fontSize: 17,
                      letterSpacing: 2,
                    }}
                  />
                  <PressableScale
                    accessibilityRole="button"
                    accessibilityLabel={i18n.t('연결')}
                    disabled={busy || input.length !== 8}
                    baseOpacity={busy || input.length !== 8 ? 0.45 : 1}
                    onPress={() => void claimLink()}
                    style={{
                      minWidth: 82,
                      minHeight: 48,
                      borderRadius: R.md,
                      backgroundColor: C.text,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 15,
                    }}
                  >
                    {busy
                      ? <ActivityIndicator size="small" color={C.base} />
                      : <Text style={{ color: C.base, fontSize: 14, fontWeight: '700' }}>{i18n.t('연결')}</Text>}
                  </PressableScale>
                </View>
                <QuietButton label={i18n.t('다른 PC 선택')} onPress={() => setSelectedHostId(null)} />
              </>
            ) : null}

            {stage === 'share-key' ? (
              <>
                <Hero
                  title={i18n.t('PC를 안전하게 연동하세요')}
                  body={`${selectedHost?.name || i18n.t('선택한 PC')}의 CodingPT 앱에서 설정 → 계정 및 기기를 여세요.`}
                />
                <View style={{
                  minHeight: 92,
                  marginTop: 26,
                  borderTopWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: C.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}>
                  {busy ? <ActivityIndicator color={C.text3} /> : null}
                  {linkCode && !codeExpired ? (
                    <>
                      <Text selectable style={{ color: C.text, fontSize: 27, fontWeight: '800', letterSpacing: 5 }}>
                        {linkCode}
                      </Text>
                      <Text style={{ color: C.textDim, fontSize: 11.5 }}>
                        {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}  {i18n.t('남음')}
                      </Text>
                    </>
                  ) : null}
                  {codeExpired ? (
                    <QuietButton label={i18n.t('코드 새로 만들기')} onPress={() => void issueLinkCode()} />
                  ) : null}
                </View>
                <Text style={{ color: C.text3, fontSize: 12.5, lineHeight: 19, textAlign: 'center', marginTop: 12 }}>
                  
                  {i18n.t('PC 설정 → 계정 및 기기에서 이 모바일의 ‘연동’을 누르세요.')}
                </Text>
                <QuietButton label={i18n.t('다른 PC 선택')} onPress={() => setSelectedHostId(null)} />
              </>
            ) : null}

            {stage === 'offline' ? (
              <>
                <Hero
                  title={i18n.t('PC를 켜고 CodingPT를 실행하세요')}
                  body={`${selectedHost?.name || i18n.t('선택한 PC')}가 오프라인이에요. 연결되면 자동으로 다음 단계로 이동합니다.`}
                />
                <View style={{ marginTop: 28, gap: 4 }}>
                  <PrimaryButton label={i18n.t('연결 상태 다시 확인')} busy={busy} onPress={() => void refresh()} />
                  <QuietButton label={i18n.t('다른 PC 선택')} onPress={() => setSelectedHostId(null)} />
                </View>
              </>
            ) : null}

            {error ? (
              <Text accessibilityRole="alert" style={{ color: C.error, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 12 }}>
                {error}
              </Text>
            ) : null}
          </View>
        </ScrollView>

        {stage !== 'loading' ? <Progress stage={stage} /> : null}
      </KeyboardAvoidingView>
    </View>
  );
}
