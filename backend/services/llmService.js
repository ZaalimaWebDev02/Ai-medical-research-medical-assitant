/**
 * llmService.js
 * LLM reasoning engine using Ollama (Mistral)
 * Minimal prompt to avoid OOM 500 errors
 * Hard 90s timeout with automatic fallback
 */

const axios = require('axios');

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_MODEL || 'mistral';

async function checkOllamaHealth() {
  try {
    const response = await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    const models = response.data?.models || [];
    return { available: true, models: models.map(m => m.name) };
  } catch {
    return { available: false, models: [] };
  }
}

// Minimal context — 2 papers, 2 trials, very short excerpts to avoid Mistral OOM
function buildRAGContext(rankedPapers, rankedTrials, queryInfo, conversationHistory = []) {
  const papersContext = rankedPapers.slice(0, 2).map((paper, idx) => `
[PAPER ${idx + 1}]
Title: ${paper.title}
Year: ${paper.year}
Abstract: ${(paper.abstract || '').slice(0, 150)}
URL: ${paper.url}
`).join('\n---\n');

  const trialsContext = rankedTrials.slice(0, 2).map((trial, idx) => `
[TRIAL ${idx + 1}]
Title: ${trial.title}
Status: ${trial.status}
URL: ${trial.url}
`).join('\n---\n');

  const historyContext = conversationHistory.slice(-2).map(msg =>
    `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content.slice(0, 100)}`
  ).join('\n');

  return { papersContext, trialsContext, historyContext };
}

// Minimal system prompt
function buildSystemPrompt() {
  return `You are a medical research assistant. Summarize the provided papers and trials concisely. Use these exact headers:
## 🔬 Condition Overview
## 📊 Research Insights
## 🏥 Clinical Trials
## 💡 Personalized Insight
## 📚 Key Sources
Only use provided context. Never hallucinate.`;
}

function buildUserPrompt(query, papersContext, trialsContext, historyContext, queryInfo) {
  return `HISTORY: ${historyContext || 'New conversation.'}

QUERY: "${query}"

=== PAPERS ===
${papersContext || 'No papers found.'}

=== TRIALS ===
${trialsContext || 'No trials found.'}

Write a concise analysis using the required section headers. Cite papers by title and year.`;
}

/**
 * Generate LLM response with hard 90s timeout + automatic fallback
 */
async function generateResponse(query, rankedPapers, rankedTrials, queryInfo, conversationHistory = []) {
  const health = await checkOllamaHealth();

  if (!health.available) {
    console.log('⚠️  Ollama unavailable — using fallback');
    return generateFallbackResponse(query, rankedPapers, rankedTrials, queryInfo);
  }

  const { papersContext, trialsContext, historyContext } = buildRAGContext(
    rankedPapers, rankedTrials, queryInfo, conversationHistory
  );

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, papersContext, trialsContext, historyContext, queryInfo);

  try {
    console.log(`🤖 Generating LLM response with ${MODEL}...`);

    const llmCall = axios.post(`${OLLAMA_BASE}/api/chat`, {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      options: {
        temperature: 0.3,
        top_p: 0.9,
        num_predict: 400
      },
      stream: false
    }, { timeout: 300000 });

    const hardTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Hard timeout — using fallback')), 90000)
    );

    const response = await Promise.race([llmCall, hardTimeout]);
    const content = response.data?.message?.content || '';

    if (!content) throw new Error('Empty LLM response');

    console.log(`✅ LLM response generated (${content.length} chars)`);
    return { content, model: MODEL, source: 'ollama' };

  } catch (error) {
    console.error('LLM error:', error.message);
    console.log('⚡ Switching to fallback response with real retrieved data...');
    return generateFallbackResponse(query, rankedPapers, rankedTrials, queryInfo);
  }
}

/**
 * Streaming LLM response with hard 90s timeout
 */
