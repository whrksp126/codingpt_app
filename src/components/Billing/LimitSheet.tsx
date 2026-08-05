import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import billingEvents from '../../services/billingEvents';
import V2Sheet from '../v2/V2Sheet';
import type { UsageLimitInfo } from '../../types/billing';

// 사용량 한도 도달 시 뜨는 바텀시트. billingEvents.onLimit 구독.
// 레거시 한도 응답 안내. Supporter는 기능 잠금 해제 상품이 아니므로 결제로 유도하지 않는다.
const LimitSheet: React.FC = () => {
  const [info, setInfo] = useState<UsageLimitInfo | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => billingEvents.onLimit((i) => { setInfo(i); setOpen(true); }), []);

  if (!info) return null;

  const planRequired = info.code === 'PLAN_REQUIRED';
  const reset = info.reason === 'weekly_exceeded' ? info.weeklyResetAt : info.windowResetAt;
  const resetText = formatReset(reset);
  const close = () => setOpen(false);
  const title = planRequired ? '잠시 이용할 수 없어요' : '사용량 한도에 도달했어요';
  const body = planRequired
    ? 'Personal의 핵심 원격 기능은 무료예요. 잠시 후 다시 시도해 주세요.'
    : (info.reason === 'weekly_exceeded' ? '이번 주 사용 한도를 모두 사용했어요.' : '현재 사용 구간의 한도를 모두 사용했어요.')
      + (resetText ? `\n${resetText}에 한도가 자동으로 초기화돼요.` : '');

  return (
    <V2Sheet visible={open} onClose={close} background="#11151F" maxHeightPct={0.7}>
      <View style={{ paddingHorizontal: 22, paddingTop: 2, gap: 14 }}>
        <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '800' }}>{title}</Text>
        <Text style={{ color: '#94A3B8', fontSize: 13.5, lineHeight: 20 }}>{body}</Text>

        <Pressable onPress={close} style={{ paddingVertical: 10, alignItems: 'center' }}>
          <Text style={{ color: '#64748B', fontSize: 13.5 }}>확인</Text>
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
