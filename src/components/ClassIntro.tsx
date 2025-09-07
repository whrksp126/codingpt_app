// src/components/CourseIntroShowcase.tsx
import React from 'react';
import { View, Text, Image, ScrollView } from 'react-native';

/** 블록 타입 */
export type ShowcaseBlock =
  | { type: 'headline'; kicker?: string; title: string; subtitle?: string; hero?: string | number; tags?: string[]; stats?: { label: string; value: string }[] }
  | { type: 'featureCards'; items: { emoji: string; title: string; desc: string }[] } // ← 임팩트 카드로 렌더
  | { type: 'mosaic'; headline?: string; sub?: string; badges: { emoji: string; title: string; desc: string }[]; image?: string | number }
  | { type: 'timeline'; title?: string; subtitle?: string; items: { step: string; title: string; desc: string }[] } // ← ✅ 소제목/설명 추가
  | { type: 'code'; lang: 'html' | 'css' | 'js'; content: string }
  | { type: 'cta'; text: string }
  | { type: 'divider' };

export default function ClassIntroShowcase({ blocks }: { blocks: ShowcaseBlock[] }) {
  return (
    <View className="bg-white">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'headline': return <Headline key={i} {...b} />;
          case 'featureCards': return <ImpactFeatures key={i} items={b.items} />;
          case 'mosaic': return <GameMosaic key={i} {...b} />;
          case 'timeline': return <FancyTimeline key={i} {...b} />;
          case 'code': return <PrettyCode key={i} lang={b.lang} content={b.content} />;
          case 'cta':
            return (
              <View key={i} className="mb-6 rounded-2xl border border-[#dff0cf] bg-[#eef7e8] px-3 py-3">
                <Text className="text-[18px] font-semibold text-[#2b6a00] mb-2">🚀 지금 감 잡았어!</Text>
                <Text className="text-[15px] text-[#2b6a00]">{b.text}</Text>
              </View>
            );
          case 'divider': return <View key={i} className="my-2 h-[1px] bg-[#eef1e9]" />;
          default: return null;
        }
      })}
    </View>
  );
}

