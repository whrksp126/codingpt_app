import React from 'react';
import { View, TextInput, StyleSheet, Text } from 'react-native';

interface CodeEditorProps {
  code: string;
  onCodeChange: (code: string) => void;
  language?: string;
  placeholder?: string;
  readOnly?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onCodeChange,
  language = 'javascript',
  placeholder = '코드를 입력하세요...',
  readOnly = false,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.language}>{language}</Text>
      </View>
      <TextInput
        style={styles.editor}
        value={code}
        onChangeText={onCodeChange}
        placeholder={placeholder}
        multiline
        textAlignVertical="top"
        editable={!readOnly}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    backgroundColor: '#F8F9FA',
  },
  header: {
    backgroundColor: '#E9ECEF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  language: {
    fontSize: 12,
    color: '#6C757D',
    fontWeight: '500',
  },
  editor: {
    padding: 12,
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#212529',
    minHeight: 200,
  },
});

export default CodeEditor; 