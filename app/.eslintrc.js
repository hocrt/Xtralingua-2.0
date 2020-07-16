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
        "no-const-assign": "warn",
        "no-this-before-super": "warn",
        "no-undef": "warn",
        "no-unreachable": "warn",
        "no-unused-vars": "warn",
        "constructor-super": "warn",
        "valid-typeof": "warn",
        "class-methods-use-this": "warn",
        "no-unused-vars": "warn",
        "no-invalid-this": "warn",
    }
}
