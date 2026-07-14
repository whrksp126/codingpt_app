import React from 'react';
import { View, Text, Pressable, ScrollView, Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AgentDiff } from '../../services/agentService';

// 에이전트 수정 승인 diff 모달 — 메인 채팅·IDE 공용.
// (MobileIDEScreen 의 동일 컴포넌트를 추출. 컨텍스트 pendingPermission 을 받아 표시.)

type DiffLine = { kind: 'ctx' | 'del' | 'add'; text: string };

// 공통 prefix/suffix 를 잘라낸 컴팩트 라인 diff (앞뒤 2줄 컨텍스트)
const lineDiff = (oldStr: string, newStr: string): DiffLine[] => {
  const a = (oldStr || '').split('\n');
  const b = (newStr || '').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const out: DiffLine[] = [];
  for (let i = Math.max(0, start - 2); i < start; i++) out.push({ kind: 'ctx', text: a[i] });
  for (let i = start; i < endA; i++) out.push({ kind: 'del', text: a[i] });
  for (let i = start; i < endB; i++) out.push({ kind: 'add', text: b[i] });
  for (let i = endA; i < Math.min(a.length, endA + 2); i++) out.push({ kind: 'ctx', text: a[i] });
  return out;
};

const diffToLines = (diff: AgentDiff): DiffLine[] => {
  if (!diff) return [];
  if (diff.kind === 'edit') return lineDiff(diff.oldString, diff.newString);
  if (diff.kind === 'write') return lineDiff(diff.oldContent, diff.newContent);
  if (diff.kind === 'multiedit') {
    const out: DiffLine[] = [];
    diff.edits.forEach((e, i) => {
      if (i > 0) out.push({ kind: 'ctx', text: '⋯' });
      out.push(...lineDiff(e.oldString, e.newString));
    });
    return out;
  }
  return [];
};

const DIFF_LINE_CAP = 400;

export type PendingPermission = { requestId: string; tool: string; relPath?: string; diff: AgentDiff } | null;

interface Props {
  pending: PendingPermission;
  onApprove: () => void;
  onReject: () => void;
}

const PermissionDiffModal: React.FC<Props> = ({ pending, onApprove, onReject }) => {
  const insets = useSafeAreaInsets();
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  const isNewFile = pending?.diff?.kind === 'write' && !pending.diff.oldContent;
  const title = isNewFile ? '새 파일 생성' : pending?.tool === 'Write' ? '파일 덮어쓰기' : '파일 수정';
  const allLines = pending ? diffToLines(pending.diff) : [];
  const lines = allLines.slice(0, DIFF_LINE_CAP);
  const truncated = allLines.length - lines.length;

  return (
    <Modal supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']} visible={!!pending} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onReject}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <View style={{ backgroundColor: '#0E121B', borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '82%', borderTopWidth: 1, borderColor: '#1C2230' }}>
          <View style={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#1C2230' }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{title}</Text>
            {pending?.relPath ? (
              <Text style={{ color: '#93C5FD', fontSize: 12.5, fontFamily: mono, marginTop: 6 }} numberOfLines={1}>{pending.relPath}</Text>
            ) : null}
            <Text style={{ color: '#64748B', fontSize: 12, marginTop: 6 }}>에이전트가 이 변경을 적용하려고 합니다. 검토 후 승인하세요.</Text>
          </View>

          <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingVertical: 6 }}>
            {lines.length === 0 ? (
              <Text style={{ color: '#64748B', fontSize: 13, padding: 18 }}>표시할 변경 내용이 없습니다.</Text>
            ) : (
              lines.map((ln, i) => {
                const bg = ln.kind === 'del' ? 'rgba(248,81,73,0.13)' : ln.kind === 'add' ? 'rgba(52,211,153,0.13)' : 'transparent';
                const color = ln.kind === 'del' ? '#FCA5A5' : ln.kind === 'add' ? '#6EE7B7' : '#64748B';
                const sign = ln.kind === 'del' ? '-' : ln.kind === 'add' ? '+' : ' ';
                return (
                  <View key={i} style={{ flexDirection: 'row', backgroundColor: bg, paddingHorizontal: 14 }}>
                    <Text style={{ color, fontFamily: mono, fontSize: 12, width: 14 }}>{sign}</Text>
                    <Text style={{ color, fontFamily: mono, fontSize: 12, flex: 1 }}>{ln.text}</Text>
                  </View>
                );
              })
            )}
            {truncated > 0 ? (
              <Text style={{ color: '#64748B', fontSize: 12, padding: 14 }}>… 외 {truncated}줄 (생략됨)</Text>
            ) : null}
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 12, borderTopWidth: 1, borderTopColor: '#1C2230' }}>
            <Pressable onPress={onReject} style={{ flex: 1, height: 46, borderRadius: 12, borderWidth: 1, borderColor: '#3A2030', backgroundColor: '#1A1014', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#F87171', fontSize: 15, fontWeight: '600' }}>거부</Text>
            </Pressable>
            <Pressable onPress={onApprove} style={{ flex: 1.4, height: 46, borderRadius: 12, backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>승인</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default PermissionDiffModal;
