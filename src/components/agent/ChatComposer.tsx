import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Plus, X, Cloud, GithubLogo, Laptop, CaretDown, FolderSimple } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { FileTypeIcon } from '../module/ide/fileTypeIcons';

const C = v2.colors;
const baseOf = (p: string) => (p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p);

// 상단 페이드 — linear-gradient 미설치라 rgba(base) 레이어를 쌓아 투명→base 근사.
// 채팅 내역이 입력창 아래로 흐려지며 사라지는 느낌(보더 대신).
const FADE_H = 26;
const FADE_LAYERS = [0, 0.06, 0.16, 0.3, 0.48, 0.68, 0.88];
const Fade = () => (
  <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: -FADE_H, height: FADE_H }}>
    {FADE_LAYERS.map((a, i) => (
      <View key={i} style={{ flex: 1, backgroundColor: `rgba(10,13,20,${a})` }} />
    ))}
  </View>
);

export type SourceEnv = 'server' | 'local' | 'github';

const ENV_META: Record<SourceEnv, { label: string; Icon: any }> = {
  server: { label: '서버', Icon: Cloud },
  local: { label: '로컬', Icon: Laptop },
  github: { label: 'GitHub', Icon: GithubLogo },
};

interface Props {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  running?: boolean;
  placeholder?: string;
  sendLabel?: string;                 // 있으면 아이콘+텍스트 버튼(랜딩=만들기)
  // 작업 환경 셀렉터(서버/로컬/깃) — 따로 구분
  env?: { type: SourceEnv; onPress?: () => void };
  // 워크스페이스 셀렉터 — 환경 칩 옆에 따로
  workspace?: { name: string; onPress?: () => void };
  // 첨부(파일/소스) 칩
  attachments?: string[];
  onRemoveAttachment?: (p: string) => void;
  onAttach?: () => void;
  // 하단 세이프에어리어 적용 여부(키보드 회피 컨테이너 안이면 false 로 줄 수 있음)
  safeBottom?: boolean;
}

// 공통 채팅 입력 영역 — 환경/경로 행 + 첨부 칩 + 10줄 입력 + 첨부/전송.
// 어디서든 동일하게 사용(홈 랜딩/채팅, 추후 IDE 등).
const ChatComposer: React.FC<Props> = ({
  value, onChange, onSend, running, placeholder = '메시지 입력하기', sendLabel,
  env, workspace, attachments, onRemoveAttachment, onAttach, safeBottom = true,
}) => {
  const insets = useSafeAreaInsets();
  const canSend = (value.trim().length > 0 || (attachments?.length ?? 0) > 0) && !running;
  const envMeta = env ? ENV_META[env.type] : null;

  return (
    <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: (safeBottom ? Math.max(insets.bottom, 10) : 10) + 4, backgroundColor: C.base }}>
      <Fade />
      {/* 작업 환경 + 워크스페이스 — 각각 따로 선택 */}
      {(env && envMeta) || workspace ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {env && envMeta ? (
            <Pressable
              onPress={env.onPress}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}
            >
              <envMeta.Icon size={14} color={C.accent} weight="fill" />
              <Text style={{ color: C.text2, fontSize: 12, fontWeight: '600' }}>{envMeta.label}</Text>
              <CaretDown size={11} color={C.textDim} />
            </Pressable>
          ) : null}
          {workspace ? (
            <Pressable
              onPress={workspace.onPress}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 }}
            >
              <FolderSimple size={14} color={C.accent} weight="fill" />
              <Text style={{ flex: 1, color: C.text2, fontSize: 12, fontWeight: '600', fontFamily: v2.font.mono }} numberOfLines={1}>{workspace.name}</Text>
              <CaretDown size={11} color={C.textDim} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={{ backgroundColor: C.elevated2, borderRadius: 14, padding: 12 }}>
        {/* 첨부 칩 */}
        {attachments && attachments.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
            {attachments.map((p) => (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderControl, borderRadius: 8, paddingLeft: 8, paddingRight: 4, paddingVertical: 4, marginRight: 6 }}>
                <FileTypeIcon name={p} size={13} />
                <Text style={{ color: C.text2, fontSize: 12 }} numberOfLines={1}>{baseOf(p)}</Text>
                {onRemoveAttachment ? (
                  <Pressable onPress={() => onRemoveAttachment(p)} hitSlop={6} style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                    <X size={12} color={C.textDim} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </ScrollView>
        ) : null}

        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={C.textDim}
          multiline
          editable={!running}
          style={{ color: C.text, fontSize: 14, maxHeight: 200, minHeight: 24, textAlignVertical: 'top', padding: 0 }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          {onAttach ? (
            <Pressable onPress={onAttach} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={20} color={C.text3} />
            </Pressable>
          ) : <View style={{ width: 4 }} />}
          <View style={{ flex: 1 }} />
          {sendLabel ? (
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.cta, opacity: canSend ? 1 : 0.5 }}
            >
              {running ? <ActivityIndicator size="small" color="#fff" /> : <ArrowUp size={15} color="#fff" weight="bold" />}
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{sendLabel}</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.infoStrong, alignItems: 'center', justifyContent: 'center', opacity: canSend ? 1 : 0.5 }}
            >
              {running ? <ActivityIndicator size="small" color="#fff" /> : <ArrowUp size={18} color="#fff" weight="bold" />}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

export default ChatComposer;
