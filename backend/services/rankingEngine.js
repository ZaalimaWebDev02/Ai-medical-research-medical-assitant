/**
 * rankingEngine.js
 * Hybrid ranking pipeline combining:
 * 1. TF-IDF keyword relevance scoring
 * 2. Semantic similarity (cosine similarity over word vectors)
 * 3. Recency boost (newer papers score higher)
 * 4. Source credibility weighting
 * 5. Citation impact score
 */

/**
 * Calculate TF-IDF based relevance score
 */
function calculateTFIDF(text, queryTerms) {
  if (!text || !queryTerms || queryTerms.length === 0) return 0;
  
  const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 2);
  const totalWords = words.length;
  if (totalWords === 0) return 0;
  
  // Word frequency map
  const wordFreq = {};
  words.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });
  
  let score = 0;
  
  for (const term of queryTerms) {
    const termLower = term.toLowerCase();
    const termWords = termLower.split(/\W+/).filter(w => w.length > 1);
    
    for (const tw of termWords) {
      const tf = (wordFreq[tw] || 0) / totalWords;
      // IDF approximation (medical terms are rare = higher IDF)
      const idf = Math.log(1 + 1 / (tf + 0.01));
      score += tf * idf;
      
      // Bonus for exact phrase match
      if (text.toLowerCase().includes(termLower)) {
        score += 0.3;
      }
      
      // Bonus for title match (higher weight)
      score += tf * 2;
    }
  }
  
  return Math.min(score, 1.0);
}

/**
 * Simple word vector similarity (bag of words cosine similarity)
 */
