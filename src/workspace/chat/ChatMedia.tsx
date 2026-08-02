import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, ActivityIndicator, Pressable, type LayoutChangeEvent } from 'react-native';
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
// ★ 두 가지 실사고를 여기서 구조적으로 막는다(2026-08-02 사용자 신고):
//  ① "이미지가 반복적으로 다시 그려진다" — 리스트가 갱신될 때마다(statusline push 3초, 모드 갱신 등)
//     행이 리렌더/리마운트되면서 **매번 다시 받아왔다**. → 받은 바이트는 **캐시 파일로 한 번만**
//     떨어뜨리고, 모듈 수준 캐시(경로→file:// URI)로 재사용한다. RN Image 는 같은 URI 를 자체
//     캐시하므로 리마운트돼도 깜빡이지 않는다. base64 를 state 로 들고 있지 않으니 메모리도 가볍다.
//  ② "정해진 박스에 이미지를 우겨넣은 느낌" — 높이를 220 으로 고정했었다. → **원본 비율 그대로**
//     그린다(PC `.chat-media-el { max-height: 420; width: auto }` 미러): 실제 픽셀 크기를 재서
//     컨테이너 폭 안에 맞추되 높이 상한(420)을 넘으면 폭을 줄인다 = PC 와 같은 배치 규칙.
//
// 바이트 출처: 데몬 `chat.file`(권한 = 그 대화가 내보낸 메시지에 적힌 경로만).

/** 경로→로컬 캐시 파일 + 비율. 모듈 수명(앱이 살아 있는 동안) 유지 = 리마운트해도 재다운로드 없음. */
const mediaCache = new Map<string, { uri: string; mediaType: string; aspect?: number }>();
const MEDIA_CACHE_MAX = 60;                      // 경로 수 상한(값은 URI 문자열이라 메모리 영향 미미)
/** PC `.chat-media-el { max-height: 420px }` 와 같은 값 — 세로로 긴 스크린샷이 화면을 다 먹지 않게. */
const MAX_H = 420;

function reasonText(reason?: string): string {
  if (reason === 'too_large') return '파일이 너무 커서 여기서는 못 보여줘요';
  if (reason === 'not_found') return '파일을 찾을 수 없어요';
  if (reason === 'unsupported') return '미리보기를 지원하지 않는 형식이에요';
  if (reason === 'not_referenced') return '이 대화에서 참조하지 않은 파일이에요';
  return '불러오지 못했어요';
}

function cachePut(key: string, v: { uri: string; mediaType: string; aspect?: number }) {
  if (mediaCache.size >= MEDIA_CACHE_MAX) {
    const oldest = mediaCache.keys().next().value;
    if (oldest) mediaCache.delete(oldest);
  }
  mediaCache.set(key, v);
}

/** 캡션 — 라벨(alt) + 파일명. PC 캡션(.chat-media-cap)과 같은 구성. */
function Caption({ alt, name }: { alt?: string; name: string }) {
  const C = v2.colors;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
      {alt ? <Text style={{ color: C.text3, fontSize: 11.5 }}>{alt}</Text> : null}
      <Text numberOfLines={1} style={{ color: C.textDim, fontSize: 11, fontFamily: v2.font.mono as string, flexShrink: 1 }}>{name}</Text>
    </View>
  );
}

