import React from 'react';
import { View, Text } from 'react-native';
import { v2 } from '../../theme/v2Tokens';
import * as i18n from '../../i18n/index.ts';
import Button from '../ui/Button';

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
  title, message, confirmText, cancelText = i18n.t('취소'), danger, mode = 'confirm', onClose,
}) => {
  const isAlert = mode === 'alert';
  const confirmLabel = confirmText || (isAlert ? i18n.t('확인') : (danger ? i18n.t('삭제') : i18n.t('확인')));

  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 4, paddingBottom: 8 }}>
      {title ? <Text style={{ color: C.text, fontSize: v2.font.size.h2, fontWeight: '600', marginBottom: 8 }}>{title}</Text> : null}
      {message ? <Text style={{ color: C.text2, fontSize: v2.font.size.body, lineHeight: 22, marginBottom: 22 }}>{message}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {!isAlert ? (
          <Button
            label={cancelText}
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => onClose({ confirmed: false })}
          />
        ) : null}
        <Button
          label={confirmLabel}
          variant={danger ? 'danger' : 'primary'}
          style={{ flex: isAlert ? 1 : 1.3 }}
          onPress={() => onClose({ confirmed: true })}
        />
      </View>
    </View>
  );
};

export default AppConfirmModal;
