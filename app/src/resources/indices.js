const indicesSchema = {
  indexType: String,
  indexTypeDisplayName: String,
  scriptPath: String,
  env: String,
  indicesDeclaration: [{ indexName: String, displayName: String }],
}

export default indicesSchema
