import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ActivityIndicator, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatCircleDots, GitBranch } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import chatService, { type ChatSessionRow } from '../../services/chatService';

const C = v2.colors;
const R = v2.radius;

// 대화 고르기 시트 — **'ambiguous' 에서만** 쓰는 조용한 보조 액션("다른 대화 보기").
//
// 왜 ambiguous 에서만인가: 데몬이 이 터미널의 바인딩을 못 찾고 후보가 2개 이상일 때만 "어느 대화인지"를
//  사람이 정할 수 있다. 'not_started'(바인딩은 있는데 대화가 아직 없음)에서 목록을 들이대면 **다른
//  터미널의 대화를 이 터미널 것처럼 보여주게** 되고, 그게 이 라운드가 고치는 원래 증상이다.
//
// 목록 원천 = `chat.sessions` RPC(기존). 실패를 빈 목록으로 위장하지 않는다(오프라인/권한을 그대로 보여준다).

/** 마지막 활동 시각 — 데몬이 주는 ISO 문자열을 그대로 찍으면 읽히지 않는다(짧은 상대 표기). */
function shortWhen(iso: string): string {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return iso || '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}
export default function ChatSessionsSheet({ visible, onClose, onPick, cwd, host }: {
  visible: boolean;
  onClose: () => void;
  /** 고른 대화의 sessionId — 호출부가 탭에 기억시키고 그 세션으로 재오픈한다. */
  onPick: (sessionId: string) => void;
  cwd: string;
  host: number | null;
}) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<ChatSessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setErr(null); setLoading(true);
    let alive = true;
    chatService.chatSessions(cwd, host)
      .then((r) => { if (alive) { setRows(r.sessions); setLoading(false); } })
      .catch((e: unknown) => { if (alive) { setErr(String((e as Error)?.message || e)); setLoading(false); } });
    return () => { alive = false; };
  }, [visible, cwd, host]);

  return (
    <Modal
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}
    >
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(5,7,12,0.62)' }} onPress={onClose} />
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.surface,
        borderTopWidth: 1, borderTopColor: C.borderControl, borderTopLeftRadius: 18, borderTopRightRadius: 18,
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 16) + 12, maxHeight: '80%',
      }}>
        <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: C.borderControl, alignSelf: 'center', marginBottom: 12 }} />
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>대화 선택</Text>
        <Text style={{ fontSize: 12, color: C.textDim, marginTop: 3, marginBottom: 8 }}>이 터미널에 이어 붙일 대화</Text>

        <View style={{ minHeight: 120, maxHeight: 400 }}>
          {loading ? (
            <ActivityIndicator color={C.accent} style={{ marginVertical: 30 }} />
          ) : err ? (
            <Text style={{ color: C.error, fontSize: 12.5, paddingVertical: 24, textAlign: 'center' }}>{err}</Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(s) => s.sessionId}
              ListEmptyComponent={<Text style={{ color: C.textDim, fontSize: 12.5, paddingVertical: 24, textAlign: 'center' }}>대화가 없어요</Text>}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => { onPick(item.sessionId); onClose(); }}
                  android_ripple={{ color: C.elevated2 }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: R.sm }}
                >
                  <ChatCircleDots size={16} color={item.live ? C.accent : C.textDim} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: C.text, fontSize: 13.5, fontWeight: '600' }}>
                      {item.title || item.lastPrompt || item.sessionId.slice(0, 8)}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11 }}>{shortWhen(item.lastAt)}</Text>
                      {item.gitBranch ? (
                        <>
                          <GitBranch size={11} color={C.textDim} />
                          <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11 }}>{item.gitBranch}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>

        <Pressable onPress={onClose} style={{ height: 46, borderRadius: R.md, backgroundColor: C.elevated2, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
          <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>닫기</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
