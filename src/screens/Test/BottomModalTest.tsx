import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ModalFadeTest() {
  const navigation = useNavigation<NavigationProp>();

  const openFirstModal = () => {
    navigation.push('BottomSheetModal', {
      title: '공지사항 📢',
      content: (
        <View>
          <Text>이번 주 토요일은 서버 점검이 예정되어 있습니다.</Text>
          <TouchableOpacity
            onPress={openSecondModal}
            style={{ marginTop: 20, backgroundColor: '#007AFF', padding: 10, borderRadius: 8 }}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>다음 모달 열기</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  };

  const openSecondModal = () => {
    navigation.push('BottomSheetModal', {
      title: '두 번째 모달 💬',
      content: (
        <View>
          <Text>이 모달은 첫 번째 모달 위에 쌓입니다.</Text>
          <TouchableOpacity
            onPress={openThirdModal}
            style={{ marginTop: 20, backgroundColor: '#34C759', padding: 10, borderRadius: 8 }}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>세 번째 모달 열기</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  };

  const openThirdModal = () => {
    navigation.push('BottomSheetModal', {
      title: '세 번째 모달 🧩',
      content: '최상단에 위치한 모달입니다!',
    });
  };

  return (
    <View className="flex-1 items-center justify-center">
      <TouchableOpacity
        onPress={openFirstModal}
        className="bg-blue-500 px-6 py-3 rounded-xl"
      >
        <Text className="text-white font-semibold">첫 번째 모달 열기</Text>
      </TouchableOpacity>
    </View>
  );
}
