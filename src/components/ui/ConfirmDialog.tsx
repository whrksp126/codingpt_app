import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { v2Colors, v2Font } from '../../theme/v2Tokens';
import PressableScale from './PressableScale';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;   // 확인 버튼을 위험(빨강) 톤으로
  onConfirm: () => void;
  onCancel: () => void;
}

// v2 다크 컨셉 커스텀 확인 다이얼로그. (네이티브 Alert 대체)
const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  destructive,
  onConfirm,
  onCancel,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      // iPad: supportedOrientations 미지정 시 모달 등장 때 화면이 세로로 강제 회전됨 → 전 방향 허용.
      supportedOrientations={['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onCancel}
    >
      {/* 백드롭 탭 → 닫기. 내부 카드는 별도 Pressable 로 전파 차단. */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.actions}>
            <PressableScale
              onPress={onCancel}
              dim={0.1}
              android_ripple={{ color: 'rgba(255,255,255,0.08)' }}
              style={[styles.btn, styles.cancelBtn]}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </PressableScale>
            <PressableScale
              onPress={onConfirm}
              dim={0.1}
              android_ripple={{ color: 'rgba(255,255,255,0.12)' }}
              style={[styles.btn, destructive ? styles.destructiveBtn : styles.confirmBtn]}
            >
              <Text style={destructive ? styles.destructiveText : styles.confirmText}>
                {confirmText}
              </Text>
            </PressableScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: v2Colors.elevated2,
    borderColor: v2Colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingTop: 24,
    paddingHorizontal: 22,
    paddingBottom: 16,
  },
  title: {
    fontFamily: v2Font.sans,
    fontSize: 18,
    fontWeight: v2Font.weight.bold,
    color: v2Colors.text,
    letterSpacing: -0.3,
  },
  message: {
    fontFamily: v2Font.sans,
    fontSize: 14,
    color: v2Colors.text3,
    lineHeight: 21,
    marginTop: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  cancelBtn: {
    backgroundColor: v2Colors.elevated,
    borderColor: v2Colors.borderControl,
  },
  cancelText: {
    fontFamily: v2Font.sans,
    fontSize: 15,
    fontWeight: v2Font.weight.semibold,
    color: v2Colors.text2,
  },
  confirmBtn: {
    backgroundColor: v2Colors.cta,
    borderColor: 'transparent',
  },
  confirmText: {
    fontFamily: v2Font.sans,
    fontSize: 15,
    fontWeight: v2Font.weight.bold,
    color: '#FFFFFF',
  },
  destructiveBtn: {
    backgroundColor: 'rgba(248,113,113,0.14)',
    borderColor: 'rgba(248,113,113,0.42)',
  },
  destructiveText: {
    fontFamily: v2Font.sans,
    fontSize: 15,
    fontWeight: v2Font.weight.bold,
    color: v2Colors.error,
  },
});

export default ConfirmDialog;