function cosineSimilarity(text1, text2) {
  if (!text1 || !text2) return 0;
  
  const tokenize = t => t.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  
  const words1 = tokenize(text1);
  const words2 = tokenize(text2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const vocab = new Set([...words1, ...words2]);
  
  const vec1 = {};
  const vec2 = {};
  
  vocab.forEach(w => {
    vec1[w] = words1.filter(x => x === w).length;
    vec2[w] = words2.filter(x => x === w).length;
  });
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  vocab.forEach(w => {
    dotProduct += vec1[w] * vec2[w];
    mag1 += vec1[w] ** 2;
    mag2 += vec2[w] ** 2;
  });
  
  const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Calculate recency score (boost for recent papers)
 */
function calculateRecencyScore(year) {
  if (!year || year === 0) return 0.1;
  
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  
  if (age <= 1) return 1.0;
  if (age <= 2) return 0.90;
  if (age <= 3) return 0.80;
  if (age <= 5) return 0.65;
  if (age <= 8) return 0.45;
  if (age <= 10) return 0.30;
  if (age <= 15) return 0.15;
  return 0.05;
}

/**
 * Source credibility weights
 */
const SOURCE_CREDIBILITY = {
  'PubMed': 0.90,
  'OpenAlex': 0.80,
  'ClinicalTrials.gov': 0.95
};

/**
 * High-impact journal bonus
 */
const HIGH_IMPACT_JOURNALS = [
  'nature', 'science', 'cell', 'lancet', 'nejm', 'new england journal',
  'jama', 'bmj', 'annals', 'plos', 'brain', 'neurology', 'circulation',
  'cancer research', 'journal of clinical oncology', 'blood', 'gut',
  'diabetes care', 'chest', 'radiology', 'pediatrics'
];

function getJournalBonus(journal) {
  if (!journal) return 0;
  const jLower = journal.toLowerCase();
  return HIGH_IMPACT_JOURNALS.some(hj => jLower.includes(hj)) ? 0.20 : 0;
}

/**
 * Normalize citation count to 0-1 range
 */
function normalizeCitations(citationCount, maxCitations) {
  if (!citationCount || maxCitations === 0) return 0;
  return Math.min(citationCount / maxCitations, 1.0);
}

/**
 * Main ranking function
 * @param {Array} items - Papers and trials to rank
 * @param {Object} queryInfo - { primaryQuery, expandedTerms, displayQuery }
 * @param {number} topN - Return top N results
 * @returns {Array} - Ranked items with scores
 */
function rankResults(items, queryInfo, topN = 20) {
  if (!items || items.length === 0) return [];
  
  const { primaryQuery, expandedTerms = [], displayQuery = '' } = queryInfo;
  const allQueryTerms = [primaryQuery, displayQuery, ...expandedTerms].filter(Boolean);
  
  // Find max citations for normalization
  const maxCitations = Math.max(...items.map(i => i.citationCount || 0), 1);
  
  // Score each item
  const scoredItems = items.map(item => {
    const fullText = [item.title, item.abstract || item.summary, (item.meshTerms || []).join(' '), (item.concepts || []).join(' ')].join(' ');
    
    // 1. TF-IDF relevance (title weighted 3x, abstract 1x)
    const titleScore = calculateTFIDF(item.title, allQueryTerms) * 3;
    const abstractScore = calculateTFIDF(item.abstract || item.summary || '', allQueryTerms);
    const tfidfScore = Math.min((titleScore + abstractScore) / 4, 1.0);
    
    // 2. Semantic similarity
    const semanticScore = cosineSimilarity(fullText, allQueryTerms.join(' '));
    
    // 3. Recency
    const recencyScore = calculateRecencyScore(item.year || item.publication_year);
    
    // 4. Source credibility
    const credibilityScore = SOURCE_CREDIBILITY[item.source] || 0.70;
    
    // 5. Citation impact (only for papers)
    const citationScore = normalizeCitations(item.citationCount, maxCitations);
    
    // 6. Journal bonus
    const journalBonus = getJournalBonus(item.journal);
    
    // 7. Open access bonus (more accessible)
    const oaBonus = item.isOpenAccess ? 0.05 : 0;
    
    // 8. Clinical trial status bonus (recruiting = most relevant)
    let trialBonus = 0;
    if (item.type === 'trial') {
      if (item.status === 'RECRUITING') trialBonus = 0.20;
      else if (item.status === 'NOT_YET_RECRUITING') trialBonus = 0.10;
    }
    
    // Weighted final score
    // Weights: TF-IDF 35%, Semantic 20%, Recency 20%, Credibility 10%, Citations 10%, Bonuses 5%
    const finalScore = (
      tfidfScore * 0.35 +
      semanticScore * 0.20 +
      recencyScore * 0.20 +
      credibilityScore * 0.10 +
      citationScore * 0.10 +
      journalBonus +
      oaBonus +
      trialBonus
    );
    
    return {
      ...item,
      scores: {
        tfidf: Math.round(tfidfScore * 100) / 100,
        semantic: Math.round(semanticScore * 100) / 100,
        recency: Math.round(recencyScore * 100) / 100,
        credibility: Math.round(credibilityScore * 100) / 100,
        citations: Math.round(citationScore * 100) / 100,
        final: Math.round(finalScore * 100) / 100
      },
      relevanceScore: Math.round(finalScore * 100)
    };
  });
  
  // Sort by final score descending
  scoredItems.sort((a, b) => b.scores.final - a.scores.final);
  
  // Remove duplicates (same title from different sources)
  const seen = new Set();
  const deduplicated = [];
  
  for (const item of scoredItems) {
    const titleKey = item.title.toLowerCase().slice(0, 50);
    if (!seen.has(titleKey)) {
      seen.add(titleKey);
      deduplicated.push(item);
    }
  }
  
  return deduplicated.slice(0, topN);
}

/**
 * Separate papers and trials, rank each group
 */
function rankAndSeparate(allResults, queryInfo) {
  const papers = allResults.filter(r => r.type === 'paper');
  const trials = allResults.filter(r => r.type === 'trial');
  
  const rankedPapers = rankResults(papers, queryInfo, 15);
  const rankedTrials = rankResults(trials, queryInfo, 10);
  
  return {
    papers: rankedPapers,
    trials: rankedTrials,
    totalRetrieved: allResults.length,
    totalPapers: papers.length,
    totalTrials: trials.length
  };
}

module.exports = { rankResults, rankAndSeparate, calculateTFIDF, cosineSimilarity };