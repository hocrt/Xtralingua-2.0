const corpusSchema = {
  name: String,
  path: {
    type: String,
    unique: true,
  },
  size: Number,
  lastModified: Number,
  indices: {
    readability: Object,
    lexdiv: Object,
    misc: Object,
    tokens: Array,
    tokensNum: Array,
    vocabulary: Array,
    vocabularyNum: Array,
  },
}

export default corpusSchema
