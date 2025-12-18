import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Dimensions,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function LessonGoalScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.gradientBackground}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressBarWrapper}>
              <View style={[styles.progressBar, styles.progressFilled]} />
              <View style={[styles.progressBar, styles.progressFilled]} />
              <View style={[styles.progressBar, styles.progressEmpty]} />
              <View style={[styles.progressBar, styles.progressEmpty]} />
              <View style={[styles.progressBar, styles.progressEmpty]} />
              <View style={[styles.progressBar, styles.progressEmpty]} />
            </View>
            
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>02. 버튼 만들기 학습 목표</Text>
              <View style={styles.closeIcon}>
                <Text style={styles.closeIconText}>✕</Text>
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View style={styles.mainContent}>
            {/* Icon Section */}
            <View style={styles.iconSection}>
              <View style={styles.iconContainer}>
                <Text style={styles.iconText}>🎯</Text>
              </View>
            </View>

            {/* Title */}
            <Text style={styles.mainTitle}>이번 레슨은 목표</Text>
          </View>

          {/* Mission Card */}
          <View style={styles.missionSection}>
            <View style={styles.missionCard}>
              <Text style={styles.missionTitle}>Mission</Text>
              
              <View style={styles.missionList}>
                {/* Mission Item 1 */}
                <View style={styles.missionItem}>
                  <View style={styles.missionItemLeft}>
                    <View style={styles.checkIcon}>
                      <Text style={styles.checkIconText}>✓</Text>
                    </View>
                    <Text style={styles.missionItemText}>버튼 이해하기</Text>
                  </View>
                  <Text style={styles.missionSteps}>6 단계</Text>
                </View>

                {/* Mission Item 2 */}
                <View style={styles.missionItem}>
                  <View style={styles.missionItemLeft}>
                    <View style={styles.checkIcon}>
                      <Text style={styles.checkIconText}>✓</Text>
                    </View>
                    <Text style={styles.missionItemText}>버튼 만들기</Text>
                  </View>
                </View>

                {/* Mission Item 3 */}
                <View style={styles.missionItem}>
                  <View style={styles.missionItemLeft}>
                    <View style={styles.checkIcon}>
                      <Text style={styles.checkIconText}>✓</Text>
                    </View>
                    <Text style={styles.missionItemText}>송금하기</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Bottom Section with Character */}
          <View style={styles.bottomSection}>
            <View style={styles.speechBubbleContainer}>
              <View style={styles.speechBubble}>
                <Text style={styles.speechText}>
                  이제 송금하기 버튼을 만들러 가볼까요?
                </Text>
              </View>
            </View>

            <View style={styles.characterContainer}>
              <Image
                source={require('../../assets/images/turtle.png')}
                style={styles.characterImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  gradientBackground: {
    flex: 1,
    backgroundColor: '#F2E1C0',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 20,
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 4,
  },
  progressBarWrapper: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 10,
  },
  progressBar: {
    flex: 1,
    height: 3,
    borderRadius: 5,
  },
  progressFilled: {
    backgroundColor: '#08875D', // success.700
  },
  progressEmpty: {
    backgroundColor: '#E1E6EF', // neutral.300
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'PretendardVariable',
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(51, 51, 51, 0.8)', // text.blackSecondary
    letterSpacing: -0.32,
  },
  closeIcon: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIconText: {
    fontSize: 18,
    color: 'rgba(51, 51, 51, 0.8)',
  },
  mainContent: {
    paddingHorizontal: 16,
    paddingVertical: 40,
    gap: 30,
    alignItems: 'center',
  },
  iconSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFF8EB', // warning.100
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 32,
  },
  mainTitle: {
    fontFamily: 'PretendardVariable',
    fontSize: 22,
    fontWeight: '700',
    color: '#333333',
    textAlign: 'center',
    letterSpacing: -0.44,
  },
  missionSection: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  missionCard: {
    width: '100%',
    backgroundColor: '#F8F9FC', // neutral.100
    borderRadius: 16,
    padding: 24,
    gap: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 5,
  },
  missionTitle: {
    fontFamily: 'PretendardVariable',
    fontSize: 22,
    fontWeight: '700',
    color: '#333333',
    textAlign: 'center',
    letterSpacing: -0.44,
  },
  missionList: {
    gap: 16,
  },
  missionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 24,
  },
  missionItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  checkIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(51, 51, 51, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkIconText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(51, 51, 51, 0.8)',
  },
  missionItemText: {
    fontFamily: 'PretendardVariable',
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(51, 51, 51, 0.8)',
    lineHeight: 24,
  },
  missionSteps: {
    fontFamily: 'PretendardVariable',
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(51, 51, 51, 0.8)',
    lineHeight: 24,
  },
  bottomSection: {
    position: 'relative',
    paddingBottom: 110,
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 60,
  },
  speechBubbleContainer: {
    alignItems: 'flex-end',
    paddingRight: 44,
  },
  speechBubble: {
    backgroundColor: '#F8F9FC',
    borderRadius: 15,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
    maxWidth: width - 76,
  },
  speechText: {
    fontFamily: 'PretendardVariable',
    fontSize: 15,
    fontWeight: '600',
    color: '#333333',
    letterSpacing: -0.3,
    lineHeight: 22.5,
  },
  characterContainer: {
    position: 'absolute',
    right: 16,
    bottom: 0,
    width: 160,
    height: 160,
  },
  characterImage: {
    width: '100%',
    height: '100%',
  },
});

