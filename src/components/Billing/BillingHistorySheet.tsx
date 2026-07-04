import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View, ScrollView, ActivityIndicator } from 'react-native';
import { api } from '../../utils/api';
import type { PaymentReceipt } from '../../types/billing';

// 결제 내역(영수증) 시트 — 내정보 "결제 내역" 진입. 웹 /billing 과 동일 데이터.
const C = {
  surface: '#11151F', base: '#0A0D14', border: '#1C2230',
  text: '#F8FAFC', text2: '#CBD5E1', dim: '#94A3B8', accent: '#34D399', danger: '#F87171',
};

const STATUS_LABEL: Record<string, string> = {
  paid: '결제 완료', ready: '대기', failed: '실패', cancelled: '취소', partial_cancelled: '부분 취소',
};
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR') : '–');
const krw = (n: number) => '₩' + Number(n || 0).toLocaleString('ko-KR');

const BillingHistorySheet: React.FC<{ visible: boolean; onClose: () => void }> = ({ visible, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PaymentReceipt[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    api.billing.getPayments(1, 50)
      .then((res) => { if (!cancelled) setRows(((res.data as any)?.data ?? []) as PaymentReceipt[]); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 14, paddingBottom: 30, borderTopWidth: 1, borderColor: C.border, maxHeight: '85%' }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 999, backgroundColor: '#2A2F3A', marginBottom: 10 }} />
          <View style={{ paddingHorizontal: 22, paddingBottom: 10 }}>
            <Text style={{ color: C.text, fontSize: 20, fontWeight: '800' }}>결제 내역</Text>
            <Text style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>구독 결제·갱신·환불 영수증이에요.</Text>
          </View>
          <ScrollView style={{ paddingHorizontal: 18 }} contentContainerStyle={{ paddingBottom: 12 }}>
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
            ) : rows.length === 0 ? (
              <Text style={{ color: C.dim, fontSize: 14, paddingVertical: 26, textAlign: 'center' }}>결제 내역이 없습니다.</Text>
            ) : (
              rows.map((r) => (
                <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '700' }} numberOfLines={1}>
                      {r.kindLabel}{r.planName ? ` · ${r.planName}` : ''}
                    </Text>
                    <Text style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                      {fmt(r.paidAt || r.createdAt)}{r.periodStart ? ` · ${fmt(r.periodStart)}~${fmt(r.periodEnd)}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>{krw(r.amountKrw)}</Text>
                    <Text style={{ fontSize: 11.5, marginTop: 2, color: r.status === 'paid' ? C.accent : C.dim }}>
                      {STATUS_LABEL[r.status] || r.status}{r.refundedAmountKrw > 0 ? ` · ${krw(r.refundedAmountKrw)} 환불` : ''}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default BillingHistorySheet;
