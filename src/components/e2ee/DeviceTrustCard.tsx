import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { DeviceMobile, Desktop, ShieldCheck, Clock } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import type { PendingDevice } from '../../services/e2ee';

// 기기 승인 카드 — "새 기기가 접속을 요청합니다 · 안전 코드 K7M2-9QXF-B4TR [승인][거절]".
//
// **안전 코드(60비트)** 를 가장 크게 그린다: 사용자가 새 기기 화면과 이 카드를 눈으로 대조하는 것이
//  유일한 오프라인 채널이고, 그게 서버 MITM 을 차단하는 근거다(설계 §3.1-4).
//  ⚠ 4자리 확인 숫자는 **보안 대조값이 아니다** — 서버는 userId 와 피해 기기의 ikX 를 다 알고 있어
//   "같은 4자리가 나오는 자기 키쌍"을 1코어 1.3초(실측 2,587회/155ms)에 찾는다. 그래서 4자리는
//   "승인 요청이 여럿일 때 어느 것인지" 구분용으로만 작게 적고, 대조 문구는 안전 코드에 건다.
//  두 값 모두 서버가 준 문자열이 아니라 ikX 에서 **로컬 계산**한다(e2ee.ts decoratePending).
//
// ApprovalCard(기능1) 의 시각 언어를 그대로 따른다 — 테두리 warn, 헤더 한 줄, 하단 2버튼.

function fmtWhen(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  return `${Math.floor(s / 3600)}시간 전`;
}

/** 60비트 안전 코드 — "K7M2-9QXF-B4TR" 를 그룹 단위 칩으로(사람이 4글자씩 읽는다). */
function SafetyCode({ code, tone }: { code: string; tone: string }) {
  const C = v2.colors;
  const groups = (code || '').split('-').filter(Boolean);
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      {(groups.length ? groups : ['—', '—', '—']).map((g, i) => (
        <View
          key={`${i}-${g}`}
          style={{
            paddingHorizontal: 10, paddingVertical: 8, borderRadius: v2.radius.md,
            backgroundColor: C.elevated2, borderWidth: 1, borderColor: C.borderControl,
            alignItems: 'center',
          }}
        >
          <Text selectable style={{ color: tone, fontSize: 22, fontWeight: '800', fontFamily: v2.font.mono as string, letterSpacing: 2 }}>{g}</Text>
        </View>
      ))}
    </View>
  );
}
/** 요청 구분용 4자리(보조 표기) — 크기·문구로 "대조용이 아님"을 분명히 한다. */
function RequestNo({ code }: { code: string }) {
  const C = v2.colors;
  if (!code) return null;
  return (
    <Text style={{ color: C.textDim, fontSize: 11, textAlign: 'center' }}>
      요청 번호 <Text style={{ fontFamily: v2.font.mono as string }}>{code}</Text> (구분용 — 이 숫자로 대조하지 마세요)
    </Text>
  );
}

export default function DeviceTrustCard({
  device, busy, onApprove, onDeny, compact,
}: {
  device: PendingDevice;
  busy?: boolean;
  onApprove: () => void;
  onDeny: () => void;
  compact?: boolean;
}) {
  const C = v2.colors;
  const icon = device.platform === 'darwin' || device.platform === 'win32' || device.platform === 'linux'
    ? <Desktop size={15} color={C.text3} />
    : <DeviceMobile size={15} color={C.text3} />;
  const pad = compact ? 10 : 14;

  return (
    <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.warn, borderRadius: v2.radius.md, padding: pad, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={14} color={C.warn} />
        <Text style={{ color: C.warn, fontSize: 11.5, fontWeight: '700' }}>새 기기 승인</Text>
        <View style={{ flex: 1 }} />
        <Clock size={12} color={C.textDim} />
        <Text style={{ color: C.textDim, fontSize: 11 }}>{fmtWhen(device.requestedAt)}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{device.label}</Text>
        <Text style={{ color: C.textDim, fontSize: 11.5 }}>에서 접속 시도</Text>
      </View>

      <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 18 }}>
        새 기기 화면에 아래 <Text style={{ fontWeight: '700' }}>안전 코드</Text>가 글자까지 똑같이 보이는지
        확인하고 승인해 주세요. 한 글자라도 다르면 거절해 주세요.
      </Text>
      <SafetyCode code={device.safetyCode} tone={C.accent} />
      <RequestNo code={device.verifyCode} />
      {!device.verified ? (
        <Text style={{ color: C.warn, fontSize: 10.5, lineHeight: 15 }}>
          요청 번호는 서버가 알려준 값이에요(이 기기에서 직접 계산한 값과 달랐습니다). 대조는 위 안전 코드로
          하시고, 새 기기가 내 것인지 한 번 더 확인해 주세요.
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
        <PressableScale
          onPress={onDeny}
          disabled={!!busy}
          style={{
            flex: 1, height: 42, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2, opacity: busy ? 0.6 : 1,
          }}
        >
          <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '700' }}>거절</Text>
        </PressableScale>
        <PressableScale
          onPress={onApprove}
          disabled={!!busy}
          style={{
            flex: 1.4, height: 42, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center',
            flexDirection: 'row', gap: 7, backgroundColor: C.accent, opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : null}
          <Text style={{ color: C.onAccent, fontSize: 13.5, fontWeight: '800' }}>승인</Text>
        </PressableScale>
      </View>
      <Text style={{ color: C.textDim, fontSize: 10.5 }}>
        승인하면 이 기기의 열쇠가 새 기기로 안전하게 전달됩니다(서버는 열쇠를 볼 수 없습니다).
      </Text>
    </View>
  );
}

/** 새 기기 자신이 보는 대기 화면 — 안전 코드 + "기존 기기에서 승인해 주세요". */
export function DeviceTrustWaiting({ safety, code, onRefresh, busy }: { safety: string; code?: string; onRefresh?: () => void; busy?: boolean }) {
  const C = v2.colors;
  return (
    <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.md, padding: 14, gap: 10 }}>
      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>이 기기를 신뢰 목록에 추가해 주세요</Text>
      <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 18 }}>
        이미 쓰던 기기(폰·PC)에 승인 요청이 도착했어요. 그 화면에 아래 안전 코드가 같은지 확인하고 승인하면 끝입니다.
      </Text>
      <SafetyCode code={safety} tone={C.info} />
      <RequestNo code={code || ''} />
      <Text style={{ color: C.textDim, fontSize: 11.5, lineHeight: 17 }}>
        승인 전에도 내 PC 목록·워크스페이스·터미널은 그대로 사용할 수 있어요. 승인은 통신을 서버가 볼 수 없게
        암호화하기 위한 절차입니다.
      </Text>
      {onRefresh ? (
        <PressableScale
          onPress={onRefresh}
          disabled={!!busy}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 14, height: 34, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}
        >
          <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '600' }}>{busy ? '확인 중…' : '승인됐는지 확인'}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
