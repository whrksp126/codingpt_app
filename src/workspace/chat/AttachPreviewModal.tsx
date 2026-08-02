import React from 'react';
import { Modal, Pressable, Image, Text, View } from 'react-native';
import { X } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import PressableScale from '../../components/ui/PressableScale';

// 첨부 이미지 미리보기(라이트박스) — PC `.chat-lightbox` 의 모바일 판.
//  칩(컴포저 스트립·보낸 메시지 인라인)을 탭하면 뜬다. 배경/✕ 로 닫는다.
export default function AttachPreviewModal({ item, onClose }: {
  /** base64(첨부 칩) 또는 uri(대화가 참조한 파일 — 캐시 파일 경로) 둘 중 하나로 온다. */
  item: { mediaType?: string; base64?: string; uri?: string; name: string } | null;
  onClose: () => void;
}) {
  const C = v2.colors;
  if (!item || (!item.base64 && !item.uri)) return null;
  const uri = item.uri || `data:${item.mediaType || 'image/png'};base64,${item.base64}`;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center', padding: 18 }} onPress={onClose}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, maxWidth: '90%' }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 13, flexShrink: 1 }}>{item.name}</Text>
          <PressableScale onPress={onClose} hitSlop={10} accessibilityLabel="닫기"
            style={{ width: 24, height: 24, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <X size={13} color="#fff" />
          </PressableScale>
        </View>
        <Pressable onPress={() => { /* 이미지 탭은 닫지 않는다 — 배경/✕ 만 */ }} style={{ maxWidth: '100%', maxHeight: '80%' }}>
          <Image
            source={{ uri }}
            style={{ width: 320, height: 420, maxWidth: '100%', borderRadius: 10, backgroundColor: C.elevated }}
            resizeMode="contain"
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
