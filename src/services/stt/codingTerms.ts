// 음성인식 바이어스용 코딩 기술용어 사전.
//  한국어 발화 중 섞이는 영어 기술용어를 인식기가 잘 잡도록 contextualStrings 로 전달한다.
//  (iOS SFSpeechRecognitionRequest.contextualStrings / Android 는 미지원이라 무시됨.)
export const CODING_TERMS: string[] = [
  // 일반 프로그래밍
  'function', 'const', 'let', 'var', 'return', 'import', 'export', 'default',
  'async', 'await', 'promise', 'class', 'interface', 'type', 'enum',
  'null', 'undefined', 'boolean', 'string', 'number', 'array', 'object',
  // React / 프론트엔드
  'component', 'props', 'state', 'useState', 'useEffect', 'useCallback',
  'useMemo', 'useRef', 'render', 'hook', 'context', 'provider',
  // 툴링 / 워크플로우
  'git', 'commit', 'branch', 'merge', 'rebase', 'push', 'pull', 'clone',
  'npm', 'yarn', 'node', 'package', 'dependency', 'build', 'deploy',
  // 백엔드 / 인프라
  'server', 'client', 'endpoint', 'request', 'response', 'database', 'query',
  'schema', 'migration', 'docker', 'container', 'localhost', 'token',
  // 코딩PT 고유
  'CodingPT', '코딩PT', '터미널', '워크스페이스', '프리뷰', '데몬',
];
