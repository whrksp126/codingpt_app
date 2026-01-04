import { useState, useRef, useCallback } from 'react';
import { PanResponder, LayoutChangeEvent, View } from 'react-native';

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

interface UseDragAndDropOptions {
  items: DraggableItem[];
  dropZones: (DraggableItem | null)[];
  onDrop: (item: DraggableItem, dropZoneIndex: number) => void;
}

export function useDragAndDrop({
  items,
  dropZones,
  onDrop,
}: UseDragAndDropOptions) {
  const [draggingItem, setDraggingItem] = useState<DraggableItem | null>(null);
  const [draggingPosition, setDraggingPosition] = useState({ x: 0, y: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const dropZoneLayouts = useRef<DropZoneLayout[]>(
    dropZones.map(() => ({ x: 0, y: 0, width: 0, height: 0 }))
  );
  const dropZoneRefs = useRef<Array<View | null>>(
    dropZones.map(() => null)
  );
  const itemRefs = useRef<Array<View | null>>(
    items.map(() => null)
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

  const panResponders = items.map((item, index) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        setDraggingItem(item);
        const { pageX, pageY, locationX, locationY } = evt.nativeEvent;
        
        // 블록의 실제 위치를 측정하여 정확한 오프셋 계산
        const itemRef = itemRefs.current[index];
        if (itemRef) {
          itemRef.measureInWindow((fx, fy, width, height) => {
            // 클릭한 위치의 오프셋 저장 (블록 내부에서 클릭한 위치)
            // locationX, locationY는 블록 내부 상대 좌표이므로 그대로 사용
            setDragOffset({ x: locationX, y: locationY });
            setDraggingPosition({ x: pageX, y: pageY });
          });
        } else {
          // ref가 없으면 locationX, locationY 사용
          setDragOffset({ x: locationX, y: locationY });
          setDraggingPosition({ x: pageX, y: pageY });
        }
      },
      onPanResponderMove: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        setDraggingPosition({ x: pageX, y: pageY });
      },
      onPanResponderRelease: (evt) => {
        const { pageX, pageY } = evt.nativeEvent;
        handleDrop(pageX, pageY, item);
        setDraggingItem(null);
        setDragOffset({ x: 0, y: 0 });
      },
    })
  );

  const handleDropZoneLayout = useCallback(
    (index: number) => (event: LayoutChangeEvent) => {
      measureDropZone(index);
    },
    [measureDropZone]
  );

  return {
    panResponders,
    draggingItem,
    draggingPosition,
    dragOffset,
    itemRefs,
    dropZoneRefs,
    handleDropZoneLayout,
  };
}

