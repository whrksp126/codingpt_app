import React from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { FolderSimple, Plus, Check, Cloud, GithubLogo, Laptop } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { WorkspaceMeta } from '../../services/workspaceService';

const C = v2.colors;

// 작업 환경 — 서버 활성, 로컬/GitHub 곧 제공
const ENV_OPTS: { type: 'server' | 'github' | 'local'; label: string; desc: string; Icon: any; enabled: boolean }[] = [
  { type: 'server', label: '서버', desc: 'objectstore에 저장 (현재)', Icon: Cloud, enabled: true },
  { type: 'github', label: 'GitHub', desc: '내 레포지토리에 동기화 (곧 제공)', Icon: GithubLogo, enabled: false },
  { type: 'local', label: '로컬 (내 PC)', desc: '내 컴퓨터를 런너로 연결 (곧 제공)', Icon: Laptop, enabled: false },
];

interface Props {
  visible: boolean;
  workspaces: WorkspaceMeta[];
  activeId?: string | null;
  onPick: (ws: WorkspaceMeta) => void;   // 워크스페이스 선택 → 그 워크스페이스에 새 세션
  onCreateNew: () => void;               // + 새 워크스페이스 → 랜딩 컴포저
  onClose: () => void;
  insetsBottom: number;
}

// 워크스페이스 선택 시트 — 선택 시 해당 워크스페이스에 새 세션, 활성 워크스페이스 재선택은 무반응(닫기만).
const WorkspacePickerSheet: React.FC<Props> = ({ visible, workspaces, activeId, onPick, onCreateNew, onClose, insetsBottom }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={onClose} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', backgroundColor: C.elevated, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 1, borderColor: C.border, paddingTop: 18, paddingBottom: Math.max(insetsBottom, 16) + 16 }}>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 4, gap: 8 }}>
          {/* 작업 환경 */}
          <Text style={{ color: C.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, paddingHorizontal: 6, marginBottom: 2 }}>작업 환경</Text>
          {ENV_OPTS.map((o) => (
            <View key={o.type} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: o.enabled ? C.accent : C.border, backgroundColor: C.surface, opacity: o.enabled ? 1 : 0.55 }}>
              <o.Icon size={19} color={o.enabled ? C.accent : C.textDim} weight="fill" />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.text, fontSize: 14, fontWeight: '600' }}>{o.label}</Text>
                <Text style={{ color: C.textDim, fontSize: 11.5, marginTop: 1 }}>{o.desc}</Text>
              </View>
              {o.enabled ? <Check size={17} color={C.accent} weight="bold" /> : null}
            </View>
          ))}

          {/* 워크스페이스 */}
          <Text style={{ color: C.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.3, paddingHorizontal: 6, marginTop: 10, marginBottom: 2 }}>워크스페이스</Text>
          {workspaces.map((ws) => {
            const active = ws.id === activeId;
            return (
              <Pressable
                key={ws.id}
                onPress={() => onPick(ws)}
                android_ripple={{ color: C.elevated2 }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: active ? C.accent : C.border, backgroundColor: C.surface }}
              >
                <FolderSimple size={19} color={active ? C.accent : C.text3} weight="fill" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: C.text, fontSize: 14.5, fontWeight: '600' }} numberOfLines={1}>{ws.name}</Text>
                  {ws.description ? (
                    <Text style={{ color: C.textDim, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{ws.description}</Text>
                  ) : null}
                </View>
                {active ? <Check size={18} color={C.accent} weight="bold" /> : null}
              </Pressable>
            );
          })}

          <Pressable
            onPress={onCreateNew}
            android_ripple={{ color: C.elevated2 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', backgroundColor: 'transparent' }}
          >
            <Plus size={19} color={C.accent} weight="bold" />
            <Text style={{ flex: 1, color: C.text2, fontSize: 14.5, fontWeight: '600' }}>새 워크스페이스</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
};

export default WorkspacePickerSheet;
