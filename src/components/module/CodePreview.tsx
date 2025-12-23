import React from 'react';
import { View, Text } from 'react-native';
import BrowserHeader from '../BrowserHeader';

interface HighlightConfig {
  text: string;
  color: string;
}

interface CodePreviewModule {
  type: 'codePreview';
  theme?: 'dark' | 'light';
  header?: {
    type: 'browserHeader';
    size?: 'small' | 'default';
  };
  code: {
    language: string;
    content: string;
    highlight?: HighlightConfig[];
  };
}

interface Props {
  module: CodePreviewModule;
}

export const CodePreviewComponent: React.FC<Props> = ({ module }) => {
  const { theme = 'dark', header, code } = module;

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#1E1E1E' : '#FFFFFF';
  const textColor = isDark ? '#FFFFFF' : '#333333';

  // 코드 내용을 하이라이트 처리하여 렌더링
  const renderCodeContent = () => {
    const { content, highlight } = code;

    if (!highlight || highlight.length === 0) {
      return (
        <Text className="bold-14" style={{ color: textColor, lineHeight: 24 }}>
          {content}
        </Text>
      );
    }

    // 하이라이트할 텍스트들을 찾아서 처리
    let processedContent: React.ReactNode[] = [];
    let remaining = content;
    let keyIndex = 0;

    // 간단한 방식으로 하이라이트 처리 (button 태그 예시용)
    const parts: React.ReactNode[] = [];

    // HTML 태그 파싱하여 하이라이트 적용
    const regex = /<(\/?button)>/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // 매치 전 텍스트
      if (match.index > lastIndex) {
        parts.push(
          <Text key={`text-${keyIndex++}`} style={{ color: textColor }}>
            {content.slice(lastIndex, match.index)}
          </Text>
        );
      }

      // 하이라이트된 부분
      const highlightConfig = highlight.find(h => h.text === 'button');
      parts.push(
        <Text key={`tag-${keyIndex++}`} style={{ color: textColor }}>
          {'<'}
        </Text>
      );
      if (match[1].startsWith('/')) {
        parts.push(
          <Text key={`slash-${keyIndex++}`} style={{ color: textColor }}>
            /
          </Text>
        );
        parts.push(
          <Text
            key={`highlight-${keyIndex++}`}
            style={{ color: highlightConfig?.color || '#FB64B6' }}
          >
            button
          </Text>
        );
      } else {
        parts.push(
          <Text
            key={`highlight-${keyIndex++}`}
            style={{ color: highlightConfig?.color || '#FB64B6' }}
          >
            button
          </Text>
        );
      }
      parts.push(
        <Text key={`close-${keyIndex++}`} style={{ color: textColor }}>
          {'>'}
        </Text>
      );

      lastIndex = regex.lastIndex;
    }

    // 남은 텍스트
    if (lastIndex < content.length) {
      parts.push(
        <Text key={`text-${keyIndex++}`} style={{ color: textColor }}>
          {content.slice(lastIndex)}
        </Text>
      );
    }

    return (
      <Text className="bold-14" style={{ lineHeight: 24 }}>
        {parts}
      </Text>
    );
  };

  return (
    <View
      className="w-full rounded-[16px] overflow-hidden"
      style={{ backgroundColor: bgColor }}
    >
      {/* Header */}
      {header?.type === 'browserHeader' && (
        <View className="px-4 pt-4">
          <BrowserHeader size={header.size === 'small' ? 'small' : undefined} />
        </View>
      )}

      {/* Code Content */}
      <View className="px-4 py-4">
        <View className="flex-row flex-wrap items-center">
          {renderCodeContent()}
        </View>
      </View>
    </View>
  );
};

