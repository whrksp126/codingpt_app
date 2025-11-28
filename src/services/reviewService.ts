import { api } from '../utils/api';
import type { Review } from '../components/Review/ReviewCard';

// API 응답 타입
interface ReviewResponse {
  id: number;
  user_id: number;
  product_id: number;
  score: number;
  review_text: string;
  created_at: string;
  updated_at: string;
  User?: {
    id: number;
    name: string;
    profile_image?: string;
  };
  lessonProgress?: number;
}

// API 응답 → 앱 모델 매핑
function mapReviewResponse(dto: ReviewResponse): Review {
  return {
    id: dto.id,
    userId: dto.user_id,
    userName: dto.User?.name || '익명',
    userAvatar: dto.User?.profile_image,
    score: dto.score,
    reviewText: dto.review_text,
    createdAt: dto.created_at,
    lessonProgress: dto.lessonProgress,
  };
}

/**
 * 후기 서비스
 */
class ReviewService {
  /**
   * 특정 상품의 후기 목록 조회
   */
  // async getReviewsByProductId(productId: number): Promise<Review[]> {
  //   try {
  //     const response = await api.reviews.getByProductId(productId);
      
  //     if (response.success && response.data) {
  //       // API 응답 구조에 따라 data 추출
  //       const reviewsData = response.data.data || response.data;
        
  //       if (Array.isArray(reviewsData)) {
  //         return reviewsData.map(mapReviewResponse);
  //       }
  //     }
      
  //     return [];
  //   } catch (error) {
  //     console.error('후기 목록 조회 실패:', error);
  //     return [];
  //   }
  // }

  /**
   * 후기 작성
   */
  async createReview(
    productId: number,
    score: number,
    reviewText: string
  ): Promise<Review | null> {
    try {
      const response = await api.reviews.create({
        product_id: productId,
        score,
        review_text: reviewText,
      });
      console.log("createReview response,", response);

      if (response.success && response.data) {
        const reviewData = response.data.data || response.data;
        return mapReviewResponse(reviewData);
      }

      return null;
    } catch (error) {
      console.error('후기 작성 실패:', error);
      throw error;
    }
  }

  /**
   * 후기 수정
   */
  // async updateReview(
  //   reviewId: number,
  //   score: number,
  //   reviewText: string
  // ): Promise<Review | null> {
  //   try {
  //     const response = await api.reviews.update(reviewId, {
  //       score,
  //       review_text: reviewText,
  //     });

  //     if (response.success && response.data) {
  //       const reviewData = response.data.data || response.data;
  //       return mapReviewResponse(reviewData);
  //     }

  //     return null;
  //   } catch (error) {
  //     console.error('후기 수정 실패:', error);
  //     throw error;
  //   }
  // }

  /**
   * 후기 삭제
   */
  // async deleteReview(reviewId: number): Promise<boolean> {
  //   try {
  //     const response = await api.reviews.delete(reviewId);
  //     return response.success;
  //   } catch (error) {
  //     console.error('후기 삭제 실패:', error);
  //     return false;
  //   }
  // }
}

export default new ReviewService();


