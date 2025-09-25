import React from 'react';
import { View, Text, Button } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

export default function HomeTestScreen({ navigation }: Props) {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-xl font-semibold mb-4">🏠 Home (Test)</Text>
      {/* ✅ 파라미터 없이 바로 이동 */}
      <Button title="상세로 이동" onPress={() => navigation.push('Details')} />
    </View>
  );
}
