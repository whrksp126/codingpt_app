import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Plus, X, Cloud, GithubLogo, Laptop, CaretDown, FolderSimple, Camera, FileArrowUp } from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { FileTypeIcon } from '../module/ide/fileTypeIcons';
import V2Sheet from '../v2/V2Sheet';

const C = v2.colors;

// 첨부 미리보기 — 이미지는 썸네일, 그 외 파일은 아이콘+파일명. (Attachment 와 호환)
export type AttachmentPreview = { name: string; mime?: string; base64?: string };
const isImageAttachment = (a: AttachmentPreview) => (a.mime || '').startsWith('image/') && !!a.base64;

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
  // 첨부 미리보기(이미지 썸네일 / 파일 아이콘+이름)
  attachments?: AttachmentPreview[];
  onRemoveAttachment?: (name: string) => void;
  onAttach?: () => void;            // 파일 선택(기존)
  onPickCamera?: () => void;        // 카메라 촬영 — 있으면 + 버튼이 카메라/파일 메뉴를 띄움
  // 하단 세이프에어리어 적용 여부(키보드 회피 컨테이너 안이면 false 로 줄 수 있음)
  safeBottom?: boolean;
}

// 공통 채팅 입력 영역 — 환경/경로 행 + 첨부 칩 + 10줄 입력 + 첨부/전송.
// 어디서든 동일하게 사용(홈 랜딩/채팅, 추후 IDE 등).
const ChatComposer: React.FC<Props> = ({
  value, onChange, onSend, running, placeholder = '메시지 입력하기', sendLabel,
  env, workspace, attachments, onRemoveAttachment, onAttach, onPickCamera, safeBottom = true,
}) => {
  const insets = useSafeAreaInsets();
  const canSend = (value.trim().length > 0 || (attachments?.length ?? 0) > 0) && !running;
  const envMeta = env ? ENV_META[env.type] : null;
  const [attachMenu, setAttachMenu] = useState(false);
  // + 버튼: 카메라 핸들러가 있으면 선택 메뉴, 없으면 바로 파일 선택.
  const onPlus = () => { if (onPickCamera) setAttachMenu(true); else onAttach?.(); };

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
        {/* 첨부 미리보기 — 이미지=썸네일, 파일=아이콘+파일명(말줄임). 동일 48px 사이즈. */}
        {attachments && attachments.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {attachments.map((a) => {
              const removeBtn = onRemoveAttachment ? (
                <Pressable onPress={() => onRemoveAttachment(a.name)} hitSlop={6} style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={11} color="#fff" weight="bold" />
                </Pressable>
              ) : null;
              if (isImageAttachment(a)) {
                return (
                  <View key={a.name} style={{ width: 48, height: 48 }}>
                    <Image source={{ uri: `data:${a.mime};base64,${a.base64}` }} style={{ width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: C.borderControl }} />
                    {removeBtn}
                  </View>
                );
              }
              return (
                <View key={a.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderControl, borderRadius: 10, paddingRight: 10, height: 48 }}>
                  <View style={{ width: 48, height: 48, borderTopLeftRadius: 9, borderBottomLeftRadius: 9, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center' }}>
                    <FileTypeIcon name={a.name} size={24} />
                  </View>
                  <Text style={{ color: C.text2, fontSize: 12.5, maxWidth: 130 }} numberOfLines={1} ellipsizeMode="middle">{a.name}</Text>
                  {onRemoveAttachment ? (
                    <Pressable onPress={() => onRemoveAttachment(a.name)} hitSlop={6} style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                      <X size={13} color={C.textDim} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
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
          {onAttach || onPickCamera ? (
            <Pressable onPress={onPlus} hitSlop={8} style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
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

      {/* 첨부 선택 메뉴 — 카메라 촬영 / 파일 선택 */}
      <V2Sheet visible={attachMenu} onClose={() => setAttachMenu(false)} background={C.surface} maxHeightPct={0.5}>
        <View style={{ paddingHorizontal: 14, paddingTop: 2 }}>
          <Pressable onPress={() => { setAttachMenu(false); onPickCamera?.(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 8 }}>
            <Camera size={22} color={C.accent} weight="fill" />
            <Text style={{ color: C.text, fontSize: 15.5, fontWeight: '600' }}>카메라로 촬영</Text>
          </Pressable>
          <Pressable onPress={() => { setAttachMenu(false); onAttach?.(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 8, borderTopWidth: 1, borderColor: C.border }}>
            <FileArrowUp size={22} color={C.text2} weight="fill" />
            <Text style={{ color: C.text, fontSize: 15.5, fontWeight: '600' }}>파일 선택</Text>
          </Pressable>
        </View>
      </V2Sheet>
    </View>
  );
};

export default ChatComposer;
