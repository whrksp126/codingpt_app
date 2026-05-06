import { Image } from 'react-native';

const isHttp = (v: unknown): v is string =>
  typeof v === 'string' && (v.startsWith('http://') || v.startsWith('https://'));

const collectAssetUrls = (lesson: any) => {
  const images = new Set<string>();
  const audios = new Set<string>();

  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        if ((key === 'image' || key === 'src' || key === 'icon') && isHttp(value)) {
          images.add(value);
        } else if (key === 'tts' && isHttp(value)) {
          audios.add(value);
        }
      } else if (key === 'tts' && value && typeof value === 'object' && isHttp((value as any).url)) {
        audios.add((value as any).url);
      } else {
        visit(value);
      }
    }
  };

  visit(lesson);
  return { images: Array.from(images), audios: Array.from(audios) };
};

/**
 * 학습 페이지 진입 시 호출. 슬라이드 트리 전체를 walk해서
 * 이미지는 Image.prefetch, 오디오는 fetch로 OS 디스크 캐시에 적재한다.
 * 모두 fire-and-forget.
 */
export const prefetchLessonAssets = (lesson: any) => {
  const { images, audios } = collectAssetUrls(lesson);

  for (const url of images) {
    Image.prefetch(url).catch(() => {
      // prefetch 실패는 무시 (실제 표시 시 다시 시도됨)
    });
  }

  for (const url of audios) {
    fetch(url).catch(() => {
      // 오디오 prefetch 실패는 무시
    });
  }

  return { imageCount: images.length, audioCount: audios.length };
};
