const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  displayName: { type: String, default: '' },
  avatar: { type: String, default: '' },
  ranking: { type: Number, default: 0 },
  totalSolved: { type: Number, default: 0 },
  easySolved: { type: Number, default: 0 },
  mediumSolved: { type: Number, default: 0 },
  hardSolved: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  easyTotal: { type: Number, default: 0 },
  mediumTotal: { type: Number, default: 0 },
  hardTotal: { type: Number, default: 0 },
  acceptanceRate: { type: Number, default: 0 },
  contributionPoints: { type: Number, default: 0 },
  reputation: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },
  maxStreak: { type: Number, default: 0 },
  totalActiveDays: { type: Number, default: 0 },
  submissionCalendar: { type: String, default: '{}' },
  isActive: { type: Boolean, default: true },
  lastSynced: { type: Date, default: null },
  addedAt: { type: Date, default: Date.now },
  syncError: { type: String, default: null }
});

module.exports = mongoose.model('User', userSchema);
