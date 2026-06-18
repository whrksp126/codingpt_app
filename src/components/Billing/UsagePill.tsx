import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import billingService, { windowPercent } from '../../services/billingService';
import type { UsageStatus } from '../../types/billing';

interface Props {
  textColor?: string;
  dimColor?: string;
  accentColor?: string;
  // 값이 바뀌면 사용량을 다시 조회 (예: 에이전트 턴 종료 시점)
  refreshSignal?: number;
}

// 채팅 헤더용 사용량 pill — "32%". 탭하면 결제 웹(요금제)으로.
const UsagePill: React.FC<Props> = ({ textColor = '#E5E9F0', dimColor = '#8A93A6', accentColor = '#7AA2F7', refreshSignal }) => {
  const [status, setStatus] = useState<UsageStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await billingService.getUsageStatus();
      setStatus(s);
    } catch (_) { /* noop */ }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { load(); }, [refreshSignal, load]);

  if (!status) return null;

  const pct = windowPercent(status);
  if (pct == null) return null; // 무제한 플랜이면 숨김

  const over = pct >= 100;

  return (
    <Pressable
      onPress={() => billingService.openBilling('/me')}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start' }}
    >
      <View style={{ width: 32, height: 4, borderRadius: 999, backgroundColor: '#2A2F3A', overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 4, borderRadius: 999, backgroundColor: over ? '#F87171' : accentColor }} />
      </View>
      <Text style={{ color: over ? '#F87171' : dimColor, fontSize: 10.5, fontWeight: '600' }}>{pct}%</Text>
    </Pressable>
  );
};

export default UsagePill;
