// routes/chat.js
const express = require('express');
const router = express.Router();
const { handleQuery, getChatHistory, getStatus } = require('../controllers/chatController');

router.post('/query', handleQuery);
router.get('/history/:sessionId', getChatHistory);
router.get('/status', getStatus);

module.exports = router;