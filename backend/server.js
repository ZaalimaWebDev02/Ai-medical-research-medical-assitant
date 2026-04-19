const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const chatRoutes = require('./routes/chat');
const queryRoutes = require('./routes/query');
const userRoutes = require('./routes/user');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',
    process.env.FRONTEND_URL,
    /\.onrender\.com$/,
    /\.vercel\.app$/
  ].filter(Boolean),
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/curalink', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/user', userRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Curalink API' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Curalink server running on port ${PORT}`));

module.exports = app;