async function generateStreamingResponse(query, rankedPapers, rankedTrials, queryInfo, conversationHistory = [], onChunk) {
  const health = await checkOllamaHealth();

  if (!health.available) {
    const fallback = generateFallbackResponse(query, rankedPapers, rankedTrials, queryInfo);
    onChunk(fallback.content, true);
    return;
  }

  const { papersContext, trialsContext, historyContext } = buildRAGContext(
    rankedPapers, rankedTrials, queryInfo, conversationHistory
  );

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, papersContext, trialsContext, historyContext, queryInfo);

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    console.error('Streaming LLM hard timeout — using fallback');
    const fallback = generateFallbackResponse(query, rankedPapers, rankedTrials, queryInfo);
    onChunk(fallback.content, true);
  }, 90000);

  try {
    const response = await axios.post(`${OLLAMA_BASE}/api/chat`, {
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      options: { temperature: 0.3, top_p: 0.9, num_predict: 400 },
      stream: true
    }, {
      responseType: 'stream',
      timeout: 300000
    });

    response.data.on('data', (chunk) => {
      if (timedOut) return;
      try {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          const data = JSON.parse(line);
          const token = data?.message?.content || '';
          if (token) onChunk(token, data.done || false);
        }
      } catch {}
    });

    response.data.on('end', () => {
      if (timedOut) return;
      clearTimeout(timeoutHandle);
      onChunk('', true);
    });

  } catch (error) {
    clearTimeout(timeoutHandle);
    if (!timedOut) {
      console.error('Streaming LLM error:', error.message);
      const fallback = generateFallbackResponse(query, rankedPapers, rankedTrials, queryInfo);
      onChunk(fallback.content, true);
    }
  }
}

/**
 * Fallback: rich structured response using all real retrieved data
 * Shown when Ollama times out or errors
 */
function generateFallbackResponse(query, rankedPapers, rankedTrials, queryInfo) {
  const topPapers = rankedPapers.slice(0, 5);
  const topTrials = rankedTrials.slice(0, 3);

  const papersSection = topPapers.length > 0
    ? topPapers.map(p =>
        `- **${p.title}** (${p.year}, ${p.source}) — Relevance: ${p.relevanceScore}%\n  ${(p.abstract || '').slice(0, 200)}...`
      ).join('\n\n')
    : 'No research papers found for this query.';

  const trialsSection = topTrials.length > 0
    ? topTrials.map(t =>
        `- **${t.title}**\n  Status: ${t.statusDisplay || t.status}\n  ${(t.summary || '').slice(0, 200)}...\n  [View Trial](${t.url})`
      ).join('\n\n')
    : 'No active clinical trials found.';

  const sourcesSection = [...topPapers.slice(0, 5), ...topTrials.slice(0, 3)]
    .map(item => `- [${item.title.slice(0, 80)}](${item.url}) (${item.source})`)
    .join('\n');

  const content = `## 🔬 Condition Overview

Based on **${rankedPapers.length} research papers** and **${rankedTrials.length} clinical trials** retrieved for **"${queryInfo.displayQuery}"**.

---

## 📊 Research Insights

Found **${rankedPapers.length} peer-reviewed papers** (top ${topPapers.length} shown by relevance):

${papersSection}

---

## 🏥 Clinical Trials

Found **${rankedTrials.length} clinical trials** (top ${topTrials.length} shown):

${trialsSection}

---

## 💡 Personalized Insight

- **${topPapers.length}** high-relevance papers from PubMed and OpenAlex
- **${topTrials.length}** clinical trials from ClinicalTrials.gov
- Results ranked using hybrid TF-IDF + semantic + recency scoring

⚠️ **Always consult a qualified healthcare professional** before making any medical decisions.

---

## 📚 Key Sources

${sourcesSection}`;

  return { content, model: 'fallback', source: 'template' };
}

module.exports = { generateResponse, generateStreamingResponse, checkOllamaHealth };