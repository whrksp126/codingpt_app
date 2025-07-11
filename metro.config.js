const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require("nativewind/metro");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */

// 먼저 기본 config 정의
const baseConfig = getDefaultConfig(__dirname);

const config = mergeConfig(baseConfig, {
  // 여기에 커스텀 설정 추가 가능
});

// NativeWind 적용
const finalConfig = withNativeWind(config, { input: "./global.css" });

module.exports = finalConfig;
