import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;

interface Props {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  mode?: 'alert' | 'confirm'; // alert = 단일 확인 버튼
  onClose: (result?: any) => void;
}

// 다크 V2 커스텀 알림/확인 — useModal(BaseModal) 바텀시트로 렌더(네이티브 Alert 대체).
const AppConfirmModal: React.FC<Props> = ({
  title, message, confirmText, cancelText = '취소', danger, mode = 'confirm', onClose,
}) => {
  const isAlert = mode === 'alert';
  const confirmLabel = confirmText || (isAlert ? '확인' : (danger ? '삭제' : '확인'));

  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 8 }}>
      {title ? <Text style={{ color: C.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>{title}</Text> : null}
      {message ? <Text style={{ color: C.text2, fontSize: 14.5, lineHeight: 22, marginBottom: 22 }}>{message}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {!isAlert ? (
          <Pressable
            onPress={() => onClose({ confirmed: false })}
            android_ripple={{ color: C.hover }}
            style={{ flex: 1, height: 50, borderRadius: 12, borderWidth: 1, borderColor: C.borderControl, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: C.text2, fontSize: 15, fontWeight: '600' }}>{cancelText}</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onClose({ confirmed: true })}
          android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
          style={{ flex: isAlert ? 1 : 1.3, height: 50, borderRadius: 12, backgroundColor: danger ? C.error : C.cta, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: danger ? '#2A0E0E' : '#fff', fontSize: 15, fontWeight: '700' }}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default AppConfirmModal;
