import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import billingService from '../../services/billingService';
import billingEvents from '../../services/billingEvents';
import type { UsageLimitInfo } from '../../types/billing';

// 사용량 한도 도달 시 뜨는 바텀시트. billingEvents.onLimit 구독.
// 월 구독 전용 — 한도 초기화 대기 또는 플랜 업그레이드로 유도(결제는 웹).
const LimitSheet: React.FC = () => {
  const [info, setInfo] = useState<UsageLimitInfo | null>(null);

  useEffect(() => billingEvents.onLimit((i) => setInfo(i)), []);

  if (!info) return null;

  const planRequired = info.code === 'PLAN_REQUIRED';
  const reset = info.reason === 'weekly_exceeded' ? info.weeklyResetAt : info.windowResetAt;
  const resetText = formatReset(reset);
  const close = () => setInfo(null);
  const go = async (path: string) => { close(); await billingService.openBilling(path); };

  const title = planRequired ? '워크스페이스는 Pro부터예요' : '사용량 한도에 도달했어요';
  const body = planRequired
    ? '워크스페이스 바이브코딩은 Pro 이상 플랜에서 사용할 수 있어요.\n채팅은 Free에서도 계속 쓸 수 있어요.'
    : (info.reason === 'weekly_exceeded' ? '이번 주 사용 한도를 모두 사용했어요.' : '현재 사용 구간의 한도를 모두 사용했어요.')
      + (resetText ? `\n${resetText}에 한도가 자동으로 초기화돼요.` : '');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: '#11151F', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 22, paddingBottom: 34, gap: 14, borderTopWidth: 1, borderColor: '#1C2230' }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: '#2A2F3A', marginBottom: 2 }} />
          <Text style={{ color: '#F8FAFC', fontSize: 18, fontWeight: '800' }}>{title}</Text>
          <Text style={{ color: '#94A3B8', fontSize: 13.5, lineHeight: 20 }}>{body}</Text>

          <Pressable
            onPress={() => go('/me')}
            style={{ backgroundColor: '#34D399', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 }}
          >
            <Text style={{ color: '#06281C', fontSize: 15, fontWeight: '800' }}>업그레이드 하기</Text>
          </Pressable>
          <Pressable onPress={close} style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: '#64748B', fontSize: 13.5 }}>{planRequired ? '닫기' : '기다리기'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
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
