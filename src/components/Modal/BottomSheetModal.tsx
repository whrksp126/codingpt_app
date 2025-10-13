import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  View,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Text,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, useNavigationState } from '@react-navigation/native';

const screenHeight = Dimensions.get('window').height;

const BottomSheetModal: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const [isClosing, setIsClosing] = useState(false);

  const slideAnim = useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current; // overlay는 고정 비율로 사용

  const title = route.params?.title ?? '바텀 시트';
  const content = route.params?.content ?? '내용이 없습니다.';

  // ✅ 현재 스택의 최상단 route 확인
  const routes = useNavigationState((state) => state.routes);
  const isTopRoute = routes[routes.length - 1].key === route.key;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  const closeModal = () => {
    if (!isTopRoute) return; // ✅ 최상단만 닫히도록 제한
    if (isClosing) return;
    setIsClosing(true);

    Animated.timing(slideAnim, {
      toValue: screenHeight,
      duration: 300,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) navigation.goBack();
    });
  };

  return (
    <View style={styles.wrapper} pointerEvents={isTopRoute ? 'auto' : 'none'}>
      {isTopRoute && (
        <Animated.View style={[styles.overlay, { opacity: 1 }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeModal}
          />
        </Animated.View>
      )}
      <Animated.View
        style={[
          styles.modalContainer,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={closeModal}>
            <Text style={styles.close}>닫기 ✖</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        >
          {typeof content === 'string' ? (
            <Text style={styles.contentText}>{content}</Text>
          ) : (
            content
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  modalContainer: {
    width: '100%',
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e5e5',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  close: {
    color: '#007AFF',
    fontSize: 14,
  },
  contentContainer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  contentText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
});

export default BottomSheetModal;


