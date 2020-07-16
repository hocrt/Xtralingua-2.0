const nodeExternals = require('webpack-node-externals')

module.exports = ({ mode }) => {
  return {
    mode,
    target: 'electron-renderer',
    entry: './src/electron.js',
    externals: [nodeExternals()],
    output: {
      path: __dirname + '/build',
      publicPath: 'build/',
      filename: 'bundle.js'
    },
    module: {
      rules: [
        {
          test: /\.(jsx?|tsx?)$/,
          exclude: /node_modules/,
          loader: 'babel-loader',
        },
        {
          test: /\.(png|jpg|gif|svg)$/,
          loader: 'file-loader',
          query: {
            name: '[name].[ext]?[hash]'
          }
        },
        {
          test: /\.(woff|woff2|ttf|eot)$/,
          loader: 'url-loader',
        },
        {
          test: /\.css$/,
          loader: "css-loader"
        },
      ]
    },
    resolve: {
      extensions: ['.js', '.json', '.jsx'],
      modules: ['node_modules', 'app/src/assets']
    }
  }
}