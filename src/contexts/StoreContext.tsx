import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import storeService, { Product, StoreCategory } from '../services/storeService';

interface StoreContextType {
  storeData: StoreCategory[];           // 카테고리 배열 (Products까지 포함)
  loading: boolean;
  reloadStoreData: () => Promise<void>; // 수동 갱신
  productIndex: Map<number, Product>;   // productId → product O(1) 조회용
  categoryIndex: Map<number, string>;   // productId → categoryName O(1) 조회용
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [storeData, setStoreData] = useState<StoreCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // productId 인덱스 (storeData가 바뀔 때만 재생성)
  const productIndex = useMemo(() => {
    const map = new Map<number, Product>();
    for (const cat of storeData) {
      for (const p of cat.Products || []) map.set(p.id, p);
    }
    return map;
  }, [storeData]);

  // productId → categoryName 인덱스
  const categoryIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const cat of storeData) {
      for (const p of cat.Products || []) map.set(p.id, cat.name);
    }
    return map;
  }, [storeData]);

  const loadStoreData = async () => {
    try {
      setLoading(true);
      const data = await storeService.getAllStores();
      setStoreData(data);
    } catch (error) {
      console.error('[StoreContext] 데이터 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStoreData(); // 앱 시작 시 한 번 로딩
  }, []);

  return (
    <StoreContext.Provider
      value={{ storeData, loading, reloadStoreData: loadStoreData, productIndex, categoryIndex }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = (): StoreContextType => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore는 StoreProvider 내부에서만 사용해야 합니다.');
  }
  return context;
};

/**
 * productId로 Product 한 건 바로 조회
 */
export const useProductFromStore = (productId?: number) => {
  const { productIndex } = useStore();
  return productId ? productIndex.get(productId) : undefined;
};