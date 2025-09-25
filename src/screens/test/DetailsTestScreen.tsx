import React from 'react';
import { View, Text } from 'react-native';
// ✅ route 불필요 — 단순 화면
export default function DetailsTestScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-lg">Details Screen (No Params)</Text>
    </View>
  );
}
