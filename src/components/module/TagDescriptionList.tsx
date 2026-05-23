import React from 'react';
import { View, Text } from 'react-native';
import RenderHTML from 'react-native-render-html';
import { htmlTagsStyles, classesStyles } from '../../utils/htmlStyles';

interface TagDescriptionItem {
  id: number;
  tag: string;
  title?: string;
  description: string;
  tagColor?: string;
  tagBackgroundColor?: string;
}

interface TagDescriptionListProps {
  module: {
    id: number;
    type: string;
    items: TagDescriptionItem[];
    visibility?: {
      type: string;
      time?: number;
    };
  };
}

const TagDescriptionListItem: React.FC<{
  item: TagDescriptionItem;
  onAppear?: () => void;
  isLast?: boolean;
  index: number;
}> = ({ item, isLast }) => {
  return (
    <View
      style={{
        borderBottomWidth: isLast ? 0 : 0.75,
        borderBottomColor: '#E1E6EF',
        paddingBottom: isLast ? 0 : 15.75,
        gap: 10,
      }}
    >
      <View
        style={{
          backgroundColor: '#F0F5FF',
          borderRadius: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        }}
      >
        <Text
          style={{
            fontFamily: 'PretendardVariable',
            fontWeight: '700',
            fontSize: 14,
            lineHeight: 21,
            color: '#2F6FED',
            letterSpacing: -0.28,
          }}
        >
          {item.tag}
        </Text>
      </View>

      {item.title && (
        <Text
          style={{
            fontFamily: 'PretendardVariable',
            fontWeight: '700',
            fontSize: 14,
            lineHeight: 21,
            color: '#333',
            letterSpacing: -0.28,
            marginBottom: -8,
          }}
        >
          {item.title}
        </Text>
      )}

      <RenderHTML
        contentWidth={300}
        source={{ html: item.description }}
        tagsStyles={htmlTagsStyles}
        classesStyles={classesStyles}
        baseStyle={{
          fontFamily: 'PretendardVariable',
          fontWeight: '400',
          fontSize: 15,
          lineHeight: 22.5,
          color: '#333',
          letterSpacing: -0.3,
        }}
      />
    </View>
  );
};

export const TagDescriptionListComponent: React.FC<TagDescriptionListProps> = ({ module }) => {
  return (
    <View
      style={{
        backgroundColor: '#F8F9FC',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.2,
        shadowRadius: 5,
        elevation: 5,
        gap: 15,
      }}
    >
      {module.items.map((item, index) => (
        <TagDescriptionListItem
          key={item.id}
          item={item}
          index={index}
          isLast={index === module.items.length - 1}
        />
      ))}
    </View>
  );
};
