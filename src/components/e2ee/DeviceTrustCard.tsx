import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { DeviceMobile, Desktop, ShieldCheck, Clock } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../ui/PressableScale';
import type { PendingDevice } from '../../services/e2ee';
import COPY from './e2eeCopy';

// 기기 승인 카드 — 행동 하나만 담는다: 코드 대조 → [거절]/[승인].
//
// **안전 코드(60비트)** 를 가장 크게 그린다: 사용자가 새 기기 화면과 이 카드를 눈으로 대조하는 것이
//  유일한 오프라인 채널이고, 그게 서버 MITM 을 차단하는 근거다(설계 §3.1-4).
//  ⚠ 4자리 확인 숫자는 **보안 대조값이 아니다** — 서버는 userId 와 피해 기기의 ikX 를 다 알고 있어
//   "같은 4자리가 나오는 자기 키쌍"을 1코어 1.3초(실측 2,587회/155ms)에 찾는다. 그래서 4자리는
//   "승인 요청이 여럿일 때 어느 것인지" 구분용으로만 작게 적고(`· 대조용 아님`), 대조 지시는 안전
//   코드에 건다. 두 값 모두 서버 문자열이 아니라 ikX 에서 **로컬 계산**한다(e2ee.ts decoratePending).
//  ⚠ 안전 코드를 계산할 수 없으면(파생 기준 미상) 칩 대신 경고를 그리고 **승인 버튼을 비활성**한다 —
//   대조 기준 없이 습관적으로 승인하면 이 UX 의 존재 이유가 사라진다(PC 와 동일 규율).
//
// 2026-07-27 카피 감사: 카드 안 설명은 **지침 1줄 + 요청번호 1줄**뿐이다(기기명 뒤 '에서 접속 시도',
//  하단 안심 문구 50자 삭제 — 승인/거절 판단을 바꾸지 않는 문장이었다). 문구 정본은 `e2eeCopy.ts`.
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
  // 좁은 폰(안전 코드 3블록 = 22pt mono)에서도 잘리지 않게 줄바꿈을 허용한다.
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
      {groups.map((g, i) => (
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
/**
 * 대조 기준 미상 — 칩 대신 이 경고를 그리고 승인 버튼을 비활성한다(§2.10).
 *  ⚠ 문구는 **화면 역할별로 다르다**: 승인 카드(여기)에는 승인 버튼이 있으니 '승인하지 마세요',
 *   새 기기 자신의 대기 화면에는 버튼이 없으니 '기존 기기에서 승인하지 마세요'(누를 곳을 명시).
 *   한 문구를 두 화면에 재사용하면 대기 화면에서 지시 대상이 어긋난다.
 */
function NoSafety({ text }: { text: string }) {
  const C = v2.colors;
  return (
    <Text style={{ color: C.warn, fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 18 }}>
      {text}
    </Text>
  );
}
/** 요청 구분용 4자리(보조 표기) — 크기·문구로 "대조용이 아님"을 분명히 한다. */
function RequestNo({ code }: { code: string }) {
  const C = v2.colors;
  if (!code) return null;
  return (
    <Text style={{ color: C.textDim, fontSize: 11, textAlign: 'center' }}>
      {COPY.appr.reqno(code)}
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
  // 대조 기준(안전 코드)이 없으면 승인 불가 — 사람이 대조할 값이 없는데 승인 버튼을 열어 두면 안 된다.
  const hasSafety = !!(device.safetyCode || '').split('-').filter(Boolean).length;

  return (
    <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.warn, borderRadius: v2.radius.md, padding: pad, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <ShieldCheck size={14} color={C.warn} />
        <Text style={{ color: C.warn, fontSize: 11.5, fontWeight: '700' }}>{COPY.appr.head}</Text>
        <View style={{ flex: 1 }} />
        <Clock size={12} color={C.textDim} />
        <Text style={{ color: C.textDim, fontSize: 11 }}>{fmtWhen(device.requestedAt)}</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={{ flex: 1, color: C.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={1}>{device.label}</Text>
      </View>

      {/* 카드 안 유일한 설명 — 눈 대조가 서버 MITM 차단의 전부다(§2.10) */}
      <Text style={{ color: C.text2, fontSize: 12.5, lineHeight: 18 }}>{COPY.appr.instr}</Text>
      {hasSafety ? <SafetyCode code={device.safetyCode} tone={C.accent} /> : <NoSafety text={COPY.appr.noSafety} />}
      <RequestNo code={device.verifyCode} />
      {/* 안전 코드가 없는 상태는 항상 verified=false 를 동반한다(decoratePending) — 두 경고를 겹쳐
          그리면 사용자는 둘 다 흘려 읽는다. 앞 경고가 있으면 이건 숨긴다(PC settings.js 와 같은 규칙) */}
      {hasSafety && !device.verified ? (
        <Text style={{ color: C.warn, fontSize: 10.5, lineHeight: 15 }}>{COPY.appr.unverified}</Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
        {/* ★ 흐림은 `baseOpacity` prop 으로만 먹는다 — style 의 opacity 는 PressableScale 의 애니메이션
            스타일(PressableScale.tsx:38)이 **항상 덮는다**. 그래서 disabled 인 승인 버튼이 100% 밝기로
            보이고, 사용자는 평소와 똑같은 [승인] 을 눌러 무반응을 겪는다(= 이 라운드가 신설한 보안
            어포던스가 시각적으로 무효). PC 는 `.btn:disabled{opacity:.5}` 로 실제로 흐려진다. */}
        <PressableScale
          onPress={onDeny}
          disabled={!!busy}
          baseOpacity={busy ? 0.6 : 1}
          style={{
            flex: 1, height: 42, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2,
          }}
        >
          <Text style={{ color: C.text2, fontSize: 13.5, fontWeight: '700' }}>{COPY.appr.deny}</Text>
        </PressableScale>
        <PressableScale
          onPress={onApprove}
          disabled={!!busy || !hasSafety}
          baseOpacity={!hasSafety ? 0.45 : (busy ? 0.7 : 1)}
          style={{
            flex: 1.4, height: 42, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center',
            flexDirection: 'row', gap: 7, backgroundColor: C.accent,
          }}
        >
          {busy ? <ActivityIndicator size="small" color={C.onAccent} /> : null}
          <Text style={{ color: C.onAccent, fontSize: 13.5, fontWeight: '800' }}>{COPY.appr.approve}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

/**
 * 새 기기 **자신**이 보는 대기 화면 — 제목 + 코드 + 요청번호 + [승인됐는지 확인]. 설명문 0줄.
 *  (이 화면에는 대조 행위가 없다 — 대조는 승인하는 기기에서 한다. 그래서 구 65자·76자 안내를 지웠다)
 *  ★ `hint` 1줄만 예외다(설정의 `기기` 섹션에서 인라인으로 쓸 때): 기기를 **전부 잃은** 사용자에게
 *   '기존 기기에서 승인' 은 실행 불가능한 지시이고 유일한 출구(복구 코드)가 접힌 `자세히` 안에 있다 →
 *   경로를 알린다(PC settings.js 의 같은 자리 · 문구 = COPY.act.selfWaitHint).
 */
export function DeviceTrustWaiting({ safety, code, hint, onRefresh, busy }: { safety: string; code?: string; hint?: string | null; onRefresh?: () => void; busy?: boolean }) {
  const C = v2.colors;
  const hasSafety = !!(safety || '').split('-').filter(Boolean).length;
  return (
    <View style={{ backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: v2.radius.md, padding: 14, gap: 10 }}>
      <Text style={{ color: C.text, fontSize: 13.5, fontWeight: '700' }}>{COPY.wait.title}</Text>
      {hint ? <Text style={{ color: C.textDim, fontSize: 11, marginTop: -4 }}>{hint}</Text> : null}
      {/* 코드 색은 승인 카드와 **같아야 한다**(양쪽 accent) — 사용자가 두 화면을 나란히 놓고 '글자까지'
          대조하는데 가장 먼저 보이는 차이가 색이면 "다른 화면 아닌가" 로 멈추거나 대조를 소홀히 한다 */}
      {hasSafety ? <SafetyCode code={safety} tone={C.accent} /> : <NoSafety text={COPY.wait.noSafety} />}
      <RequestNo code={code || ''} />
      {onRefresh ? (
        <PressableScale
          onPress={onRefresh}
          disabled={!!busy}
          style={{ alignSelf: 'flex-start', paddingHorizontal: 14, height: 34, borderRadius: v2.radius.sm, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated2 }}
        >
          <Text style={{ color: C.text2, fontSize: 12.5, fontWeight: '600' }}>{busy ? COPY.wait.refreshBusy : COPY.wait.refresh}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
