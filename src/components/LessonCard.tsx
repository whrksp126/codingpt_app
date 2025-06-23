import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface LessonCardProps {
  title: string;
  description: string;
  duration: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  progress?: number;
  onPress: () => void;
}

const LessonCard: React.FC<LessonCardProps> = ({
  title,
  description,
  duration,
  difficulty,
  progress = 0,
  onPress,
}) => {
  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner':
        return '#28A745';
      case 'intermediate':
        return '#FFC107';
      case 'advanced':
        return '#DC3545';
      default:
        return '#6C757D';
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.difficulty, { backgroundColor: getDifficultyColor(difficulty) }]}>
          <Text style={styles.difficultyText}>{difficulty}</Text>
        </View>
      </View>
      <Text style={styles.description}>{description}</Text>
      <View style={styles.footer}>
        <Text style={styles.duration}>{duration}</Text>
        {progress > 0 && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
            <Text style={styles.progressText}>{progress}%</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    flex: 1,
  },
  difficulty: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  difficultyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  description: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 12,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duration: {
    fontSize: 12,
    color: '#6C757D',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBar: {
    height: 4,
    backgroundColor: '#007AFF',
    borderRadius: 2,
    marginRight: 8,
  },
  progressText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
});

export default LessonCard; 