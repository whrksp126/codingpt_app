module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  // 프리셋 기본 패턴은 'react-native/' 만 통과시켜 'react-native-reanimated'(mock 포함, TS 소스)가
  //  변환에서 빠진다 → 수집 실패. reanimated 만 변환 대상에 추가한다.
  // 미디어 에셋은 파싱 대상이 아니다 — RN 번들러처럼 모듈 id 스텁으로 치환.
  moduleNameMapper: {
    '\\.(mp3|wav|aac|mp4|mov|ttf|otf)$': '<rootDir>/jest.assetStub.js',
    '\\.css$': '<rootDir>/jest.assetStub.js', // nativewind global.css — 런타임 의미 없음
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-documents|react-native-.*|nativewind|@notifee|@react-native-firebase|@react-navigation|phosphor-react-native)/)',
  ],
};
