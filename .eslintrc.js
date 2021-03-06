module.exports = {
  env: {
    browser: true,
    es6: true
  },
  extends: [
    'standard'
  ],
  // only necessary because we use clsas properties
  // https://stackoverflow.com/questions/60046847/eslint-does-not-allow-static-class-properties
  parser: '@babel/eslint-parser',
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
    globalThis: false // means it is not writeable
  }
}
