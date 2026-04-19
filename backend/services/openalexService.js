/**
 * openalexService.js
 * Retrieves research papers from OpenAlex API (free, no API key needed)
 * Supports pagination for deep retrieval (up to 100 results)
 */

const axios = require('axios');

const OPENALEX_BASE = 'https://api.openalex.org';
const EMAIL = process.env.CONTACT_EMAIL || 'curalink@example.com'; // Polite pool

/**
 * Search OpenAlex for papers
 */
async function getOpenAlexResults(searchQuery, maxResults = 80) {
  console.log(`🔍 OpenAlex searching: ${searchQuery}`);
  
  try {
    const perPage = 25;
    const pages = Math.ceil(Math.min(maxResults, 100) / perPage);
    const results = [];
    
    for (let page = 1; page <= pages; page++) {
      const response = await axios.get(`${OPENALEX_BASE}/works`, {
        params: {
          search: searchQuery,
          'per-page': perPage,
          page,
          filter: 'type:article,has_abstract:true',
          sort: 'relevance_score:desc',
          select: 'id,title,abstract_inverted_index,authorships,publication_year,primary_location,cited_by_count,concepts,doi,open_access',
          mailto: EMAIL
        },
        timeout: 15000
      });
      
      const works = response.data?.results || [];
      
      for (const work of works) {
        const parsed = parseOpenAlexWork(work);
        if (parsed) results.push(parsed);
      }
      
      // Stop if we got fewer results than requested (no more pages)
      if (works.length < perPage) break;
    }
    
    console.log(`✅ OpenAlex returned ${results.length} papers`);
    return results;
  } catch (error) {
    console.error('OpenAlex error:', error.message);
    return [];
  }
}

/**
 * Reconstruct abstract from inverted index
 * OpenAlex stores abstracts as inverted index: { word: [positions] }
 */
function reconstructAbstract(invertedIndex) {
  if (!invertedIndex) return '';
  
  try {
    const wordPositions = [];
    
    for (const [word, positions] of Object.entries(invertedIndex)) {
      for (const pos of positions) {
        wordPositions.push({ word, pos });
      }
    }
    
    wordPositions.sort((a, b) => a.pos - b.pos);
    
    return wordPositions.map(wp => wp.word).join(' ');
  } catch {
    return '';
  }
}

/**
 * Parse a single OpenAlex work
 */
function parseOpenAlexWork(work) {
  try {
    const title = work.title;
    if (!title) return null;
    
    const abstract = reconstructAbstract(work.abstract_inverted_index);
    if (!abstract || abstract.length < 50) return null;
    
    // Extract authors (first 5)
    const authors = (work.authorships || [])
      .slice(0, 5)
      .map(a => a?.author?.display_name)
      .filter(Boolean);
    
    // Extract concepts/keywords for ranking
    const concepts = (work.concepts || [])
      .slice(0, 8)
      .map(c => c.display_name)
      .filter(Boolean);
    
    // Get journal/source
    const source = work.primary_location?.source?.display_name || '';
    
    // Get URL
    const doi = work.doi;
    const url = doi || work.id || '';
    const cleanUrl = doi ? `https://doi.org/${doi.replace('https://doi.org/', '')}` : url;
    
    const openAlexId = work.id?.replace('https://openalex.org/', '') || '';
    
    return {
      id: `openalex_${openAlexId}`,
      openAlexId,
      title: title.trim(),
      abstract: abstract.slice(0, 1500),
      authors,
      year: work.publication_year || 0,
      journal: source,
      concepts,
      citationCount: work.cited_by_count || 0,
      isOpenAccess: work.open_access?.is_oa || false,
      source: 'OpenAlex',
      url: cleanUrl,
      type: 'paper'
    };
  } catch {
    return null;
  }
}

/**
 * Get related works for a specific paper (for deeper context)
 */
async function getRelatedWorks(openAlexId, limit = 10) {
  try {
    const response = await axios.get(`${OPENALEX_BASE}/works/${openAlexId}/related_works`, {
      params: { 'per-page': limit, mailto: EMAIL },
      timeout: 10000
    });
    
    return (response.data?.results || [])
      .map(parseOpenAlexWork)
      .filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = { getOpenAlexResults, getRelatedWorks };