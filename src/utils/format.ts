// 시간 포맷팅 함수
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes}분`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (remainingMinutes === 0) {
    return `${hours}시간`;
  }
  
  return `${hours}시간 ${remainingMinutes}분`;
};

// 날짜 포맷팅 함수
export const formatDate = (date: Date): string => {
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) {
    return '어제';
  } else if (diffDays < 7) {
    return `${diffDays}일 전`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}주 전`;
  } else {
    return date.toLocaleDateString('ko-KR');
  }
};

// 진행률 포맷팅 함수
export const formatProgress = (progress: number): string => {
  return `${Math.round(progress)}%`;
};

// 난이도 포맷팅 함수
export const formatDifficulty = (difficulty: string): string => {
  const difficultyMap: Record<string, string> = {
    beginner: '초급',
    intermediate: '중급',
    advanced: '고급',
  };
  
  return difficultyMap[difficulty] || difficulty;
};

// 파일 크기 포맷팅 함수
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// 이메일 마스킹 함수
export const maskEmail = (email: string): string => {
  const [localPart, domain] = email.split('@');
  
  if (localPart.length <= 2) {
    return email;
  }
  
  const maskedLocal = localPart.charAt(0) + '*'.repeat(localPart.length - 2) + localPart.charAt(localPart.length - 1);
  return `${maskedLocal}@${domain}`;
};

// 전화번호 포맷팅 함수
export const formatPhoneNumber = (phoneNumber: string): string => {
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  } else if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }
  
  return phoneNumber;
};

// 숫자에 천 단위 콤마 추가
export const formatNumber = (num: number): string => {
  return num.toLocaleString('ko-KR');
};

// 텍스트 길이 제한 함수
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }
  
  return text.substring(0, maxLength) + '...';
}; 