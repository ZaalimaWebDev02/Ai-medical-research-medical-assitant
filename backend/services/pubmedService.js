/**
 * pubmedService.js - Fixed: uses xml2js for proper XML parsing
 */

const axios = require('axios');

const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const API_KEY = process.env.NCBI_API_KEY || '';
const DELAY_MS = API_KEY ? 110 : 350;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  if (!text) return '';
  return String(text).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function extractText(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object') {
    if (field._) return field._;
    if (field['#text']) return field['#text'];
    if (Array.isArray(field)) return field.map(extractText).join(' ');
  }
  return String(field);
}

/**
 * Step 1: Get PubMed IDs via esearch
 */
async function searchPubMed(searchQuery, maxResults = 100) {
  try {
    const params = {
      db: 'pubmed',
      term: searchQuery,
      retmax: maxResults,
      retmode: 'json',
      sort: 'relevance'
    };
    if (API_KEY) params.api_key = API_KEY;

    const response = await axios.get(`${PUBMED_BASE}/esearch.fcgi`, {
      params,
      timeout: 15000
    });

    const data = response.data.esearchresult;
    const ids = data.idlist || [];
    console.log(`📚 PubMed found ${data.count} total, fetching top ${ids.length}`);
    return ids;
  } catch (error) {
    console.error('PubMed search error:', error.message);
    return [];
  }
}

/**
 * Step 2: Fetch article details via efetch (XML) and parse manually
 */
async function fetchBatch(ids) {
  try {
    const params = {
      db: 'pubmed',
      id: ids.join(','),
      retmode: 'xml',
      rettype: 'abstract'
    };
    if (API_KEY) params.api_key = API_KEY;

    const response = await axios.get(`${PUBMED_BASE}/efetch.fcgi`, {
      params,
      timeout: 25000,
      responseType: 'text'
    });

    // Parse with xml2js
    let parsed;
    try {
      const xml2js = require('xml2js');
      parsed = await xml2js.parseStringPromise(response.data, {
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true
      });
    } catch (xmlErr) {
      console.error('XML parse error:', xmlErr.message);
      return [];
    }

    const articleSet = parsed?.PubmedArticleSet?.PubmedArticle;
    if (!articleSet) {
      console.error('No PubmedArticle found in response');
      return [];
    }

    const articles = Array.isArray(articleSet) ? articleSet : [articleSet];
    const results = [];

    for (const article of articles) {
      try {
        const medline = article?.MedlineCitation;
        const art = medline?.Article;
        if (!art) continue;

        // Title
        const title = cleanText(extractText(art?.ArticleTitle));
        if (!title || title.length < 5) continue;

        // Abstract
        let abstract = '';
        const abstractRaw = art?.Abstract?.AbstractText;
        if (!abstractRaw) continue;

        if (typeof abstractRaw === 'string') {
          abstract = abstractRaw;
        } else if (Array.isArray(abstractRaw)) {
          abstract = abstractRaw.map(t =>
            typeof t === 'string' ? t : extractText(t)
          ).join(' ');
        } else if (typeof abstractRaw === 'object') {
          abstract = extractText(abstractRaw);
        }

        abstract = cleanText(abstract);
        if (!abstract || abstract.length < 30) continue;

        // Authors
        const authorList = art?.AuthorList?.Author;
        const authorArr = !authorList ? [] :
          Array.isArray(authorList) ? authorList : [authorList];
        const authors = authorArr.slice(0, 5).map(a => {
          const fore = typeof a?.ForeName === 'string' ? a.ForeName : '';
          const last = typeof a?.LastName === 'string' ? a.LastName : '';
          return [fore, last].filter(Boolean).join(' ');
        }).filter(Boolean);

        // Year
        const pubDate = art?.Journal?.JournalIssue?.PubDate;
        const year = parseInt(pubDate?.Year) ||
          parseInt(String(pubDate?.MedlineDate || '').slice(0, 4)) || 0;

        // Journal
        const journal = typeof art?.Journal?.Title === 'string'
          ? art.Journal.Title : '';

        // PMID
        const pmidRaw = medline?.PMID;
        const pmid = typeof pmidRaw === 'object'
          ? (pmidRaw?._ || pmidRaw?.['#text'] || '')
          : (pmidRaw || '');

        // MeSH
        const meshList = medline?.MeshHeadingList?.MeshHeading;
        const meshArr = !meshList ? [] :
          Array.isArray(meshList) ? meshList : [meshList];
        const meshTerms = meshArr.slice(0, 8).map(m =>
          extractText(m?.DescriptorName)
        ).filter(Boolean);

        results.push({
          id: `pubmed_${pmid}`,
          pmid,
          title,
          abstract: abstract.slice(0, 1500),
          authors,
          year,
          journal,
          meshTerms,
          citationCount: 0,
          source: 'PubMed',
          url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : '',
          type: 'paper'
        });
      } catch {
        // skip malformed article
      }
    }

    return results;
  } catch (error) {
    console.error('PubMed fetch batch error:', error.message);
    return [];
  }
}

/**
 * Main export: search + fetch
 */
async function getPubMedResults(searchQuery, maxResults = 100) {
  console.log(`🔍 PubMed searching: ${searchQuery.slice(0, 80)}...`);

  const ids = await searchPubMed(searchQuery, maxResults);
  if (ids.length === 0) return [];

  const batchSize = 25;
  const results = [];

  for (let i = 0; i < Math.min(ids.length, 80); i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    await sleep(DELAY_MS);
    const articles = await fetchBatch(batch);
    results.push(...articles);
    console.log(`📖 PubMed batch ${Math.floor(i / batchSize) + 1}: ${articles.length} articles`);
  }

  console.log(`✅ PubMed returned ${results.length} articles`);
  return results;
}

module.exports = { getPubMedResults };