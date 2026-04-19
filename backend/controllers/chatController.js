/**
 * chatController.js
 * Main orchestration controller
 * Pipeline: Query → Expand → Retrieve (parallel) → Rank → LLM → Store
 */

const { expandQuery, expandWithContext } = require('../services/queryExpander');
const { getPubMedResults } = require('../services/pubmedService');
const { getOpenAlexResults } = require('../services/openalexService');
const { getClinicalTrials } = require('../services/clinicalTrialsService');
const { rankAndSeparate } = require('../services/rankingEngine');
const { generateResponse, generateStreamingResponse, checkOllamaHealth } = require('../services/llmService');
const { Chat, Query } = require('../models/index');
const { v4: uuidv4 } = require('uuid');

/**
 * Main query handler - full pipeline
 */
async function handleQuery(req, res) {
  const startTime = Date.now();
  
  const {
    query,
    disease,
    patientName,
    location,
    sessionId: inputSessionId,
    stream = false
  } = req.body;
  
  if (!query && !disease) {
    return res.status(400).json({ error: 'Query or disease is required' });
  }
  
  const sessionId = inputSessionId || uuidv4();
  
  try {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 1: Load conversation context
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let chat = await Chat.findOne({ sessionId });
    
    if (!chat) {
      chat = new Chat({
        sessionId,
        messages: [],
        context: { disease, patientName, location }
      });
    }
    
    const previousContext = chat.context;
    const conversationHistory = chat.messages.slice(-6); // Last 3 exchanges
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 2: Intelligent query expansion
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    let queryInfo;
    
    if (disease || !previousContext?.disease) {
      // New query with explicit disease
      queryInfo = expandQuery({ query, disease, patientName, location });
    } else {
      // Follow-up query - use context
      queryInfo = expandWithContext(query, {
        ...previousContext,
        patientName,
        location
      });
    }
    
    console.log(`\n🧠 Query expanded: ${queryInfo.displayQuery}`);
    console.log(`📝 PubMed search: ${queryInfo.pubmedString.slice(0, 100)}...`);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 3: Parallel data retrieval
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('🔄 Starting parallel retrieval...');
    
    const [pubmedResults, openAlexResults, clinicalTrialResults] = await Promise.allSettled([
      getPubMedResults(queryInfo.pubmedString, 100),
      getOpenAlexResults(queryInfo.openAlexString, 80),
      getClinicalTrials({
        condition: queryInfo.clinicalTrialsCondition,
        intervention: queryInfo.clinicalTrialsIntervention,
        location: queryInfo.location,
        maxResults: 50
      })
    ]);
    
    const pubmedData = pubmedResults.status === 'fulfilled' ? pubmedResults.value : [];
    const openAlexData = openAlexResults.status === 'fulfilled' ? openAlexResults.value : [];
    const trialsData = clinicalTrialResults.status === 'fulfilled' ? clinicalTrialResults.value : [];
    
    const allResults = [...pubmedData, ...openAlexData, ...trialsData];
    
    console.log(`📊 Retrieved: ${pubmedData.length} PubMed | ${openAlexData.length} OpenAlex | ${trialsData.length} Trials`);
    console.log(`📊 Total: ${allResults.length} results before ranking`);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 4: Hybrid ranking
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const { papers: rankedPapers, trials: rankedTrials, totalRetrieved } = rankAndSeparate(
      allResults,
      queryInfo
    );
    
    console.log(`🏆 Top ranked: ${rankedPapers.length} papers | ${rankedTrials.length} trials`);
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 5: LLM reasoning with RAG
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // Add user message to history
    chat.messages.push({
      role: 'user',
      content: query,
      timestamp: new Date()
    });
    
    let llmResult;
    
    if (stream && req.headers.accept === 'text/event-stream') {
      // Streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Send metadata first
      res.write(`data: ${JSON.stringify({
        type: 'metadata',
        sessionId,
        queryInfo,
        stats: {
          pubmed: pubmedData.length,
          openAlex: openAlexData.length,
          clinicalTrials: trialsData.length,
          total: totalRetrieved,
          topPapers: rankedPapers.length,
          topTrials: rankedTrials.length
        },
        papers: rankedPapers.slice(0, 10),
        trials: rankedTrials.slice(0, 6)
      })}\n\n`);
      
      let fullContent = '';
      
      await generateStreamingResponse(
        query,
        rankedPapers,
        rankedTrials,
        queryInfo,
        conversationHistory,
        (token, done) => {
          if (token) {
            fullContent += token;
            res.write(`data: ${JSON.stringify({ type: 'token', content: token, done })}\n\n`);
          }
          if (done) {
            res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
            res.end();
          }
        }
      );
      
      llmResult = { content: fullContent };
      
    } else {
      // Non-streaming response
      llmResult = await generateResponse(
        query,
        rankedPapers,
        rankedTrials,
        queryInfo,
        conversationHistory
      );
    }
    
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // STEP 6: Store results in MongoDB
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const processingTime = Date.now() - startTime;
    
    // Add assistant response to chat history
    chat.messages.push({
      role: 'assistant',
      content: llmResult.content,
      timestamp: new Date(),
      metadata: {
        papers: rankedPapers.slice(0, 10).map(p => ({ title: p.title, url: p.url, source: p.source, year: p.year })),
        trials: rankedTrials.slice(0, 6).map(t => ({ title: t.title, status: t.status, url: t.url })),
        queryExpanded: queryInfo.displayQuery
      }
    });
    
    // Update context
    chat.context = {
      disease: disease || queryInfo.primaryQuery || previousContext?.disease,
      lastQuery: query,
      patientName: patientName || previousContext?.patientName,
      location: location || previousContext?.location
    };
    
    await chat.save();
    
    // Log query metrics
    await Query.create({
      sessionId,
      originalQuery: query,
      expandedQuery: queryInfo.displayQuery,
      disease: disease || queryInfo.primaryQuery,
      resultsCount: {
        pubmed: pubmedData.length,
        openAlex: openAlexData.length,
        clinicalTrials: trialsData.length
      },
      topRankedPapers: rankedPapers.length,
      processingTimeMs: processingTime
    });
    
    // Return response (for non-streaming)
    if (!stream) {
      return res.json({
        success: true,
        sessionId,
        query,
        queryInfo,
        response: llmResult.content,
        model: llmResult.model,
        papers: rankedPapers.slice(0, 10),
        trials: rankedTrials.slice(0, 6),
        stats: {
          pubmed: pubmedData.length,
          openAlex: openAlexData.length,
          clinicalTrials: trialsData.length,
          total: totalRetrieved,
          topPapers: rankedPapers.length,
          topTrials: rankedTrials.length,
          processingTimeMs: processingTime
        }
      });
    }
    
  } catch (error) {
    console.error('Pipeline error:', error);
    
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Research pipeline failed',
        message: error.message,
        sessionId
      });
    }
  }
}

/**
 * Get chat history for a session
 */
async function getChatHistory(req, res) {
  const { sessionId } = req.params;
  
  try {
    const chat = await Chat.findOne({ sessionId });
    
    if (!chat) {
      return res.json({ sessionId, messages: [], context: {} });
    }
    
    return res.json({
      sessionId,
      messages: chat.messages,
      context: chat.context
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

/**
 * Check system status
 */
async function getStatus(req, res) {
  const ollamaHealth = await checkOllamaHealth();
  
  return res.json({
    status: 'operational',
    ollama: ollamaHealth,
    apis: {
      pubmed: 'available',
      openAlex: 'available',
      clinicalTrials: 'available'
    },
    model: process.env.OLLAMA_MODEL || 'mistral'
  });
}

module.exports = { handleQuery, getChatHistory, getStatus };