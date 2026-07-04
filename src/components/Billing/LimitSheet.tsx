import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import billingService from '../../services/billingService';
import billingEvents from '../../services/billingEvents';
import V2Sheet from '../v2/V2Sheet';
import type { UsageLimitInfo } from '../../types/billing';

// 사용량 한도 도달 시 뜨는 바텀시트. billingEvents.onLimit 구독.
// 월 구독 전용 — 한도 초기화 대기 또는 플랜 업그레이드로 유도(결제는 웹).
const LimitSheet: React.FC = () => {
  const [info, setInfo] = useState<UsageLimitInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => billingEvents.onLimit((i) => { setInfo(i); setOpen(true); }), []);

  if (!info) return null;

  const planRequired = info.code === 'PLAN_REQUIRED';
  const reset = info.reason === 'weekly_exceeded' ? info.weeklyResetAt : info.windowResetAt;
  const resetText = formatReset(reset);
  const close = () => setOpen(false);
  // 스토어 빌드는 네이티브 페이월(반유도 준수), 그 외는 웹 결제로 폴백.
  const goUpgrade = () => { close(); billingService.startUpgrade(info?.code); };

  const title = planRequired ? '워크스페이스는 Pro부터예요' : '사용량 한도에 도달했어요';
  const body = planRequired
    ? '워크스페이스 바이브코딩은 Pro 이상 플랜에서 사용할 수 있어요.\n채팅은 Free에서도 계속 쓸 수 있어요.'
    : (info.reason === 'weekly_exceeded' ? '이번 주 사용 한도를 모두 사용했어요.' : '현재 사용 구간의 한도를 모두 사용했어요.')
      + (resetText ? `\n${resetText}에 한도가 자동으로 초기화돼요.` : '');

  return (
    <V2Sheet visible={open} onClose={close} background="#11151F" maxHeightPct={0.7}>
      <View style={{ paddingHorizontal: 22, paddingTop: 2, gap: 14 }}>
        <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '800' }}>{title}</Text>
        <Text style={{ color: '#94A3B8', fontSize: 13.5, lineHeight: 20 }}>{body}</Text>

        <Pressable
          onPress={goUpgrade}
          style={{ backgroundColor: '#34D399', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
        >
          <Text style={{ color: '#06281C', fontSize: 15, fontWeight: '800' }}>업그레이드 하기</Text>
        </Pressable>
        <Pressable onPress={close} style={{ paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: '#64748B', fontSize: 13.5 }}>{planRequired ? '닫기' : '기다리기'}</Text>
        </Pressable>
      </View>
    </V2Sheet>
  );
};

function formatReset(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diffMin = Math.max(0, Math.round((t - Date.now()) / 60000));
  if (diffMin < 60) return `약 ${diffMin}분 후`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `약 ${h}시간 후`;
  return `약 ${Math.floor(h / 24)}일 후`;
}

export default LimitSheet;
