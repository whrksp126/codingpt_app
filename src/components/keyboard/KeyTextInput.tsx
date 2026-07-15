import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { TextInput, Clipboard, type TextInputProps } from 'react-native';

import { setKeyTarget, blurKeyTarget, dismissKeyAssist, getKeyModFlags, consumeKeyMods, type KeyTarget } from './KeyAssist';
import type { SpecialKeyName } from './SpecialKeyPanel';
import type { ModFlags } from './modifierKeys';

// ── 일반 TextInput 용 KeyAssist 타깃 래퍼 ──
// 터미널/에디터(웹뷰)와 달리 일반 인풋은 RN 쪽에서 특수키를 직접 구현한다:
//  · 패널 원샷 키: 방향(±shift 선택확장)/Home/End/⌫/Del/⏎/Tab/Esc
//  · 잠근 모디파이어 + OS 키보드 글자 조합: ⌘/Ctrl + A(전체선택)·C(복사)·X(잘라내기)·V(붙여넣기)
//    — onChangeText 로 들어온 "한 글자 삽입"을 가로채 실행(글자는 삽입하지 않음)
//  · 보조바 특수문자: 커서 위치에 삽입
// 전제: controlled(value + onChangeText). 커서는 onSelectionChange 로 추적, setNativeProps 로 이동.

let seq = 0;

type Props = TextInputProps & {
  /** 단일행 인풋에서 패널 ⏎ 를 눌렀을 때(onSubmitEditing 과 동일 취지) */
  onEnterKey?: () => void;
};

