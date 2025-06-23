// 앱 전체에서 사용하는 색상 상수
export const colors = {
  // 기본 색상
  primary: '#007AFF',
  secondary: '#5856D6',
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
  info: '#5AC8FA',
  
  // 텍스트 색상
  text: {
    primary: '#212529',
    secondary: '#6C757D',
    tertiary: '#ADB5BD',
    inverse: '#FFFFFF',
  },
  
  // 배경 색상
  background: {
    primary: '#FFFFFF',
    secondary: '#F8F9FA',
    tertiary: '#E9ECEF',
    dark: '#212529',
  },
  
  // 테두리 색상
  border: {
    light: '#E0E0E0',
    medium: '#D0D0D0',
    dark: '#B0B0B0',
  },
  
  // 상태 색상
  status: {
    online: '#34C759',
    offline: '#FF3B30',
    away: '#FF9500',
    busy: '#FF3B30',
  },
  
  // 난이도 색상
  difficulty: {
    beginner: '#28A745',
    intermediate: '#FFC107',
    advanced: '#DC3545',
  },
  
  // 진행률 색상
  progress: {
    background: '#E9ECEF',
    fill: '#007AFF',
    success: '#28A745',
  },
  
  // 그림자 색상
  shadow: {
    light: 'rgba(0, 0, 0, 0.1)',
    medium: 'rgba(0, 0, 0, 0.15)',
    dark: 'rgba(0, 0, 0, 0.2)',
  },
  
  // 그라데이션 색상
  gradient: {
    primary: ['#007AFF', '#5856D6'],
    secondary: ['#34C759', '#30D158'],
    warning: ['#FF9500', '#FF6B35'],
    danger: ['#FF3B30', '#FF2D55'],
  },
} as const;

export default colors; 