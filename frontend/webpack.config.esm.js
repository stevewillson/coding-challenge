import webpack from 'webpack'
import HandleCSSLoader from 'webpack-handle-css-loader'
import autoprefixer from 'autoprefixer'
import { ESBuildPlugin } from 'esbuild-loader'
// import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'
import _ from 'lodash'

import paths from './webpack_paths'
import config from './src/config'

// This is the main configuration object.
// Here you write different options and tell Webpack what to do
// TODO: replace with just css-loader. handleCssLoader is old and doesn't have recent versions of css-loader
const handleLoader = new HandleCSSLoader({
  minimize: config.ENV === config.ENVS.PROD,
  extract: !process.env.WEBPACK_DEV_SERVER,
  sourceMap: false,
  cssModules: false,
  postcss: [
    autoprefixer()
  ]
})

const baseWebpackConfig = {
  node: {
    Buffer: false,
    setImmediate: false
  },
  module: {
    exprContextRegExp: /$^/,
    exprContextCritical: false,
    rules: [
      {
        test: /\.js$/,
        loader: 'esbuild-loader',
        options: {
          // format: 'cjs',
          target: 'es2015' // Syntax to compile to (see options below for possible values)
        }
      },
      handleLoader.css(),
      handleLoader.styl()
    ]
  },
  plugins: [
    new ESBuildPlugin()
  ],
  resolve: {
    extensions: ['.js', '.json'],
    alias: {
      react: 'preact/compat',
      'react-dom': 'preact/compat'
    }
  },
  output: {
    filename: '[name].js',
    publicPath: `${config.SCRIPTS_CDN_URL}/`
  }
}

console.log('hostname', config.HOSTNAME)

export default _.defaultsDeep({
  devtool: 'inline-source-map',
  entry: [
    `webpack-dev-server/client?${config.WEBPACK_DEV_URL}`,
    'webpack/hot/dev-server',
    paths.root
  ],
  output: {
    filename: 'bundle.js',
    path: __dirname,
    publicPath: `${config.WEBPACK_DEV_URL}/`,
    pathinfo: false
  }, // seems to improve perf
  devServer: {
    host: config.HOSTNAME,
    port: config.WEBPACK_DEV_PORT,
    publicPath: `${config.WEBPACK_DEV_URL}/`,
    hot: true,
    headers: { 'Access-Control-Allow-Origin': '*' },
    disableHostCheck: true
  },
  plugins: [
    new ESBuildPlugin(),
    new webpack.HotModuleReplacementPlugin()
  ]
}, baseWebpackConfig)
