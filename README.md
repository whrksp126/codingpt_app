시작하기
참고: 먼저 환경 설정 가이드를 완료했는지 확인하세요.

1단계: Metro 시작하기
먼저 Metro(React Native의 JavaScript 빌드 툴)를 실행해야 합니다.

프로젝트 루트 폴더에서 아래 명령어로 Metro 개발 서버를 시작하세요:

# npm 사용 시
npm start

# 또는 Yarn 사용 시
yarn start
2단계: 앱 빌드 및 실행
Metro가 실행 중이라면, 새로운 터미널 창(또는 탭)을 열고 아래 명령어로 Android 또는 iOS 앱을 빌드 및 실행할 수 있습니다.

Android
# npm 사용 시
npm run android

# 또는 Yarn 사용 시
yarn android
iOS
iOS의 경우, CocoaPods 의존성을 설치해야 합니다(최초 프로젝트 생성 시, 또는 네이티브 라이브러리 업데이트 시에만 필요).

Ruby 번들러로 CocoaPods 자체를 먼저 설치하세요(최초 1회):

bundle install
그 후, 네이티브 라이브러리를 추가/업데이트할 때마다 아래 명령어를 실행하세요:

bundle exec pod install
자세한 내용은 CocoaPods 시작 가이드를 참고하세요.

앱 실행 명령어는 아래와 같습니다:

# npm 사용 시
npm run ios

# 또는 Yarn 사용 시
yarn ios
정상적으로 설정되었다면, Android 에뮬레이터, iOS 시뮬레이터, 또는 실제 기기에서 앱이 실행됩니다.

이 외에도, Android Studio나 Xcode에서 직접 빌드할 수도 있습니다.

3단계: 앱 수정하기
앱 실행에 성공했다면, 이제 코드를 수정해볼 차례입니다!

선호하는 텍스트 에디터로 App.tsx 파일을 열고 원하는 대로 수정하세요. 저장하면, Fast Refresh 기능 덕분에 앱이 자동으로 새로고침됩니다.

앱의 상태를 초기화하고 싶을 때는 전체 리로드를 할 수 있습니다:

Android: <kbd>R</kbd> 키를 두 번 누르거나, Dev Menu(윈도우/리눅스: <kbd>Ctrl</kbd> + <kbd>M</kbd>, macOS: <kbd>Cmd ⌘</kbd> + <kbd>M</kbd>)에서 Reload를 선택하세요.

iOS: iOS 시뮬레이터에서 <kbd>R</kbd> 키를 누르세요.

축하합니다! :tada:
React Native 앱을 성공적으로 실행하고 수정하셨습니다. :partying_face:

그다음에는?
기존 앱에 React Native 코드를 추가하고 싶다면 통합 가이드를 참고하세요.

React Native에 대해 더 알고 싶다면 공식 문서를 확인하세요.

문제 해결
위 과정에서 문제가 발생한다면 문제 해결 가이드를 참고하세요.

더 알아보기
React Native에 대해 더 배우고 싶다면 아래 자료를 참고하세요.

React Native 공식 웹사이트

환경 설정 - 전체적인 환경 설정 개요

기초 학습 - React Native의 기본 개념 가이드

공식 블로그 - 최신 소식 및 업데이트

@facebook/react-native - 오픈소스 공식 GitHub 저장소

