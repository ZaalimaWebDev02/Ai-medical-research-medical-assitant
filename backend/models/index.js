// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  name: String,
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
});

// models/Chat.js
const ChatSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    metadata: {
      papers: [{ title: String, url: String, source: String, year: Number }],
      trials: [{ title: String, status: String, url: String }],
      queryExpanded: String
    }
  }],
  context: {
    disease: String,
    lastQuery: String,
    patientName: String,
    location: String
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ChatSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// models/Query.js
const QuerySchema = new mongoose.Schema({
  sessionId: String,
  originalQuery: String,
  expandedQuery: String,
  disease: String,
  resultsCount: {
    pubmed: Number,
    openAlex: Number,
    clinicalTrials: Number
  },
  topRankedPapers: Number,
  processingTimeMs: Number,
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Chat = mongoose.model('Chat', ChatSchema);
const Query = mongoose.model('Query', QuerySchema);

module.exports = { User, Chat, Query };