const express = require('express');
const router = express.Router();
const { User } = require('../models/index');

router.post('/session', async (req, res) => {
  const { sessionId, name } = req.body;
  try {
    let user = await User.findOne({ sessionId });
    if (!user) {
      user = await User.create({ sessionId, name });
    } else {
      user.lastActive = new Date();
      if (name) user.name = name;
      await user.save();
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;