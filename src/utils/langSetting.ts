// 언어 설정(계정 전체 동기화) — 값·목록·기기 언어 판정은 전부 `src/i18n` 이 정본이다.
//
// 'system' = 기기 언어를 따라간다. 이걸 **기본값**으로 둔 이유: 한국어를 기본으로 박아 두면
//  해외 사용자가 앱을 처음 켰을 때 읽을 수 없는 화면을 보고 설정을 찾아 들어가야 한다.
//
// 적용 방식은 테마·글꼴과 같다 — 값만 바꾸고 **App 리마운트(App.tsx 의 key)** 로 화면을 다시 그린다.
//  언어 전환은 드문 행위라, 화면마다 구독을 심는 것보다 이 편이 확실하다(빠뜨린 화면이 없다).
import { useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LANGS, LANG_LABELS, isLang, matchDeviceLang, setLangRuntime, type Lang } from '../i18n/index.ts';

export type LangSetting = 'system' | Lang;

const KEY = 'app:lang';

let setting: LangSetting = 'system';
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * 기기 언어 — RN 은 이걸 주는 공식 API 가 없어서 네이티브 설정을 직접 읽는다.
 *  iOS 는 `AppleLocale`(구형)/`AppleLanguages[0]`, 안드로이드는 `I18nManager.localeIdentifier`.
 *  하나도 못 읽으면 영어로 떨어진다(한국어를 주면 "우리 기본값"을 강요하는 셈이다).
 */
export function deviceLang(): Lang {
  try {
    if (Platform.OS === 'ios') {
      const s = NativeModules.SettingsManager?.settings;
      const raw = s?.AppleLocale || (Array.isArray(s?.AppleLanguages) ? s.AppleLanguages[0] : null);
      return matchDeviceLang(raw);
    }
    return matchDeviceLang(NativeModules.I18nManager?.localeIdentifier);
  } catch (_) {
    return 'en';
  }
}

/** 실제로 적용할 언어(‘system’ 을 푼 값). */
export function effectiveLang(v: LangSetting = setting): Lang {
  return v === 'system' ? deviceLang() : v;
}

export function getLangSetting(): LangSetting { return setting; }

export function isValidLangSetting(v: unknown): v is LangSetting {
  return v === 'system' || isLang(v);
}

/** 목록 — 'system' 이 맨 위, 나머지는 i18n 의 순서 그대로. */
export function langOptions(): { value: LangSetting; label: string }[] {
  return [
    { value: 'system', label: '시스템 언어' },
    ...LANGS.map((l) => ({ value: l as LangSetting, label: LANG_LABELS[l] })),
  ];
}

/**
 * 부팅 시 1회 — 저장값을 읽어 런타임에 심는다.
 *  ⚠ **화면을 그리기 전에** 끝나야 한다. 그 전에 그린 화면은 한국어로 굳는다(리마운트 전까지).
 */
export async function bootLang(): Promise<void> {
  if (loaded) { setLangRuntime(effectiveLang()); return; }
  loaded = true;
  try {
    const s = await AsyncStorage.getItem(KEY);
    if (isValidLangSetting(s)) setting = s;
  } catch (_) { /* 기본값(system) 유지 */ }
  setLangRuntime(effectiveLang());
}

/** silent=true — 서버발 적용(appearanceSync) 시 재푸시 방지. */
export async function setLangSetting(v: LangSetting, opts?: { silent?: boolean }) {
  if (!isValidLangSetting(v) || v === setting) return;
  setting = v;
  setLangRuntime(effectiveLang());
  notify();
  try { await AsyncStorage.setItem(KEY, v); } catch (_) { /* noop */ }
  if (!opts?.silent) {
    const { schedulePushAppearance } = require('./appearanceSync');
    schedulePushAppearance();
  }
}

export function subscribeLang(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useLangSetting(): LangSetting {
  const [v, setV] = useState<LangSetting>(setting);
  useEffect(() => {
    const l = () => setV(setting);
    listeners.add(l);
    setV(setting);
    return () => { listeners.delete(l); };
  }, []);
  return v;
}