export default function ChatMedia({ alt, target, chatId, host, onPress }: {
  alt?: string;
  target: string;
  /** 바이트를 받아올 대화 — 없으면(스냅샷 전) 로드하지 않고 자리만 잡는다. */
  chatId: string | null;
  host: number | null;
  /** 탭 = 크게 보기(이미지). 없으면 탭 무시. */
  onPress?: (a: { uri: string; mediaType: string; name: string }) => void;
}) {
  const C = v2.colors;
  // ★ 매 렌더마다 새 객체를 만들면 아래 effect 의 의존성이 매번 바뀌어 **무한 재로드**가 된다.
  const ref: MediaRef | null = useMemo(() => mediaRefOf(target), [target]);
  const key = `${chatId || '-'}|${target}`;
  const cached = mediaCache.get(key);

  const [media, setMedia] = useState<{ uri: string; mediaType: string; aspect?: number } | null>(cached || null);
  const [fail, setFail] = useState('');
  const [boxW, setBoxW] = useState(0);
  const aliveRef = useRef(true);
  const startedRef = useRef(false);           // 이 마운트에서 이미 요청했는가(중복 요청 차단)
  useEffect(() => () => { aliveRef.current = false; }, []);

  const measure = useCallback((uri: string, mediaType: string) => {
    Image.getSize(
      uri,
      (w, h) => {
        if (!aliveRef.current || !w || !h) return;
        const v = { uri, mediaType, aspect: w / h };
        cachePut(key, v);
        setMedia(v);
      },
      () => { /* 못 재면 기본 비율로 그린다 */ },
    );
  }, [key]);

  useEffect(() => {
    if (!ref || media || fail || startedRef.current) return;
    if (ref.via === 'url') { const v = { uri: ref.target, mediaType: '' }; setMedia(v); measure(ref.target, ''); return; }
    if (!chatId) return;                       // 아직 대화가 안 열렸다 — chatId 가 오면 이 effect 가 다시 돈다
    startedRef.current = true;
    (async () => {
      try {
        const r = await chatService.chatFile({ chatId, path: ref.target, host });
        if (!aliveRef.current) return;
        if (r.missing || !r.base64) { setFail(reasonText(r.reason)); return; }
        // ★ base64 를 state 에 들고 있지 않는다 — 캐시 **파일**로 떨어뜨리고 URI 만 쓴다.
        //  (RN Image/Video 가 URI 를 자체 캐시하므로 리렌더·리마운트에 재다운로드가 없다.)
        const dir = ReactNativeBlobUtil.fs.dirs.CacheDir + '/cpt-media';
        await ReactNativeBlobUtil.fs.mkdir(dir).catch(() => { /* 이미 있으면 무시 */ });
        const safe = (r.name || ref.name).replace(/[^A-Za-z0-9._-]/g, '_');
        const file = `${dir}/${(r.bytes || 0)}-${safe}`;
        if (!(await ReactNativeBlobUtil.fs.exists(file).catch(() => false))) {
          await ReactNativeBlobUtil.fs.writeFile(file, r.base64, 'base64');
        }
        if (!aliveRef.current) return;
        const uri = 'file://' + file;
        const v = { uri, mediaType: r.mediaType || '' };
        cachePut(key, v);
        setMedia(v);
        if (ref.kind !== 'video') measure(uri, v.mediaType);   // 원본 비율 확보(고정 박스 금지)
      } catch (_) {
        if (aliveRef.current) setFail('불러오지 못했어요');
      }
    })();
  }, [ref, chatId, host, media, fail, key, measure]);

  if (!ref) return null;

  // 원본 비율 그대로 — 폭에 맞추되 높이 상한(MAX_H)을 넘으면 폭을 줄인다(PC 와 같은 규칙).
  const aspect = media?.aspect || (ref.kind === 'video' ? 16 / 9 : 4 / 3);
  const fitW = boxW > 0 ? Math.min(boxW, MAX_H * aspect) : 0;
  const fitH = fitW > 0 ? fitW / aspect : 200;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== boxW) setBoxW(w);
  };

  const body = () => {
    if (fail) {
      return (
        <View style={{ borderWidth: 1, borderColor: C.borderControl, borderStyle: 'dashed', borderRadius: v2.radius.sm, padding: 10, alignSelf: 'flex-start' }}>
          <Text style={{ color: C.textDim, fontSize: 12 }}>{fail}</Text>
        </View>
      );
    }
    if (!media) {
      return (
        <View style={{ height: 120, borderRadius: v2.radius.md, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={C.text3} />
        </View>
      );
    }
    if (ref.kind === 'video') {
      return (
        <Video
          source={{ uri: media.uri }}
          controls
          paused
          resizeMode="contain"
          onLoad={(d: any) => {
            const n = d?.naturalSize;
            if (n?.width && n?.height) {
              const v = { ...media, aspect: n.width / n.height };
              cachePut(key, v);
              setMedia(v);
            }
          }}
          style={{ width: fitW || '100%', height: fitH, borderRadius: v2.radius.md, backgroundColor: '#000' }}
        />
      );
    }
    return (
      <Pressable onPress={() => onPress?.({ uri: media.uri, mediaType: media.mediaType, name: ref.name })}>
        <Image
          source={{ uri: media.uri }}
          // 원본 비율로 정확히 맞춘 상자라 contain/cover 차이가 없다(여백 없이 딱 맞는다).
          resizeMode="cover"
          style={{ width: fitW || '100%', height: fitH, borderRadius: v2.radius.md, backgroundColor: C.elevated }}
        />
      </Pressable>
    );
  };

  return (
    <View style={{ marginVertical: 6 }} onLayout={onLayout}>
      {body()}
      <Caption alt={alt} name={ref.name} />
    </View>
  );
}

/** 파일 칩 — 링크형 `[라벨](경로)`. 자동 로드하지 않는다(에이전트가 '표시'를 고르지 않았다). */
export function ChatFileChip({ label, target, onPress }: { label: string; target: string; onPress?: (ref: MediaRef) => void }) {
  const C = v2.colors;
  const ref = useMemo(() => mediaRefOf(target), [target]);
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
