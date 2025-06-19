import React from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

function App() {
  return (
    <SafeAreaView style={styles.container}>
      <WebView source={{ uri: 'https://voca.ghmate.com' }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
