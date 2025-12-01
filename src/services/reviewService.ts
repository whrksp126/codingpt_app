import { api } from '../utils/api';
import type { Review } from '../components/Review/ReviewCard';

// API 응답 타입
interface ReviewResponse {
  id: number;
  product_id: number;
  score: number;
  review_text: string;
  created_at: string;
  updated_at: string;
  User?: {
    id: number;
    nickname: string;
    profile_img?: string;
  };
  ProductReviewMaps?: {
    product_id: number;
  }[];
}

// 내 리뷰 타입 (productId만 포함, product 정보는 Context에서 조회)
export interface MyReview extends Review {
  productId: number;
}

// API 응답 → 앱 모델 매핑
function mapReviewResponse(dto: ReviewResponse): Review {
  return {
    id: dto.id,
    userId: dto.User!.id,
    userName: dto.User!.nickname || '익명',
    userAvatar: dto.User!.profile_img,
    score: dto.score,
    reviewText: dto.review_text,
    createdAt: dto.created_at,
  };
}

/**
 * 후기 서비스
 */
class ReviewService {
  /**
   * 특정 상품의 후기 목록 조회
   */
  async getReviewsByProductId(productId: number): Promise<Review[]> {
    try {
      const response = await api.reviews.getByProductId(productId);
      // console.log("=====> getReviewsByProductId response,", response);
      if (response.success && response.data) {
        const reviewsData = response.data;
        return reviewsData.map(mapReviewResponse);
      }
      
      return [];
    } catch (error) {
      console.error('후기 목록 조회 실패:', error);
      return [];
    }
  }

  /**
   * 후기 작성
   * @returns 생성된 리뷰 ID (성공 시) 또는 null (실패 시)
   */
  async createReview(
    productId: number,
    score: number,
    reviewText: string
  ): Promise<number | null> {
    try {
      const response = await api.reviews.create({
        product_id: productId,
        score,
        review_text: reviewText,
      });

      if (response.success && response.data) {
        const reviewData = response.data.data || response.data;
        // 생성된 리뷰 ID만 반환
        return reviewData.id;
      }

      return null;
    } catch (error) {
      console.error('후기 작성 실패:', error);
      throw error;
    }
  }

  /**
   * 후기 수정 (최적화: 백엔드 응답 최소화 + 프론트 로컬 병합)
   */
  async updateReview(
    reviewId: number,
    score: number,
    reviewText: string
  ): Promise<boolean> {
    try {
      const response = await api.reviews.update(reviewId, {
        score,
        review_text: reviewText,
      });

      // 성공 여부만 반환 (데이터는 프론트에서 로컬 병합)
      return response.success === true;
    } catch (error) {
      console.error('후기 수정 실패:', error);
      throw error;
    }
  }

  /**
   * 후기 삭제
   */
  async deleteReview(reviewId: number): Promise<boolean> {
    try {
      const response = await api.reviews.delete(reviewId);
      return response.success === true;
    } catch (error) {
      console.error('후기 삭제 실패:', error);
      throw error;
    }
  }

  /**
   * 내가 작성한 후기 목록 조회
   */
  async getMyReviews(): Promise<MyReview[]> {
    try {
      const response = await api.reviews.getMyReviews();
      if (response.success && response.data) {
        const reviewsData = response.data;
        console.log("=====> getMyReviews response,", reviewsData);
        return reviewsData.map((dto: ReviewResponse) => ({
          id: dto.id,
          score: dto.score,
          reviewText: dto.review_text,
          createdAt: dto.created_at,
          productId: dto.ProductReviewMaps?.[0]?.product_id,
        }));
      }
      return [];
    } catch (error) {
      console.error('내 후기 목록 조회 실패:', error);
      return [];
    }
  }
}

export default new ReviewService();


