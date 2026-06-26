const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  title: { type: String, required: true },
  titleSlug: { type: String, default: '' },
  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard', 'Unknown'],
    default: 'Unknown'
  },
  lang: { type: String, default: 'unknown' },
  langName: { type: String, default: '' },
  status: { type: String, default: 'Accepted' },
  timestamp: { type: Date, required: true },
  submissionId: { type: String, default: '' }
}, { timestamps: true });

// Compound index to avoid duplicate submissions
submissionSchema.index({ username: 1, submissionId: 1 }, { unique: true, sparse: true });
submissionSchema.index({ timestamp: -1 });

module.exports = mongoose.model('Submission', submissionSchema);
