/**
 * HTML 렌더링을 위한 공통 스타일 정의
 * ParagraghV2 및 CharacterSpeechBubble 컴포넌트에서 공유
 */

/**
 * HTML 기본 태그 스타일
 */
export const htmlTagsStyles: any = {
  body: { margin: 0, padding: 0, fontFamily: 'PretendardVariable' },
  p: { fontSize: 16, color: '#333333', lineHeight: 20, marginTop: 0, marginBottom: 0, fontFamily: 'PretendardVariable' },
  h1: { fontSize: 32, fontWeight: '700', color: '#333333', marginTop: 0, marginBottom: 0, fontFamily: 'PretendardVariable' },
  h2: { fontSize: 24, fontWeight: '700', color: '#333333', marginTop: 0, marginBottom: 0, fontFamily: 'PretendardVariable' },
  h3: { fontSize: 18.7, fontWeight: '600', color: '#333333', marginTop: 0, marginBottom: 0, fontFamily: 'PretendardVariable' },
  ul: { paddingLeft: 16, marginTop: 0, marginBottom: 0, fontFamily: 'PretendardVariable' },
  ol: { paddingLeft: 16, marginTop: 0, marginBottom: 0, fontFamily: 'PretendardVariable' },
  li: { fontSize: 16, color: '#333333', marginTop: 0, marginBottom: 0, fontFamily: 'PretendardVariable' },
  span: { fontFamily: 'PretendardVariable' },
  a: { color: '#2563EB', textDecorationLine: 'underline', fontWeight: '500', fontFamily: 'PretendardVariable' },
  code: {
    fontFamily: 'PretendardVariable',
  },
  pre: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
    marginBottom: 6,
    fontFamily: 'PretendardVariable',
  },
  div: {
    fontFamily: 'PretendardVariable',
  },
};

/**
 * HTML class 기반 스타일
 * 텍스트 스타일, 색상, 레이아웃 등을 클래스로 적용 가능
 */
export const classesStyles: any = {
  // 텍스트 정렬
  'text-center': {
    textAlign: 'center',
  },
  'text-left': {
    textAlign: 'left',
  },
  'text-right': {
    textAlign: 'right',
  },

  // 상단 작은 뱃지
  'badge-pill': {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#DBEAFE',
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },

  // Tailwind 커스텀 텍스트 스타일 (tailwind.config.js에서 가져옴)
  'bold-22': {
    fontFamily: 'PretendardVariable',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 33, // 1.5배
    color: '#333333',
  },
  'bold-18': {
    fontFamily: 'PretendardVariable',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 27, // 1.5배
    color: '#333333',
  },
  'bold-16': {
    fontFamily: 'PretendardVariable',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 24, // 1.5배
    color: '#333333',
  },
  'bold-14': {
    fontFamily: 'PretendardVariable',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21, // 1.5배
    color: '#333333',
  },
  'semibold-15': {
    fontFamily: 'PretendardVariable',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22.5, // 1.5배
    color: '#333333',
  },
  'regular-15': {
    fontFamily: 'PretendardVariable',
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 22.5, // 1.5배
    color: '#333333',
  },
  'regular-14': {
    fontFamily: 'PretendardVariable',
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 21, // 1.5배
    color: '#333333',
  },

  // Tailwind 커스텀 색상 - 텍스트 색상 (tailwind.config.js에서 가져옴)
  'blue-100': { color: '#F0F5FF' },
  'blue-700': { color: '#2F6FED' },
  'blue-800': { color: '#1D5BD6' },
  'blue-900': { color: '#1E4EAE' },

  'purple-100': { color: '#F8F5FF' },
  'purple-700': { color: '#8B54F7' },
  'purple-800': { color: '#6D35DE' },
  'purple-900': { color: '#5221B5' },

  'success-100': { color: '#EDFDF8' },
  'success-700': { color: '#08875D' },
  'success-800': { color: '#04724D' },
  'success-900': { color: '#066042' },

  'warning-100': { color: '#FFF8EB' },
  'warning-700': { color: '#B25E09' },
  'warning-800': { color: '#96530F' },
  'warning-900': { color: '#80460D' },

  'danger-100': { color: '#FEF1F2' },
  'danger-700': { color: '#E02D3C' },
  'danger-800': { color: '#BA2532' },
  'danger-900': { color: '#981B25' },

  'blackPrimary': { color: '#333333' },
  'blackSecondary': { color: 'rgba(51, 51, 51, 0.8)' },
  'blackDisabled': { color: 'rgba(51, 51, 51, 0.65)' },
  'whitePrimary': { color: '#FFFFFF' },
  'whiteSecondary': { color: 'rgba(255, 255, 255, 0.75)' },
  'whiteDisabled': { color: 'rgba(255, 255, 255, 0.6)' },

  // Tailwind 커스텀 색상 - 배경 색상
  'bg-blue-100': { backgroundColor: '#F0F5FF' },
  'bg-blue-700': { backgroundColor: '#2F6FED' },
  'bg-blue-800': { backgroundColor: '#1D5BD6' },
  'bg-blue-900': { backgroundColor: '#1E4EAE' },

  'bg-purple-100': { backgroundColor: '#F8F5FF' },
  'bg-purple-700': { backgroundColor: '#8B54F7' },
  'bg-purple-800': { backgroundColor: '#6D35DE' },
  'bg-purple-900': { backgroundColor: '#5221B5' },

  'bg-success-100': { backgroundColor: '#EDFDF8' },
  'bg-success-700': { backgroundColor: '#08875D' },
  'bg-success-800': { backgroundColor: '#04724D' },
  'bg-success-900': { backgroundColor: '#066042' },

  'bg-warning-100': { backgroundColor: '#FFF8EB' },
  'bg-warning-700': { backgroundColor: '#B25E09' },
  'bg-warning-800': { backgroundColor: '#96530F' },
  'bg-warning-900': { backgroundColor: '#80460D' },

  'bg-danger-100': { backgroundColor: '#FEF1F2' },
  'bg-danger-700': { backgroundColor: '#E02D3C' },
  'bg-danger-800': { backgroundColor: '#BA2532' },
  'bg-danger-900': { backgroundColor: '#981B25' },

  // Tip 박스
  'tip-box': {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  'tip-title': {
    fontSize: 16,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 4,
  },

  // 코드 설명 라벨
  'code-label': {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 4,
  },

  // 코드 블록(밝은 테마)
  'code-block': {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
  },
  'code-inline': {
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 5,
    fontSize: 14,
    fontFamily: 'monospace',
  },

  // HTML 태그 블록 스타일
  'container': {
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
  },
  'row': {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  'tag-block': {
    backgroundColor: 'rgba(51, 51, 51, 0.65)',
    color: 'rgba(255, 255, 255, 0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 21, // 1.5배
    letterSpacing: -0.28,
    marginHorizontal: 6,
    textAlign: 'center',
  },
};

