import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from '../../assets/SvgIcon';
import CharacterSpeechBubble from '../../components/CharacterSpeechBubble';
import { useDragAndDrop, DraggableItem } from '../../components/DragAndDrop';

interface Block extends DraggableItem {
  id: string;
  text: string;
}

export default function LessonButtonCreateScreen() {
  const [blocks, setBlocks] = useState<Block[]>([
    { id: '1', text: '<button>' },
    { id: '2', text: '송금하기' },
    { id: '3', text: '</button>' },
  ]);
  const [dropZones, setDropZones] = useState<(Block | null)[]>([null, null, null]);

  const handleDrop = (item: DraggableItem, dropZoneIndex: number) => {
    const block = item as Block;
    // 이미 블록이 있는 경우 교체
    if (dropZones[dropZoneIndex]) {
      // 기존 블록을 원래 위치로 복원
      const existingBlock = dropZones[dropZoneIndex];
      setBlocks((prev) => [...prev, existingBlock!]);
    }
    
    // 드롭 존에 블록 추가
    const newDropZones = [...dropZones];
    newDropZones[dropZoneIndex] = block;
    setDropZones(newDropZones);
    
    // 원래 블록 목록에서 제거
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));
  };

  const handleRemoveFromDropZone = (dropZoneIndex: number) => {
    const block = dropZones[dropZoneIndex];
    if (block) {
      setBlocks((prev) => [...prev, block]);
      const newDropZones = [...dropZones];
      newDropZones[dropZoneIndex] = null;
      setDropZones(newDropZones);
    }
  };

  const {
    panResponders,
    draggingItem,
    draggingPosition,
    dragOffset,
    itemRefs,
    dropZoneRefs,
    handleDropZoneLayout,
  } = useDragAndDrop({
    items: blocks,
    dropZones,
    onDrop: handleDrop,
  });
  return (
    <SafeAreaView className="flex-1 bg-Background-White_Base" edges={['top']}>
      <View className="flex-1">
        <ScrollView 
          className="flex-1 px-[16px]"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Bar & Header */}
          <View className="pb-1">
            <View className="flex-row gap-1 mb-[10px]">
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Success-Default-700" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
              <View className="flex-1 h-[3px] rounded-[5px] bg-Line-White" />
            </View>
            
            <View className="flex-row justify-between items-center">
              <Text className="bold-16 text-Text-Black_Secondary">
                03. 버튼 태그 만들기
              </Text>
              <View className="w-6 h-6 justify-center items-center">
                <X width={24} height={24} fill="#6C757D" />
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View className="pt-[90px] pb-[20px] items-center gap-[50px]">
            
            {/* Top Speech Bubble & Character */}
            <View className="w-full">
              <CharacterSpeechBubble
                characterImage={require('../../assets/images/raccoon.png')}
                characterSize={{ width: 160, height: 160 }}
              >
                <Text className="semibold-15 text-Text-Black_Primary tracking-[-0.3px] leading-[22.5px]">
                  태그로 감싸서 버튼을 만들어 볼까요?{'\n'}
                  블록을 순서대로 채워보세요.
                </Text>
              </CharacterSpeechBubble>
            </View>

            {/* Drop Zone Container */}
            <View className="w-full bg-Background-White_Secondary rounded-[14px] px-4 py-5 shadow-sm">
              <View className="flex-row gap-[10px] items-center justify-center">
                {/* Drop Zone 1 */}
                <View
                  ref={(ref) => {
                    dropZoneRefs.current[0] = ref;
                  }}
                  onLayout={handleDropZoneLayout(0)}
                  className="bg-Background-White_Base border-[1.5px] border-dashed border-Line-Black h-[40px] rounded-[8px] flex-1 max-w-[100px] justify-center items-center"
                >
                  {dropZones[0] ? (
                    <View className="flex-row items-center gap-1">
                      <Text className="bold-14 text-Text-Black_Primary">
                        {dropZones[0].text}
                      </Text>
                      <Text
                        className="text-Text-Black_Secondary text-xs"
                        onPress={() => handleRemoveFromDropZone(0)}
                      >
                        ✕
                      </Text>
                    </View>
                  ) : null}
                </View>
                {/* Drop Zone 2 */}
                <View
                  ref={(ref) => {
                    dropZoneRefs.current[1] = ref;
                  }}
                  onLayout={handleDropZoneLayout(1)}
                  className="bg-Background-White_Base border-[1.5px] border-dashed border-Line-Black h-[40px] rounded-[8px] flex-1 max-w-[100px] justify-center items-center"
                >
                  {dropZones[1] ? (
                    <View className="flex-row items-center gap-1">
                      <Text className="bold-14 text-Text-Black_Primary">
                        {dropZones[1].text}
                      </Text>
                      <Text
                        className="text-Text-Black_Secondary text-xs"
                        onPress={() => handleRemoveFromDropZone(1)}
                      >
                        ✕
                      </Text>
                    </View>
                  ) : null}
                </View>
                {/* Drop Zone 3 */}
                <View
                  ref={(ref) => {
                    dropZoneRefs.current[2] = ref;
                  }}
                  onLayout={handleDropZoneLayout(2)}
                  className="bg-Background-White_Base border-[1.5px] border-dashed border-Line-Black h-[40px] rounded-[8px] flex-1 max-w-[100px] justify-center items-center"
                >
                  {dropZones[2] ? (
                    <View className="flex-row items-center gap-1">
                      <Text className="bold-14 text-Text-Black_Primary">
                        {dropZones[2].text}
                      </Text>
                      <Text
                        className="text-Text-Black_Secondary text-xs"
                        onPress={() => handleRemoveFromDropZone(2)}
                      >
                        ✕
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {/* Draggable Blocks */}
            <View className="flex-row gap-3 items-center justify-center w-full">
              {blocks.map((block, index) => (
                <Animated.View
                  key={block.id}
                  ref={(ref) => {
                    if (ref && 'measureInWindow' in ref) {
                      itemRefs.current[index] = ref as View;
                    }
                  }}
                  {...panResponders[index].panHandlers}
                  style={{
                    opacity: draggingItem?.id === block.id ? 0.5 : 1,
                  }}
                  className="bg-Success-Default-700 rounded-[8px] px-[12px] py-[8px]"
                >
                  <Text className="bold-14 text-Text-White_Primary">
                    {block.text}
                  </Text>
                </Animated.View>
              ))}
            </View>

          </View>
        </ScrollView>
      </View>
      
      {/* Dragging Block Overlay - 최상위 레벨로 이동 */}
      {draggingItem && (
        <View
          style={{
            position: 'absolute',
            left: draggingPosition.x - dragOffset.x,
            top: draggingPosition.y - dragOffset.y,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          <View className="bg-Success-Default-700 rounded-[8px] px-[12px] py-[8px] opacity-80">
            <Text className="bold-14 text-Text-White_Primary">
              {(draggingItem as Block).text}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

