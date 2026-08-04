import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Globe, Plus } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { haptic } from '../animations/haptics';
import daemonService, { type OpenPort } from '../services/daemonService';
import { tx } from '../text';
import { PORTS_TEXT } from '../text/ports';

const TX = tx(PORTS_TEXT);

// 열린 포트 목록 — 워크스페이스 헤더의 웹뷰 버튼과 프리뷰 "포트" 버튼이 여는 시트.
//
// PC 미러: `codingpt_pc/src/js/ports.js` 의 openPortsMenu(.pv-menu 드롭다운).
//  데이터 원천은 데몬 한 벌(net.ports)이고, 화면 규칙도 같다:
//   · 안쪽(items)이 비면 '다른 곳'을 접지 않고 그대로 펼친다 — 실측상 사용자의 dev 서버는
//     전부 Docker 가 띄워서 items 가 늘 비기 때문이다. 접어 두면 이 사용자에겐 항상 빈 목록이다.
//   · 힌트 문구는 그때(안쪽이 빌 때)만 낸다 — 평소엔 군더더기다.
export default function PortsSheet({ visible, onClose, cwd, host, onPick, onBlank }: {
  visible: boolean;
  onClose: () => void;
  cwd: string;
  host: number | null;
  onPick: (port: number) => void;
  /** 주면 맨 위에 [빈 웹뷰] 행이 생긴다(헤더 웹뷰 버튼용). */
  onBlank?: () => void;
}) {
  const C = v2.colors;
  const R = v2.radius;
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ items: OpenPort[]; others: OpenPort[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    daemonService.previewPortsDetail(cwd, host)
      .then(setData)
      .catch((e) => { setData({ items: [], others: [] }); setError(e?.message || TX.failed); });
  }, [cwd, host]);

  useEffect(() => { if (visible) { setData(null); load(); } }, [visible, load]);

  if (!visible) return null;
  const items = data?.items || [];
  const others = data?.others || [];

  const Row = ({ p }: { p: OpenPort }) => (
    <Pressable
      onPress={() => { haptic.keyPress(); onPick(p.port); }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 10, paddingVertical: 11, borderRadius: R.sm,
      }}
    >
      <Globe size={17} color={C.textDim} />
      <Text style={{ flex: 1, color: C.text, fontSize: 14 }}>{p.port}</Text>
      {p.command ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11.5, maxWidth: 160 }}>{p.command}</Text> : null}
    </Pressable>
  );
  const Head = ({ text, hint }: { text: string; hint?: string }) => (
    <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 2 }}>
      <Text style={{ color: C.textDim, fontSize: 11.5 }}>{text}</Text>
      {hint ? <Text style={{ color: C.textDim, fontSize: 11, lineHeight: 16, marginTop: 3 }}>{hint}</Text> : null}
    </View>
  );

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '78%', backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 8,
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 }}>{TX.title}</Text>

        {onBlank ? (
          <Pressable
            onPress={() => { onClose(); onBlank(); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 11, borderRadius: R.sm }}
          >
            <Plus size={17} color={C.textDim} />
            <Text style={{ color: C.text, fontSize: 14 }}>{TX.blank}</Text>
          </Pressable>
        ) : null}

        {data === null ? (
          <View style={{ paddingVertical: 26, alignItems: 'center' }}><ActivityIndicator size="small" color={C.text3} /></View>
        ) : !items.length && !others.length ? (
          <View style={{ paddingVertical: 16, paddingHorizontal: 10 }}>
            <Text style={{ color: C.text2, fontSize: 14 }}>{error || TX.empty}</Text>
            {!error ? <Text style={{ color: C.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 5 }}>{TX.emptyHint}</Text> : null}
          </View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {items.length ? <Head text={TX.thisWorkspace} /> : null}
            {items.map((p) => <Row key={'i' + p.port} p={p} />)}
            {others.length ? <Head text={TX.elsewhere} hint={items.length ? undefined : TX.elsewhereHint} /> : null}
            {others.map((p) => <Row key={'o' + p.port} p={p} />)}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}