/* ───────── Headline ───────── */
const Headline = ({ kicker, title, subtitle, hero, tags, stats }: any) => (
  <View className="rounded-3xl overflow-hidden mb-6" style={{ shadowColor:'#000', shadowOpacity:0.08, shadowRadius:12, elevation:3 }}>
    <View className="relative bg-white">
      <View className="absolute -top-10 -right-12 w-44 h-44 rounded-full" style={{ backgroundColor:'#eaffd5' }} />
      <View className="absolute -bottom-14 -left-16 w-52 h-52 rounded-full" style={{ backgroundColor:'#ffffff' }} />
      <View className="px-4 pt-5 pb-4">
        {kicker && (
          <View className="self-start flex-row items-center gap-2 px-3 py-1.5 rounded-full border border-[#e7f3de]" style={{ backgroundColor:'#f3f9ef' }}>
            <View className="w-2 h-2 rounded-full" style={{ backgroundColor:'#58CC02' }} />
            <Text className="text-[12px] font-semibold text-[#2b6a00]">{kicker}</Text>
          </View>
        )}
        <Text className="mt-2 text-[22px] font-extrabold text-[#111]">{title}</Text>
        {subtitle ? <Text className="mt-1 text-[15px] text-[#5d646f]">{subtitle}</Text> : null}

        {tags?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4 mt-3 pl-4" contentContainerStyle={{ paddingRight:16 }}>
            {tags.map((tag: string, idx: number) => (
              <View key={idx} className="mr-2 rounded-full border px-3 py-1.5" style={{ backgroundColor:'#eef7e8', borderColor:'#dff0cf' }}>
                <Text className="text-[13px] font-bold text-[#2b6a00]">#{tag}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}

        {stats?.length ? (
          <View className="mt-3 flex-row gap-2">
            {stats.map((s: any, idx: number) => (
              <View key={idx} className="flex-1 items-center rounded-xl border px-3 py-2 bg-white" style={{ borderColor:'#eef1e9' }}>
                <Text className="text-[13px] text-[#5d646f]">{s.label}</Text>
                <Text className="pt-0.5 text-[15px] font-bold">{s.value}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {hero && (
        <View className="px-4 pb-4">
          <View className="overflow-hidden rounded-2xl">
            <Image 
              source={typeof hero === 'string' ? { uri: hero } : hero} 
              className="w-full h-[360px]" 
              resizeMode="contain" 
            />
          </View>
        </View>
      )}
    </View>
  </View>
);

/* ───────── featureCards → HIGHLIGHT ───────── */
const ImpactFeatures = ({ items }: { items: { emoji: string; title: string; desc: string }[] }) => (
  <View className="mb-6">
    {items.map((it, k) => (
      <View key={k} className="mb-3 rounded-2xl overflow-hidden" style={{ shadowColor:'#000', shadowOpacity:0.1, shadowRadius:14, elevation:3 }}>
        {/* 엣지 그라디언트 밴드 */}
        <View style={{ height: 6, backgroundColor: '#c8f0a0' }} />
        <View className="relative border border-[#e7efd9] bg-white p-5">
          {/* 입체 배지 - 절대 위치 */}
          <View className="absolute -top-[-5] -right-0 rounded-full border border-[#cfeec2] px-4 py-1.5 mr-1.5" style={{ backgroundColor:'#eefae6' }}>
            <Text className="text-[12px] font-bold text-[#2b6a00]">{it.emoji} HIGHLIGHT</Text>
          </View>
          {/* 타이틀 + 설명 */}
          <View className="flex-row items-center py-2">
            <View className="mr-2 rounded-2xl items-center justify-center" style={{ width: 45, height: 45, backgroundColor:'#eaffd5' }}>
              <Text className="text-[25px]">{it.emoji}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-[17px] font-extrabold text-[#121315]">{it.title}</Text>
              <Text className="mt-0.5 text-[14px] text-[#5d646f]">{it.desc}</Text>
            </View>
          </View>
        </View>
      </View>
    ))}
  </View>
);

/* ───────── mosaic → 게임형 학습 퀘스트 보드 ───────── */
const GameMosaic = ({ headline = '게임처럼, 쉽게!', sub = '퀘스트를 깨며 코딩이 익숙해져요', badges, image }: any) => (
  <View className="mb-6 rounded-2xl overflow-hidden" style={{ shadowColor:'#000', shadowOpacity:0.07, shadowRadius:10, elevation:2 }}>
    {image ? (
      <Image 
        source={typeof image === 'string' ? { uri: image } : image} 
        className="w-full h-32" 
        resizeMode="cover" 
      />
    ) : <View className="h-4" />}
    <View className="px-3 py-3 border-t border-[#eef1e9] bg-white">
      <Text className="text-[22px] font-extrabold text-[#121315]">{headline}</Text>
      <Text className="text-[15px] text-[#5d646f] mt-0.5">{sub}</Text>
      <View className="mt-3 flex-row flex-wrap -mx-1">
        {badges.slice(0, 6).map((b: any, i: number) => (
          <View key={i} className="w-1/2 px-1 mb-2">
            <View className="rounded-xl border border-[#eef1e9] bg-[#f9fbf7] px-2 py-2">
              <Text className="text-[20px]">{b.emoji}</Text>
              <Text className="text-[17px] font-semibold text-[#121315] mt-0.5">{b.title}</Text>
              <Text className="text-[13px] text-[#5d646f]">{b.desc}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  </View>
);

/* ───────── timeline → 화려한 버전 + 소제목 ───────── */
const FancyTimeline = ({ title, subtitle, items }: { title?: string; subtitle?: string; items: { step: string; title: string; desc: string }[] }) => (
  <View className="py-3 mb-6 rounded-2xl bg-white overflow-hidden"  style={{ shadowColor:'#000', shadowOpacity:0.08, shadowRadius:12, elevation:2 }}>
    <View className="px-3 pt-3">
      {title ? <Text className="text-[22px] font-extrabold text-[#121315]">{title}</Text> : null}
      {subtitle ? <Text className="text-[13px] text-[#5d646f] mt-0.5">{subtitle}</Text> : null}
    </View>
    <View className="px-3 pb-3">
      {items.map((it, k) => (
        <View key={k} className="flex-row mt-3">
          {/* 트랙 + 버블 */}
          <View className="items-center justify-center mr-3">
            <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor:'#58CC02', shadowColor:'#58CC02', shadowOpacity:0.4, shadowRadius:6 }}>
              <Text className="text-white text-[15px] font-bold">{it.step}</Text>
            </View>
          </View>
          {/* 스텝 카드 */}
          <View className="flex-1 rounded-xl border bg-white px-3 py-2" style={{ borderColor:'#eef1e9', shadowColor:'#000', shadowOpacity:0.06, shadowRadius:8, elevation:2 }}>
            <Text className="text-[15px] font-semibold">{it.title}</Text>
            <Text className="text-[13px] text-[#5d646f]">{it.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  </View>
);

/* ───────── 가벼운 코드 하이라이터(입문자 가독) ───────── */
const PrettyCode = ({ lang, content }: { lang: 'html' | 'css' | 'js'; content: string }) => {
  return (
    <View className="mb-6 rounded-2xl overflow-hidden border border-[#e8edf3]">
      <View className="h-8 flex-row items-center gap-2 px-3 bg-[#eef2f7]">
        <Dot color="#ff6b6b" /><Dot color="#ffd93d" /><Dot color="#51cf66" />
        <Text className="ml-2 text-[15px] text-[#5d646f]">{lang.toUpperCase()} 코드 미리보기</Text>
      </View>
      <ScrollView horizontal className="bg-[#0f1216]">
        <Text className="p-3 text-[13.5px]">
          {highlight(content, lang).map((seg, idx) => (
            <Text key={idx} style={{ color: seg.color }}>{seg.text}</Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  );
};

const Dot = ({ color }: { color: string }) => <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />;

/** 태그/속성/문자열/키워드 정도만 색상 강조 (입문자 가독 중심) */
function highlight(src: string, lang: 'html' | 'css' | 'js') {
  type Seg = { text: string; color: string }; 
  const parts: Seg[] = [];
  const push = (text: string, color: string) => parts.push({ text, color });

  if (lang === 'html') {
    const tagRe = /<\/?[^>]+>/g; 
    let last = 0;
    src.replace(tagRe, (m, off) => {
      if (off > last) push(src.slice(last, off), '#E6EDF3');
      const attrColored = m
        .replace(/("[^"]*"|'[^']*')/g, s => `\u0001${s}\u0002`)
        .replace(/\b(class|id|src|href|alt|lang|title)\b/g, s => `\u0003${s}\u0004`);
      attrColored.split(/(\u0001.*?\u0002|\u0003.*?\u0004)/g).forEach(tok => {
        if (!tok) return;
        if (tok.startsWith('\u0001')) push(tok.slice(1, -1), '#de91d8');
        else if (tok.startsWith('\u0003')) push(tok.slice(1, -1), '#c5acf4');
        else push(tok, '#98c3f1');
      });
      last = off + m.length; 
      return m;
    });
    if (last < src.length) push(src.slice(last), '#E6EDF3'); 
    return parts;
  }

  if (lang === 'css') {
    // CSS 선택자와 속성을 간단하게 하이라이팅
    let processed = src;
    
    // 선택자 (클래스, ID, 태그 등)
    processed = processed.replace(/([.#]?[a-zA-Z-]+)(\s*\{)/g, (match, selector, brace) => {
      return `\u0001${selector}\u0002${brace}`;
    });
    
    // CSS 속성
    processed = processed.replace(/([a-zA-Z-]+)(\s*:\s*)([^;]+)(;?)/g, (match, prop, colon, value, semicolon) => {
      return `\u0003${prop}\u0004${colon}\u0005${value}\u0006${semicolon}`;
    });
    
    // 문자열 값
    processed = processed.replace(/(["'][^"']*["'])/g, (match) => {
      return `\u0007${match}\u0008`;
    });
    
    // 토큰을 분리하여 색상 적용
    processed.split(/(\u0001.*?\u0002|\u0003.*?\u0004|\u0005.*?\u0006|\u0007.*?\u0008)/g).forEach(token => {
      if (!token) return;
      if (token.startsWith('\u0001')) {
        push(token.slice(1, -1), '#A6E22E'); // 선택자 - 녹색
      } else if (token.startsWith('\u0003')) {
        push(token.slice(1, -1), '#8BE9FD'); // 속성명 - 파란색
      } else if (token.startsWith('\u0005')) {
        push(token.slice(1, -1), '#FFB86C'); // 속성값 - 주황색
      } else if (token.startsWith('\u0007')) {
        push(token.slice(1, -1), '#FFB86C'); // 문자열 - 주황색
      } else {
        push(token, '#E6EDF3'); // 기본 텍스트 - 회색
      }
    });
    
    return parts;
  }

  if (lang === 'js') {
    // JavaScript 키워드와 문자열을 간단하게 하이라이팅
    let processed = src;
    
    // 키워드
    const keywords = ['const', 'let', 'var', 'if', 'else', 'for', 'while', 'function', 'return', 'async', 'await', 'setTimeout'];
    keywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      processed = processed.replace(regex, `\u0001${keyword}\u0002`);
    });
    
    // 문자열
    processed = processed.replace(/(["'][^"']*["'])/g, (match) => {
      return `\u0003${match}\u0004`;
    });
    
    // 함수 호출
    processed = processed.replace(/([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*\()/g, (match, funcName, paren) => {
      return `\u0005${funcName}\u0006${paren}`;
    });
    
    // 토큰을 분리하여 색상 적용
    processed.split(/(\u0001.*?\u0002|\u0003.*?\u0004|\u0005.*?\u0006)/g).forEach(token => {
      if (!token) return;
      if (token.startsWith('\u0001')) {
        push(token.slice(1, -1), '#A6E22E'); // 키워드 - 녹색
      } else if (token.startsWith('\u0003')) {
        push(token.slice(1, -1), '#FFB86C'); // 문자열 - 주황색
      } else if (token.startsWith('\u0005')) {
        push(token.slice(1, -1), '#98c3f1'); // 함수명 - 파란색
      } else {
        push(token, '#E6EDF3'); // 기본 텍스트 - 회색
      }
    });
    
    return parts;
  }
  
  return parts;
}
