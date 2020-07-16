const scriptSchema = {
  name: {
    type: String,
    unique: true,
  },
  env: String,
  path: String,
  args: Array,
}

export default scriptSchema
