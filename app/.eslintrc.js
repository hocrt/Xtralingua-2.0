module.exports = {
    'env': {
        'browser': true,
        'es2020': true,
        'node': true,
        "jest": true
    },
    'extends': [
        'eslint:recommended',
        "plugin:react-hooks/recommended"
        // 'plugin:react/recommended'
    ],
    'parserOptions': {
        'ecmaFeatures': {
            'jsx': true
        },
        'ecmaVersion': 11,
        'sourceType': 'module'
    },
    'plugins': [
        'react'
    ],
    'rules': {
      "class-methods-use-this": 0,
      "no-unused-vars": 0,
      "no-invalid-this": 0,
      "import/no-nodejs-modules": 0,
      "import/no-namespace": 0
    }
}
