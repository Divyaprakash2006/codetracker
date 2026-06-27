const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  salt: {
    type: String,
    required: true
  },
  leetcodeSession: {
    type: String,
    default: null
  },
  leetcodeCsrfToken: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Account', accountSchema);
