import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  PanResponder,
  Animated,
  LayoutChangeEvent,
} from 'react-native';

export interface DraggableItem {
  id: string;
  [key: string]: any;
}

export interface DropZoneLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragAndDropProps {
  items: DraggableItem[];
  dropZones: (DraggableItem | null)[];
  onDrop: (item: DraggableItem, dropZoneIndex: number) => void;
  onRemoveFromDropZone: (dropZoneIndex: number) => void;
  renderItem: (item: DraggableItem, isDragging: boolean) => React.ReactNode;
  renderDropZone: (
    dropZoneIndex: number,
    item: DraggableItem | null,
    onRemove: () => void
  ) => React.ReactNode;
  className?: string;
}

export default function DragAndDrop({
  items,
  dropZones,
  onDrop,
  onRemoveFromDropZone,
  renderItem,
  renderDropZone,
  className,
}: DragAndDropProps) {
  const [draggingItem, setDraggingItem] = useState<DraggableItem | null>(null);
  const [draggingPosition, setDraggingPosition] = useState({ x: 0, y: 0 });

  const dropZoneLayouts = useRef<DropZoneLayout[]>(
    dropZones.map(() => ({ x: 0, y: 0, width: 0, height: 0 }))
  );
  const dropZoneRefs = useRef<Array<View | null>>(
    dropZones.map(() => null)
  );

  const measureDropZone = useCallback(
    (index: number): Promise<DropZoneLayout> => {
      return new Promise((resolve) => {
        const dropZoneRef = dropZoneRefs.current[index];
        if (dropZoneRef) {
          dropZoneRef.measureInWindow((fx, fy, width, height) => {
            const layout = { x: fx, y: fy, width, height };
            dropZoneLayouts.current[index] = layout;
            resolve(layout);
          });
        } else {
          resolve(dropZoneLayouts.current[index]);
        }
      });
    },
    []
  );

  const handleDrop = useCallback(
    async (x: number, y: number, item: DraggableItem) => {
      // 모든 드롭 존의 위치를 측정
      const layouts = await Promise.all(
        dropZoneRefs.current.map((_, index) => measureDropZone(index))
      );

      // 드롭 존과의 충돌 감지
      for (let i = 0; i < layouts.length; i++) {
        const zone = layouts[i];
        if (
          y >= zone.y &&
          y <= zone.y + zone.height &&
          x >= zone.x &&
          x <= zone.x + zone.width
        ) {
          onDrop(item, i);
          return;
        }
      }
    },
    [onDrop, measureDropZone]
  );

  const panResponders = items.map((item) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setDraggingItem(item);
        const { pageX, pageY } = evt.nativeEvent;
        setDraggingPosition({ x: pageX, y: pageY });
      },
      onPanResponderMove: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        setDraggingPosition({ x: pageX, y: pageY });
      },
      onPanResponderRelease: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        handleDrop(pageX, pageY, item);
        setDraggingItem(null);
      },
    })
  );

  const handleDropZoneLayout = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      measureDropZone(index);
    },
    [measureDropZone]
  );

  return (
    <>
      {/* Drop Zones */}
      <View className={className || "flex-row gap-[10px] items-center justify-center"}>
        {dropZones.map((item, index) => (
          <View
            key={index}
            ref={(ref) => {
              dropZoneRefs.current[index] = ref;
            }}
            onLayout={handleDropZoneLayout(index)}
          >
            {renderDropZone(index, item, () => onRemoveFromDropZone(index))}
          </View>
        ))}
      </View>

      {/* Draggable Items */}
      <View className="flex-row gap-3 items-center justify-center w-full mt-[50px]">
        {items.map((item, index) => (
          <Animated.View
            key={item.id}
            {...panResponders[index].panHandlers}
            style={{
              opacity: draggingItem?.id === item.id ? 0.5 : 1,
            }}
          >
            {renderItem(item, draggingItem?.id === item.id)}
          </Animated.View>
        ))}
      </View>

      {/* Dragging Item Overlay */}
      {draggingItem && (
        <View
          style={{
            position: 'absolute',
            left: draggingPosition.x - 50,
            top: draggingPosition.y - 20,
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          {renderItem(draggingItem, true)}
        </View>
      )}
    </>
  );
}

