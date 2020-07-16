module.exports = {
    plugins: [
      [
        "module-resolver", {
          "extensions": [".js", ".jsx", ".ts", ".tsx"],
          alias: {
            /*
              resolves complex relative paths into absolutes i.e
              import '../../../../utils' -> import '@bpm/utils'
            */
            "^@xlng/(.+)": "./src/\\1"
          }
        }
      ]
    ],
    env: {
      production: {
        plugins: []
      }
    }
  };
  