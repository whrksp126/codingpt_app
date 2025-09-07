module.exports = {
  dependencies: {
    '@react-native-google-signin/google-signin': {
      platforms: {
        android: {
          sourceDir: '../node_modules/@react-native-google-signin/google-signin/android',
          packageImportPath: 'import com.reactnativegooglesignin.RNGoogleSigninPackage;',
        },
      },
    },
  },
};
