import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { Globe, Plus } from 'phosphor-react-native';

import { v2 } from '../theme/v2Tokens';
import { haptic } from '../animations/haptics';
import daemonService, { type OpenPort } from '../services/daemonService';
import { tx } from '../text';
import { PORTS_TEXT } from '../text/ports';
import { Sheet, PressableRow, SectionHeader, EmptyState } from '../components/ui';

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
  const [data, setData] = useState<{ items: OpenPort[]; others: OpenPort[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    daemonService.previewPortsDetail(cwd, host)
      .then(setData)
      .catch((e) => { setData({ items: [], others: [] }); setError(e?.message || TX.failed); });
  }, [cwd, host]);

  useEffect(() => { if (visible) { setData(null); load(); } }, [visible, load]);

  const items = data?.items || [];
  const others = data?.others || [];

  const Row = ({ p }: { p: OpenPort }) => (
    <PressableRow
      onPress={() => { haptic.keyPress(); onPick(p.port); }}
      minHeight={44}
      radius={v2.radius.sm}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10 }}
    >
      <Globe size={17} color={C.textDim} />
      <Text style={{ flex: 1, color: C.text, fontSize: v2.font.size.small, fontFamily: v2.font.mono }}>{p.port}</Text>
      {p.command ? <Text numberOfLines={1} style={{ color: C.textDim, fontSize: v2.font.size.caption, maxWidth: 160 }}>{p.command}</Text> : null}
    </PressableRow>
  );
  const Head = ({ text, hint }: { text: string; hint?: string }) => (
    <View>
      <SectionHeader title={text} style={{ paddingHorizontal: 10, minHeight: 28 }} />
      {hint ? <Text style={{ color: C.textDim, fontSize: v2.font.size.caption, lineHeight: 16, paddingHorizontal: 10, marginTop: -4, marginBottom: 4 }}>{hint}</Text> : null}
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} maxHeightPct={0.78} title={TX.title}>
      {onBlank ? (
        <PressableRow
          onPress={() => { onClose(); onBlank(); }}
          minHeight={44}
          radius={v2.radius.sm}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, marginBottom: 2 }}
        >
          <Plus size={17} color={C.textDim} />
          <Text style={{ color: C.text, fontSize: v2.font.size.body }}>{TX.blank}</Text>
        </PressableRow>
      ) : null}

      {data === null ? (
        <View style={{ paddingVertical: 26, alignItems: 'center' }}><ActivityIndicator size="small" color={C.text3} /></View>
      ) : !items.length && !others.length ? (
        <EmptyState title={error || TX.empty} sub={!error ? TX.emptyHint : undefined} centered style={{ paddingTop: 16 }} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {items.length ? <Head text={TX.thisWorkspace} /> : null}
          {items.map((p) => <Row key={'i' + p.port} p={p} />)}
          {others.length ? <Head text={TX.elsewhere} hint={items.length ? undefined : TX.elsewhereHint} /> : null}
          {others.map((p) => <Row key={'o' + p.port} p={p} />)}
        </ScrollView>
      )}
    </Sheet>
  );
}