const ordered = (s: { start: number; end: number }) => (s.start <= s.end ? s : { start: s.end, end: s.start });
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const KeyTextInput = forwardRef<TextInput, Props>(function KeyTextInput(props, fRef) {
  const { value, onChangeText, onFocus, onBlur, onSelectionChange, onSubmitEditing, onEnterKey, multiline, ...rest } = props;
  const inRef = useRef<TextInput>(null);
  useImperativeHandle(fRef, () => inRef.current as TextInput);

  const id = useMemo(() => 'kti' + (++seq), []);
  const valRef = useRef(String(value ?? ''));
  valRef.current = String(value ?? '');
  const selRef = useRef({ start: valRef.current.length, end: valRef.current.length });
  const anchorRef = useRef<number | null>(null); // shift 선택 확장 기준점
  const propsRef = useRef({ onChangeText, onSubmitEditing, onEnterKey, multiline });
  propsRef.current = { onChangeText, onSubmitEditing, onEnterKey, multiline };

  const setNativeSel = useCallback((start: number, end: number) => {
    selRef.current = { start, end };
    try { inRef.current?.setNativeProps({ selection: { start, end } }); } catch (_) { /* noop */ }
  }, []);

  // 값 변경 + 다음 프레임에 커서 반영(controlled 값이 네이티브에 내려간 뒤).
  const apply = useCallback((text: string, start: number, end: number) => {
    valRef.current = text;
    propsRef.current.onChangeText?.(text);
    anchorRef.current = null;
    requestAnimationFrame(() => setNativeSel(clamp(start, 0, text.length), clamp(end, 0, text.length)));
  }, [setNativeSel]);

  const insertText = useCallback((t: string, caret?: number) => {
    const v = valRef.current;
    const { start, end } = ordered(selRef.current);
    const nv = v.slice(0, start) + t + v.slice(end);
    const pos = clamp(start + t.length + (caret ?? 0), 0, nv.length);
    apply(nv, pos, pos);
  }, [apply]);

  // 줄 경계(멀티라인 커서 이동용)
  const lineBounds = (v: string, pos: number) => {
    const ls = v.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
    let le = v.indexOf('\n', pos);
    if (le < 0) le = v.length;
    return { ls, le };
  };

  const applyKey = useCallback((name: SpecialKeyName, flags: ModFlags) => {
    const v = valRef.current;
    const { start, end } = ordered(selRef.current);
    const collapsed = start === end;

    if (name === 'Backspace') {
      if (!collapsed) apply(v.slice(0, start) + v.slice(end), start, start);
      else if (start > 0) apply(v.slice(0, start - 1) + v.slice(start), start - 1, start - 1);
      return;
    }
    if (name === 'Delete') {
      if (!collapsed) apply(v.slice(0, start) + v.slice(end), start, start);
      else if (end < v.length) apply(v.slice(0, end) + v.slice(end + 1), start, start);
      return;
    }
    if (name === 'Enter') {
      if (propsRef.current.multiline) insertText('\n');
      else {
        propsRef.current.onEnterKey?.();
        (propsRef.current.onSubmitEditing as any)?.({ nativeEvent: { text: v } });
      }
      return;
    }
    if (name === 'Tab') { if (propsRef.current.multiline) insertText('\t'); return; }
    if (name === 'Escape') { dismissKeyAssist(); return; }

    // ── 커서 이동(+shift 선택 확장) ──
    // shift 확장 중엔 anchor 반대편(focus)이 움직인다. focus 는 anchor 기준으로 판정.
    const anchor = flags.shift ? (anchorRef.current ?? start) : null;
    const focusPos = anchor !== null ? (anchor === start ? end : start) : (name === 'ArrowLeft' || name === 'Home' ? start : end);
    let np = focusPos;
    switch (name) {
      case 'ArrowLeft': np = (!flags.shift && !collapsed) ? start : Math.max(0, focusPos - 1); break;
      case 'ArrowRight': np = (!flags.shift && !collapsed) ? end : Math.min(v.length, focusPos + 1); break;
      case 'Home': np = lineBounds(v, focusPos).ls; break;
      case 'End': np = lineBounds(v, focusPos).le; break;
      case 'PageUp': np = 0; break;
      case 'PageDown': np = v.length; break;
      case 'ArrowUp': {
        const { ls } = lineBounds(v, focusPos);
        if (ls === 0) { np = 0; break; }
        const col = focusPos - ls;
        const { ls: pls, le: ple } = lineBounds(v, ls - 1);
        np = Math.min(pls + col, ple);
        break;
      }
      case 'ArrowDown': {
        const { le } = lineBounds(v, focusPos);
        if (le >= v.length) { np = v.length; break; }
        const col = focusPos - lineBounds(v, focusPos).ls;
        const { ls: nls, le: nle } = lineBounds(v, le + 1);
        np = Math.min(nls + col, nle);
        break;
      }
      default: return;
    }
    if (anchor !== null) {
      anchorRef.current = anchor;
      const o = anchor <= np ? { start: anchor, end: np } : { start: np, end: anchor };
      setNativeSel(o.start, o.end);
    } else {
      anchorRef.current = null;
      setNativeSel(np, np);
    }
  }, [apply, insertText, setNativeSel]);

  // ── 잠근 모디파이어 + OS 키보드 글자 = 조합 실행 (onChangeText 가로채기) ──
  const runChord = useCallback((c: string) => {
    const v = valRef.current;
    const { start, end } = ordered(selRef.current);
    const selText = v.slice(start, end);
    switch (c) {
      case 'a': setNativeSel(0, v.length); anchorRef.current = 0; break;
      case 'c': if (selText) { try { Clipboard.setString(selText); } catch (_) { /* noop */ } } break;
      case 'x':
        if (selText) {
          try { Clipboard.setString(selText); } catch (_) { /* noop */ }
          apply(v.slice(0, start) + v.slice(end), start, start);
        }
        break;
      case 'v':
        void (async () => {
          try { const t = await Clipboard.getString(); if (t) insertText(t); } catch (_) { /* noop */ }
        })();
        break;
      default: break; // 미지원 조합은 무시(글자 삽입도 안 함)
    }
  }, [apply, insertText, setNativeSel]);

  const handleChangeText = useCallback((text: string) => {
    const flags = getKeyModFlags();
    if (flags.ctrl || flags.meta) {
      const v = valRef.current;
      const { start, end } = ordered(selRef.current);
      const insLen = text.length - (v.length - (end - start));
      if (insLen === 1) {
        const c = text.slice(start, start + 1).toLowerCase();
        runChord(c);
        consumeKeyMods();
        // 삽입 취소 — controlled 리렌더로 복원되지만 네이티브에도 즉시 반영.
        try { inRef.current?.setNativeProps({ text: v }); } catch (_) { /* noop */ }
        return;
      }
    }
    valRef.current = text;
    anchorRef.current = null;
    propsRef.current.onChangeText?.(text);
  }, [runChord]);

  const target = useMemo<KeyTarget>(() => ({
    id,
    kind: 'text',
    focus: () => inRef.current?.focus(),
    blur: () => inRef.current?.blur(),
    insertText,
    applyKey: (name, flags) => applyKey(name, flags),
  }), [id, insertText, applyKey]);

  return (
    <TextInput
      ref={inRef}
      value={value}
      multiline={multiline}
      onChangeText={handleChangeText}
      onSubmitEditing={onSubmitEditing}
      onFocus={(e) => { setKeyTarget(target); onFocus?.(e); }}
      onBlur={(e) => { blurKeyTarget(id); onBlur?.(e); }}
      onSelectionChange={(e) => {
        selRef.current = e.nativeEvent.selection;
        onSelectionChange?.(e);
      }}
      {...rest}
    />
  );
});

export default KeyTextInput;
