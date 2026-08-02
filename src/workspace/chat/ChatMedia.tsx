import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, ActivityIndicator, Pressable } from 'react-native';
import Video from 'react-native-video';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { FileText, Image as ImageIcon, Play } from 'phosphor-react-native';

import { v2 } from '../../theme/v2Tokens';
import chatService from '../../services/chatService';
import { mediaRefOf, type MediaRef } from '../chatModel';

// 대화가 참조한 파일을 채팅에서 실제로 보여준다(사용자 확정 2026-08-02).
//
// 규칙(PC `chat-view.js` `_hydrateMedia` 와 같은 규칙 — 한쪽만 고치면 폰/PC 가 달라진다):
//  · `![라벨](경로)` = 마크다운의 "그려라" 문법 → **실제 이미지/영상**을 띄운다.
//  · `[라벨](경로)`·맨 경로 → **칩**(자동 로드 없음, 눌러야 열림).
//  · 어느 쪽이든 **경로를 캡션으로 남긴다** — 에이전트가 경로 자체를 보이려던 것이었어도 잃는 정보가 0.
//
// 바이트 출처: 데몬 `chat.file`(권한 = 그 대화가 내보낸 메시지에 적힌 경로만). 임의 경로 열람 통로가
//  아니므로 /var/folders 같은 홈 밖 스크린샷도 화면에 필요한 것만 통과한다.
// 실패는 조용히 빈 자리로 두지 않는다 — 사유를 한 줄로 적는다(앱이 고장 난 것처럼 보이지 않게).

const CAP_W = '100%';

function reasonText(reason?: string): string {
  if (reason === 'too_large') return '파일이 너무 커서 여기서는 못 보여줘요';
  if (reason === 'not_found') return '파일을 찾을 수 없어요';
  if (reason === 'unsupported') return '미리보기를 지원하지 않는 형식이에요';
  if (reason === 'not_referenced') return '이 대화에서 참조하지 않은 파일이에요';
  return '불러오지 못했어요';
}

/** 캡션 — 라벨(alt) + 파일명. 경로 전체는 길어서 파일명만 보이고 눌러 복사/열기는 상위가 처리. */
function Caption({ alt, name }: { alt?: string; name: string }) {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
      {alt ? <Text style={{ color: C.text3, fontSize: 11.5 }}>{alt}</Text> : null}
      <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11, fontFamily: v2.font.mono as string, flexShrink: 1 }}>{name}</Text>
    </View>
  );
}

/**
 * 인라인 미디어 — 이미지는 data URI 로, 영상은 캐시 파일로 내려 재생한다.
 *  (영상 base64 를 그대로 <Video> 에 물리면 iOS/Android 모두 불안정 → blob-util 로 파일에 쓴 뒤 재생.)
 */
export default function ChatMedia({ alt, target, chatId, host, onPress }: {
  alt?: string;
  target: string;
  /** 바이트를 받아올 대화 — 없으면(스냅샷 전) 로드하지 않고 자리만 잡는다. */
  chatId: string | null;
  host: number | null;
  /** 탭 = 크게 보기(이미지). 없으면 탭 무시. */
  onPress?: (a: { base64: string; mediaType: string; name: string }) => void;
}) {
  const C = v2.colors;
  const ref: MediaRef | null = mediaRefOf(target);
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [data, setData] = useState<{ base64?: string; mediaType?: string; fileUri?: string } | null>(null);
  const [why, setWhy] = useState('');
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const load = useCallback(async () => {
    if (!ref || state === 'loading' || state === 'ok') return;
    if (ref.via === 'url') { setData({ fileUri: ref.target }); setState('ok'); return; }
    if (!chatId) return;                       // 아직 대화가 안 열렸다 — 다음 렌더에서 다시 시도
    setState('loading');
    try {
      const r = await chatService.chatFile({ chatId, path: ref.target, host });
      if (!aliveRef.current) return;
      if (r.missing || !r.base64) { setWhy(reasonText(r.reason)); setState('fail'); return; }
      if (ref.kind === 'video') {
        // 영상은 캐시 파일로 떨어뜨려 재생한다(data URI 재생은 플랫폼별로 불안정).
        const dir = ReactNativeBlobUtil.fs.dirs.CacheDir + '/cpt-media';
        await ReactNativeBlobUtil.fs.mkdir(dir).catch(() => { /* 이미 있으면 무시 */ });
        const file = `${dir}/${Date.now()}-${(r.name || 'video').replace(/[^A-Za-z0-9._-]/g, '_')}`;
        await ReactNativeBlobUtil.fs.writeFile(file, r.base64, 'base64');
        if (!aliveRef.current) return;
        setData({ fileUri: 'file://' + file, mediaType: r.mediaType });
      } else {
        setData({ base64: r.base64, mediaType: r.mediaType });
      }
      setState('ok');
    } catch (_) {
      if (!aliveRef.current) return;
      setWhy('불러오지 못했어요');
      setState('fail');
    }
  }, [ref, chatId, host, state]);

  // 사용자 확정: **자동 로드**(화면에 들어오면 바로). FlatList 가 보이는 행만 마운트하므로
  //  마운트 시점 로드가 곧 "보일 때 로드"다(별도 뷰포트 관찰 불필요).
  useEffect(() => { void load(); }, [load]);

  if (!ref) return null;

  const body = () => {
    if (state === 'fail') {
      return (
        <View style={{ borderWidth: 1, borderColor: C.borderControl, borderStyle: 'dashed', borderRadius: v2.radius.sm, padding: 10 }}>
          <Text style={{ color: C.textDim, fontSize: 12 }}>{why}</Text>
        </View>
      );
    }
    if (state !== 'ok' || !data) {
      return (
        <View style={{ height: 120, borderRadius: v2.radius.md, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={C.text3} />
        </View>
      );
    }
    if (ref.kind === 'video') {
      return (
        <Video
          source={{ uri: data.fileUri! }}
          controls
          paused
          resizeMode="contain"
          style={{ width: CAP_W, height: 220, borderRadius: v2.radius.md, backgroundColor: '#000' }}
        />
      );
    }
    const uri = data.base64 ? `data:${data.mediaType || 'image/png'};base64,${data.base64}` : data.fileUri!;
    return (
      <Pressable onPress={() => { if (data.base64 && onPress) onPress({ base64: data.base64, mediaType: data.mediaType || 'image/png', name: ref.name }); }}>
        <Image source={{ uri }} resizeMode="contain" style={{ width: CAP_W, height: 220, borderRadius: v2.radius.md, backgroundColor: C.elevated }} />
      </Pressable>
    );
  };

  return (
    <View style={{ marginVertical: 6 }}>
      {body()}
      <Caption alt={alt} name={ref.name} />
    </View>
  );
}

/** 파일 칩 — 링크형 `[라벨](경로)`. 자동 로드하지 않는다(에이전트가 '표시'를 고르지 않았다). */
export function ChatFileChip({ label, target, onPress }: { label: string; target: string; onPress?: (ref: MediaRef) => void }) {
  const C = v2.colors;
  const ref = mediaRefOf(target);
  if (!ref) return null;
  const Icon = ref.kind === 'video' ? Play : ref.kind === 'image' ? ImageIcon : FileText;
  return (
    <Pressable
      onPress={() => onPress?.(ref)}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
        borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated,
      }}
    >
      <Icon size={12} color={C.text3} />
      <Text numberOfLines={1} style={{ color: C.text2, fontSize: 12.5, maxWidth: 220 }}>{label || ref.name}</Text>
    </Pressable>
  );
}
