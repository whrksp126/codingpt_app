import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Image, Pressable, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Trash } from 'phosphor-react-native';
import StarRating from '../../components/Review/StarRating';
import reviewService, { MyReview } from '../../services/reviewService';
import { useStore } from '../../contexts/StoreContext';
import { useAppAlert } from '../../hooks/useAppAlert';
import type { Product } from '../../services/storeService';
import type { RootStackParamList } from '../../navigation/types';
import { v2 } from '../../theme/v2Tokens';

const C = v2.colors;
const R = v2.radius;

const getCategoryIcon = (categoryName: string) => {
  const code = (categoryName || '').split('(')[0].trim();
  switch (code) {
    case 'HTML': return require('../../assets/icons/html-5-icon.png');
    case 'CSS': return require('../../assets/icons/css-3-icon.png');
    case 'JS': return require('../../assets/icons/js-icon.png');
    case 'JAVA': return require('../../assets/icons/java-icon.png');
    default: return require('../../assets/icons/js-icon.png');
  }
};

const fmtDate = (s: string) => {
  const d = new Date(s);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

const ReviewCard: React.FC<{
  review: MyReview; product?: Product; categoryName?: string;
  onPressCard: () => void; onDelete: (id: number) => void;
}> = ({ review, product, categoryName, onPressCard, onDelete }) => {
  const { confirm } = useAppAlert();
  const handleDelete = async () => {
    const ok = await confirm({ title: '후기 삭제', message: '정말 삭제하시겠습니까?', confirmText: '삭제', danger: true });
    if (ok) onDelete(review.id);
  };
  return (
    <Pressable
      onPress={onPressCard}
      android_ripple={{ color: C.elevated2 }}
      style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: R.lg, padding: 16, marginBottom: 12 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden' }}>
          <Image source={getCategoryIcon(categoryName || '')} style={{ width: 30, height: 30 }} resizeMode="contain" />
        </View>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text }}>{product?.name || '알 수 없는 상품'}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <StarRating rating={review.score} size={16} />
          <Text style={{ fontSize: 12, color: C.textDim, marginLeft: 10 }}>{fmtDate(review.createdAt)}</Text>
        </View>
        <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleDelete(); }} style={{ padding: 4 }}>
          <Trash size={18} color={C.error} />
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 14, color: C.text2, lineHeight: 20 }}>{review.reviewText}</Text>
    </Pressable>
  );
};

// 후기 — 내 정보 시트의 설정 하위 패널(V2). 헤더는 시트가 제공.
const ReviewsContent: React.FC = () => {
  const [reviews, setReviews] = useState<MyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { productIndex, categoryIndex } = useStore();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const fetchReviews = useCallback(async () => {
    try { setReviews(await reviewService.getMyReviews()); }
    catch (e) { console.error('내 후기 조회 실패:', e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  const onRefresh = useCallback(() => { setRefreshing(true); fetchReviews(); }, [fetchReviews]);

  const onDelete = useCallback(async (id: number) => {
    try {
      if (await reviewService.deleteReview(id)) setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (e) { console.error('후기 삭제 실패:', e); }
  }, []);

  const onPressCard = useCallback((productId: number) => {
    const product = productIndex.get(productId);
    const categoryName = categoryIndex.get(productId) || '';
    if (product) {
      navigation.navigate('LessonFlow', {
        screen: 'LessonDetail',
        params: { id: product.id, name: product.name, icon: getCategoryIcon(categoryName), description: product.description, price: product.price, initialTab: '후기' },
      });
    }
  }, [navigation, productIndex, categoryIndex]);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: C.base, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={C.accent} /></View>;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.base }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} progressBackgroundColor={C.surface} />}
    >
      {reviews.length === 0 ? (
        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 8 }}>작성한 후기가 없습니다</Text>
          <Text style={{ fontSize: 13.5, color: C.textDim, textAlign: 'center' }}>수강한 강의에 후기를 남겨보세요!</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 13, color: C.textDim, marginBottom: 14 }}>총 {reviews.length}개의 후기를 작성했습니다</Text>
          {reviews.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              product={productIndex.get(r.productId)}
              categoryName={categoryIndex.get(r.productId)}
              onPressCard={() => onPressCard(r.productId)}
              onDelete={onDelete}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
};

export default ReviewsContent;
