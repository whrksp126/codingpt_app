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

export default function LessonIntroScreen() {
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
              <View style={[styles.progressBar, styles.progressFilled]} />
              <View style={[styles.progressBar, styles.progressEmpty]} />
              <View style={[styles.progressBar, styles.progressEmpty]} />
              <View style={[styles.progressBar, styles.progressEmpty]} />
            </View>
            
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>01. 버튼을 만들고 싶어요</Text>
              <View style={styles.closeIcon}>
                <Text style={styles.closeIconText}>✕</Text>
              </View>
            </View>
          </View>

          {/* Main Content */}
          <View style={styles.mainContent}>
            {/* Title Section */}
            <View style={styles.titleSection}>
              <View style={styles.iconContainer}>
                <Text style={styles.iconText}>↵</Text>
              </View>
              
              <Text style={styles.mainTitle}>
                내 생애 <Text style={styles.highlightText}>첫 버튼</Text> 만들기
              </Text>
            </View>

            {/* Card */}
            <View style={styles.card}>
              {/* Browser Header */}
              <View style={styles.browserHeader}>
                <View style={styles.browserButtons}>
                  <View style={[styles.browserButton, styles.redButton]} />
                  <View style={[styles.browserButton, styles.yellowButton]} />
                  <View style={[styles.browserButton, styles.greenButton]} />
                </View>
              </View>

              {/* Card Content */}
              <View style={styles.cardContent}>
                <View style={styles.infoSection}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>보내는 분</Text>
                    <Text style={styles.infoValue}>1호 회원</Text>
                  </View>

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>받는 분</Text>
                    <Text style={styles.infoValue}>너구리 PT쌤</Text>
                  </View>

                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>송금액</Text>
                    <Text style={styles.infoValue}>500,000원</Text>
                  </View>
                </View>

                {/* Error Box */}
                <View style={styles.errorBox}>
                  <View style={styles.errorIcon}>
                    <Text style={styles.errorIconText}>!</Text>
                  </View>
                  <Text style={styles.errorText}>버튼이 사라졌어요!</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Bottom Section with Turtle */}
          <View style={styles.bottomSection}>
            <View style={styles.speechBubbleContainer}>
              <View style={styles.speechBubble}>
                <Text style={styles.speechText}>
                  송금을 해야하는데 버튼이 없네..?{'\n'}
                  <Text style={styles.speechBold}>송금하기 </Text>
                  <Text style={[styles.speechBold, styles.speechHighlight]}>버튼</Text>
                  <Text style={styles.speechBold}>을 만들고 싶어요!</Text>
                </Text>
              </View>
            </View>

            <View style={styles.characterContainer}>
              <Image
                source={require('../../assets/images/turtle.png')}
                style={styles.turtleImage}
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
    backgroundColor: '#D7F3E0',
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
    paddingBottom: 10,
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
    paddingVertical: 50,
    gap: 60,
  },
  titleSection: {
    alignItems: 'center',
    gap: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EDFDF8', // success.100
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 32,
    color: '#08875D',
  },
  mainTitle: {
    fontFamily: 'PretendardVariable',
    fontSize: 22,
    fontWeight: '700',
    color: '#333333',
    textAlign: 'center',
    letterSpacing: -0.44,
  },
  highlightText: {
    color: '#08875D', // success.700
  },
  card: {
    backgroundColor: '#F8F9FC', // neutral.100
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  browserHeader: {
    padding: 16,
  },
  browserButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  browserButton: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  redButton: {
    backgroundColor: '#E02D3C',
  },
  yellowButton: {
    backgroundColor: '#B25E09',
  },
  greenButton: {
    backgroundColor: '#08875D',
  },
  cardContent: {
    paddingHorizontal: 25,
    paddingBottom: 20,
    gap: 20,
  },
  infoSection: {
    gap: 12,
  },
  infoItem: {
    gap: 4,
  },
  infoLabel: {
    fontFamily: 'PretendardVariable',
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(51, 51, 51, 0.65)', // text.blackDisabled
    letterSpacing: -0.28,
  },
  infoValue: {
    fontFamily: 'PretendardVariable',
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(51, 51, 51, 0.8)', // text.blackSecondary
    letterSpacing: -0.36,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 60,
    backgroundColor: '#FEF1F2', // danger.100
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E02D3C', // danger.700
  },
  errorIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E02D3C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorIconText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  errorText: {
    fontFamily: 'PretendardVariable',
    fontSize: 16,
    fontWeight: '700',
    color: '#E02D3C',
    letterSpacing: -0.32,
  },
  bottomSection: {
    position: 'relative',
    paddingBottom: 110,
    paddingHorizontal: 16,
    gap: 10,
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
  speechBold: {
    fontWeight: '700',
  },
  speechHighlight: {
    color: '#08875D',
  },
  characterContainer: {
    position: 'absolute',
    right: 16,
    bottom: 0,
    width: 160,
    height: 160,
  },
  turtleImage: {
    width: '100%',
    height: '100%',
  },
});

