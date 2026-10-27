// IssueEditor — Tasks 본문 편집기(폰). PC 와 **같은 번들**(codingpt_pc/editor — Tiptap/ProseMirror)을 WebView 에 띄운다.
//  2026-10-28 사용자 요청("노션 수준으로, 오픈소스를 제대로 가져다 써라 · 서식 버튼은 노션처럼 키패드 위에"):
//   · 글은 보이는 대로 쓰고(마크다운 단축 입력·/ 메뉴 포함) 저장은 마크다운 그대로다 — PC·에이전트와 같은 형식.
//   · 서식 버튼 줄(KeyboardBar)은 편집기에 커서가 있을 때 **키보드 바로 위**에 붙는다. 그 밖에는 숨는다.
//  다리: 웹 → RN = postMessage({t}), RN → 웹 = injectJavaScript(`__cpt.recv(msg)`).
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { View, ScrollView, Keyboard, Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import {
  TextHOne, TextHTwo, TextHThree, TextB, TextItalic, TextStrikethrough, Code, ListBullets, ListNumbers, ListChecks, Quotes, CodeBlock, Minus, LinkSimple,
  Paperclip, TextIndent, TextOutdent, ArrowUUpLeft, ArrowUUpRight, CaretDown,
} from 'phosphor-react-native';
import { v2 } from '../../theme/v2Tokens';
import { IconButton } from '../../components/ui';
import * as i18n from '../../i18n/index.ts';
import BUNDLE from './issueEditorBundle';

const t = i18n.t;
export type EditorState = Partial<Record<'bold' | 'italic' | 'strike' | 'code' | 'link' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'todo' | 'quote' | 'pre' | 'list' | 'canUndo' | 'canRedo' | 'focused', boolean>>;
export type IssueEditorHandle = {
  exec: (cmd: string, arg?: string) => void;
  setMarkdown: (md: string) => void;
  insertImage: (att: { id: string; name: string }) => void;
  removeImage: (id: string) => void;
  blur: () => void;
  focus: () => void;
};
type Props = {
  value: string;
  onChange: (md: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onState?: (s: EditorState) => void;
  onAttach?: () => void;
};

/** 웹 쪽 부트 — 편집기를 만들고 다리를 놓는다. 값·문구는 init 메시지로 받는다(HTML 은 고정이라 캐시된다). */
const BOOT = `
(function(){
  var post=function(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(_){} };
  var ed=null, T={}, chT=0;
  window.__cpt={ recv:function(m){
    if(m.t==='init'){
      var r=document.documentElement.style; for (var k in m.vars) r.setProperty(k, m.vars[k]);
      T=m.texts||{};
      ed=window.CptIssueEditor.createIssueEditor({ value:m.md||'', mobile:true, t:function(s){ return T[s]||s; },
        onChange:function(md){ clearTimeout(chT); chT=setTimeout(function(){ post({t:'change', md:md}); }, 120); },
        onState:function(s){ post({t:'state', s:s}); },
        onFocus:function(){ post({t:'focus'}); }, onBlur:function(){ post({t:'blur'}); },
        onAttach:function(){ post({t:'attach'}); } });
      document.getElementById('root').appendChild(ed.el);
      post({t:'ready'});
      return;
    }
    if(!ed) return;
    if(m.t==='exec') ed.exec(m.cmd, m.arg);
    else if(m.t==='set') ed.setMarkdown(m.md||'');
    else if(m.t==='img') ed.insertImage(m.att, '');
    else if(m.t==='unimg') ed.removeImage(m.id);
    else if(m.t==='blur') { ed.blur(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
    else if(m.t==='focus') ed.focus('end');
  }};
  post({t:'boot'});
})();`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:var(--base);-webkit-text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",Roboto,sans-serif}#root{height:100%;display:flex}</style>
</head><body><div id="root"></div><script>${BUNDLE}</script><script>${BOOT}</script></body></html>`;

const TEXTS = ['링크 넣기', '텍스트', '제목 1', '제목 2', '제목 3', '글머리 목록', '번호 목록', '체크 목록', '인용', '코드 블록', '구분선', '이미지·파일 첨부', '끌어서 옮기기'];

const IssueEditor = forwardRef<IssueEditorHandle, Props>(function IssueEditor({ value, onChange, onFocus, onBlur, onState, onAttach }, ref) {
  const C = v2.colors;
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const queue = useRef<any[]>([]);
  const first = useRef(value);
  const cb = useRef({ onChange, onFocus, onBlur, onState, onAttach });
  cb.current = { onChange, onFocus, onBlur, onState, onAttach };
  const send = useCallback((m: any) => {
    if (!ready.current) { queue.current.push(m); return; }
    web.current?.injectJavaScript(`window.__cpt&&window.__cpt.recv(${JSON.stringify(m)});true;`);
  }, []);
  useImperativeHandle(ref, () => ({
    exec: (cmd, arg) => send({ t: 'exec', cmd, arg }),
    setMarkdown: (md) => send({ t: 'set', md }),
    insertImage: (att) => send({ t: 'img', att }),
    removeImage: (id) => send({ t: 'unimg', id }),
    blur: () => send({ t: 'blur' }),
    focus: () => send({ t: 'focus' }),
  }), [send]);
  const vars = useMemo(() => ({
    '--base': C.base, '--surface': C.elevated, '--text': C.text, '--text2': C.text2, '--text3': C.text3, '--border': C.border, '--border-ctrl': C.borderControl,
    '--border-strong': C.borderStrong, '--hover': C.hover, '--pressed': C.pressed, '--selected': C.selected,
  }), [C]);
  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let m: any = null;
    try { m = JSON.parse(e.nativeEvent.data); } catch (_) { return; }
    if (!m) return;
    if (m.t === 'boot') {
      //  첫 부트(또는 웹뷰가 다시 뜬 것) — 값을 다시 싣는다.
      ready.current = false;
      const texts: Record<string, string> = {};
      for (const k of TEXTS) texts[k] = t(k);
      web.current?.injectJavaScript(`window.__cpt.recv(${JSON.stringify({ t: 'init', md: first.current, vars, texts })});true;`);
    } else if (m.t === 'ready') {
      ready.current = true;
      const q = queue.current; queue.current = [];
      for (const x of q) send(x);
    } else if (m.t === 'change') { first.current = String(m.md || ''); cb.current.onChange(first.current); }
    else if (m.t === 'state') cb.current.onState?.(m.s || {});
    else if (m.t === 'focus') cb.current.onFocus?.();
    else if (m.t === 'blur') cb.current.onBlur?.();
    else if (m.t === 'attach') cb.current.onAttach?.();
  }, [send, vars]);
  return (
    <WebView ref={web} originWhitelist={['*']} source={{ html: HTML }} onMessage={onMessage}
      style={{ flex: 1, backgroundColor: C.base }} containerStyle={{ backgroundColor: C.base }}
      keyboardDisplayRequiresUserAction={false} hideKeyboardAccessoryView automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never" bounces={false} overScrollMode="never" textZoom={100}
      setSupportMultipleWindows={false} javaScriptEnabled domStorageEnabled={false} cacheEnabled={false}
      onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith('data:') || r.url === 'about:srcdoc' || !/^https?:/.test(r.url)} />
  );
});
export default IssueEditor;

/** 키보드 바로 위 서식 줄(노션식). 편집기에 커서가 있을 때만 그린다 — 부모가 키보드 위 자리에 둔다. */
export function KeyboardBar({ st, run, onAttach, onDone }: { st: EditorState; run: (cmd: string) => void; onAttach: () => void; onDone: () => void }) {
  const C = v2.colors;
  const b = (Icon: React.ComponentType<any>, label: string, cmd: string, on?: boolean, off?: boolean) => (
    <IconButton key={cmd} onPress={() => run(cmd)} accessibilityLabel={label} size={40} selected={!!on} disabled={!!off}>
      <Icon size={19} color={off ? C.textDim : on ? C.text : C.text2} weight={on ? 'bold' : 'regular'} />
    </IconButton>
  );
  const sep = (k: string) => <View key={k} style={{ width: 1, height: 18, marginHorizontal: 4, backgroundColor: C.border }} />;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 46, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.surface }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 4 }}>
        <IconButton onPress={onAttach} accessibilityLabel={t('이미지·파일 첨부')} size={40}><Paperclip size={19} color={C.text2} /></IconButton>
        {sep('s0')}
        {b(ListChecks, t('체크 목록'), 'todo', st.todo)}
        {b(ListBullets, t('글머리 목록'), 'ul', st.ul)}
        {b(ListNumbers, t('번호 목록'), 'ol', st.ol)}
        {b(TextHOne, t('제목 1'), 'h1', st.h1)}
        {b(TextHTwo, t('제목 2'), 'h2', st.h2)}
        {b(TextHThree, t('제목 3'), 'h3', st.h3)}
        {sep('s1')}
        {b(TextB, t('굵게'), 'bold', st.bold)}
        {b(TextItalic, t('기울임'), 'italic', st.italic)}
        {b(TextStrikethrough, t('취소선'), 'strike', st.strike)}
        {b(Code, t('코드'), 'code', st.code)}
        {b(LinkSimple, t('링크'), 'link', st.link)}
        {sep('s2')}
        {b(Quotes, t('인용'), 'quote', st.quote)}
        {b(CodeBlock, t('코드 블록'), 'pre', st.pre)}
        {b(Minus, t('구분선'), 'hr')}
        {b(TextOutdent, t('내어쓰기'), 'outdent', false, !st.list)}
        {b(TextIndent, t('들여쓰기'), 'indent', false, !st.list)}
        {sep('s3')}
        {b(ArrowUUpLeft, t('실행 취소'), 'undo', false, st.canUndo === false)}
        {b(ArrowUUpRight, t('다시 실행'), 'redo', false, st.canRedo === false)}
      </ScrollView>
      <View style={{ width: 1, alignSelf: 'stretch', backgroundColor: C.border }} />
      <IconButton onPress={() => { onDone(); Keyboard.dismiss(); }} accessibilityLabel={t('키보드 내리기')} size={44}>
        <CaretDown size={19} color={C.text2} />
      </IconButton>
    </View>
  );
}

export const IS_IOS = Platform.OS === 'ios';
