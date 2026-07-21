import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { v2 } from '../theme/v2Tokens';
import { collapseKeyAssist, KeyAssistOverlay } from './keyboard/KeyAssist';
import { haptic } from '../animations/haptics';

const C = v2.colors;

// 앱 공통 커스텀 알럿 — OS Alert 대신 v2 테마 모달(호스트 오프라인 안내 등).
//  · 명령형 showAppAlert() 로 어디서든 호출(컨텍스트/서비스 포함), 호스트는 셸에 1회 마운트.
//  · 표시 시 키보드/특수키 패널을 내린다(알럿 위로 키보드가 남는 문제 방지 — 사용자 확정 스펙).
export interface AppAlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive' | 'primary';
  onPress?: () => void;
}
export interface AppAlertSpec {
  title: string;
  message?: string;
  buttons?: AppAlertButton[]; // 없으면 [확인]
}

let current: AppAlertSpec | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch (_) { /* noop */ } });

export function showAppAlert(spec: AppAlertSpec): void {
  collapseKeyAssist(); // 알럿 등장 = 키보드/특수키 패널 내림
  current = spec;
  emit();
  try { haptic.warning(); } catch (_) { /* noop */ }
}

export function hideAppAlert(): void {
  if (!current) return;
  current = null;
  emit();
}

// 셸에 1회 마운트하는 호스트.
export function AppAlertHost() {
  const [spec, setSpec] = useState<AppAlertSpec | null>(current);
  useEffect(() => {
    const fn = () => setSpec(current);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  if (!spec) return null;
  const buttons: AppAlertButton[] = spec.buttons?.length ? spec.buttons : [{ text: '확인', style: 'primary' }];
  const onBtn = (b: AppAlertButton) => {
    hideAppAlert();
    try { b.onPress?.(); } catch (_) { /* noop */ }
  };
  const cancel = buttons.find((b) => b.style === 'cancel');
  return (
    <Modal
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      visible transparent animationType="fade"
      onRequestClose={() => (cancel ? onBtn(cancel) : hideAppAlert())}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 }}
        onPress={() => (cancel ? onBtn(cancel) : undefined)} // cancel 버튼이 있을 때만 바깥 탭 닫기
      >
        <Pressable style={{ width: '100%', maxWidth: 340, backgroundColor: C.elevated, borderRadius: v2.radius.lg, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 }}>
            <Text style={{ color: C.text, fontSize: 15.5, fontWeight: '700', fontFamily: v2.font.sans }}>{spec.title}</Text>
            {spec.message ? (
              <Text style={{ color: C.text2, fontSize: 13, lineHeight: 19.5, marginTop: 8 }}>{spec.message}</Text>
            ) : null}
          </View>
          <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 6 }}>
            {buttons.map((b, i) => {
              const primary = b.style === 'primary' || (buttons.length === 1 && !b.style);
              const destructive = b.style === 'destructive';
              return (
                <Pressable
                  key={i}
                  onPress={() => onBtn(b)}
                  android_ripple={{ color: C.elevated2 }}
                  style={{
                    height: 42, borderRadius: v2.radius.md, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: primary ? C.accent : C.elevated2,
                  }}
                >
                  <Text style={{
                    fontSize: 14, fontWeight: primary ? '700' : '600',
                    color: primary ? '#0B0F14' : destructive ? C.error : b.style === 'cancel' ? C.text2 : C.text,
                  }}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
      {/* Modal 은 독립 네이티브 레이어 — 보조키 오버레이를 별도 마운트해야 알럿 위에서도 동작 규칙 유지 */}
      <KeyAssistOverlay inModal />
    </Modal>
  );
}
