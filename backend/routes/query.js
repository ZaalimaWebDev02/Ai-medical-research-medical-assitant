const express = require('express');
const router = express.Router();

router.get('/analytics', async (req, res) => {
  try {
    const { Query } = require('../models/index');
    const stats = await Query.aggregate([
      {
        $group: {
          _id: null,
          totalQueries: { $sum: 1 },
          avgPubmed: { $avg: '$resultsCount.pubmed' },
          avgOpenAlex: { $avg: '$resultsCount.openAlex' },
          avgTrials: { $avg: '$resultsCount.clinicalTrials' },
          avgProcessingTime: { $avg: '$processingTimeMs' }
        }
      }
    ]);
    res.json(stats[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;