import React, { useState, useRef, useEffect } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'https://curalink-api-a2b8.onrender.com';

const EXAMPLE_QUERIES = [
  { icon: '🧠', text: 'Latest DBS treatments for Parkinson\'s disease', disease: 'Parkinson\'s disease', query: 'Deep Brain Stimulation' },
  { icon: '🫁', text: 'Immunotherapy clinical trials for lung cancer', disease: 'lung cancer', query: 'immunotherapy checkpoint inhibitors' },
  { icon: '💉', text: 'CRISPR gene therapy for sickle cell disease', disease: 'sickle cell disease', query: 'CRISPR gene editing' },
  { icon: '🫀', text: 'Stem cell therapy for heart failure', disease: 'heart failure', query: 'stem cell therapy' }
];

const LOADING_STAGES = [
  { icon: '🔍', label: 'Expanding query with medical synonyms...' },
  { icon: '📚', label: 'Searching PubMed (up to 100 papers)...' },
  { icon: '🔬', label: 'Querying OpenAlex research database...' },
  { icon: '🏥', label: 'Fetching ClinicalTrials.gov data...' },
  { icon: '⚡', label: 'Running hybrid ranking algorithm...' },
  { icon: '🤖', label: 'Generating AI analysis with RAG...' }
];

function parseMarkdown(text) {
  return text
    .replace(/## (.*?)$/gm, '<h2>$1</h2>')
    .replace(/### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1 ↗</a>')
    .replace(/^- (.*?)$/gm, '<li>$1</li>')
    .replace(/(<li>.*?<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^(\d+)\. (.*?)$/gm, '<li>$2</li>')
    .replace(/---/g, '<hr/>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
}

function Message({ message }) {
  if (message.role === 'user') {
    return (
      <div className="message user">
        <div className="message-avatar">👤</div>
        <div className="message-content">
          <div className="message-bubble">{message.content}</div>
          <div className="user-query-pills">
            {message.disease && <span className="query-pill">🦠 {message.disease}</span>}
            {message.patientName && <span className="query-pill">👤 {message.patientName}</span>}
          </div>
          <div className="message-meta">
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message assistant">
      <div className="message-avatar">🔬</div>
      <div className="message-content">
        <div className="message-bubble">
          {message.isError ? (
            <p style={{ color: 'var(--accent-red)' }}>{message.content}</p>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: parseMarkdown(message.content) }} />
          )}

          {message.stats && (
            <div style={{
              marginTop: 16,
              padding: '10px 14px',
              background: 'rgba(0, 212, 255, 0.05)',
              border: '1px solid rgba(0, 212, 255, 0.1)',
              borderRadius: 8,
              display: 'flex',
              gap: 20,
              flexWrap: 'wrap',
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)'
            }}>
              <span>📚 PubMed: <strong style={{color:'var(--accent-cyan)'}}>{message.stats.pubmed}</strong></span>
              <span>🔬 OpenAlex: <strong style={{color:'var(--accent-cyan)'}}>{message.stats.openAlex}</strong></span>
              <span>🏥 Trials: <strong style={{color:'var(--accent-cyan)'}}>{message.stats.clinicalTrials}</strong></span>
              <span>⚡ Ranked: <strong style={{color:'var(--accent-cyan)'}}>{message.stats.topPapers}P + {message.stats.topTrials}T</strong></span>
              <span>⏱ {message.stats.processingTimeMs}ms</span>
            </div>
          )}
        </div>
        <div className="message-meta">
          {new Date(message.timestamp).toLocaleTimeString()}
          {message.queryInfo && ` • Query: ${message.queryInfo.displayQuery}`}
        </div>
      </div>
    </div>
  );
}

function LoadingMessage({ stage }) {
  return (
    <div className="loading-message">
      <div className="message-avatar" style={{
        background: 'linear-gradient(135deg, #00d4ff, #1e90ff)',
        boxShadow: '0 0 15px rgba(0, 212, 255, 0.3)'
      }}>🔬</div>
      <div className="loading-bubble">
        <div className="loading-stages">
          {LOADING_STAGES.map((s, idx) => (
            <div
              key={idx}
              className={`loading-stage ${idx === stage ? 'active' : idx < stage ? 'done' : ''}`}
            >
              <span className="stage-icon">
                {idx < stage ? '✅' : idx === stage ? '⏳' : s.icon}
              </span>
              <span>{s.label}</span>
              {idx === stage && <div className="stage-spinner" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen({ onExampleClick }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-icon">🧬</div>
      <h1 className="welcome-title">
        Welcome to <span>Curalink</span>
      </h1>
      <p className="welcome-subtitle">
        AI-powered medical research assistant. Search PubMed, OpenAlex, and ClinicalTrials.gov
        simultaneously with intelligent ranking and LLM-powered analysis.
      </p>
      <div className="example-queries">
        {EXAMPLE_QUERIES.map((eq, idx) => (
          <button
            key={idx}
            className="example-query"
            onClick={() => onExampleClick(eq)}
          >
            <span className="example-query-icon">{eq.icon}</span>
            <span className="example-query-text">{eq.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatInterface({ messages, isLoading, onSendQuery, context, onClearChat, systemStatus }) {
  const [query, setQuery] = useState('');
  const [disease, setDisease] = useState('');
  const [patientName, setPatientName] = useState('');
  const [location, setLocation] = useState('');
  const [inputMode, setInputMode] = useState('natural');
  const [loadingStage, setLoadingStage] = useState(0);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isLoading) { setLoadingStage(0); return; }
    const interval = setInterval(() => {
      setLoadingStage(prev => prev < LOADING_STAGES.length - 1 ? prev + 1 : prev);
    }, 2500);
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleSubmit = () => {
    const q = query.trim();
    if (!q && !disease.trim()) return;
    onSendQuery({
      query: q || disease,
      disease: inputMode === 'structured' ? disease : '',
      patientName: inputMode === 'structured' ? patientName : '',
      location: inputMode === 'structured' ? location : ''
    });
    setQuery('');
    if (inputMode === 'structured') {
      setDisease('');
      setPatientName('');
      setLocation('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExampleClick = (example) => {
    setInputMode('structured');
    setQuery(example.query);
    setDisease(example.disease);
    setTimeout(() => handleSubmit(), 100);
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [query]);

  return (
    <div className="chat-interface">
      <div className="messages-container">
        {messages.length === 0 && !isLoading ? (
          <WelcomeScreen onExampleClick={handleExampleClick} />
        ) : (
          <>
            {messages.map((msg) => (
              <Message key={msg.id || msg.timestamp} message={msg} />
            ))}
            {isLoading && <LoadingMessage stage={loadingStage} />}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="input-area">
        <div className="input-form-toggle">
          <button
            className={`toggle-btn ${inputMode === 'natural' ? 'active' : ''}`}
            onClick={() => setInputMode('natural')}
          >
            💬 Natural Language
          </button>
          <button
            className={`toggle-btn ${inputMode === 'structured' ? 'active' : ''}`}
            onClick={() => setInputMode('structured')}
          >
            🔧 Structured Input
          </button>
        </div>

        {inputMode === 'structured' && (
          <div className="structured-form">
            <div className="form-field">
              <label>Disease / Condition</label>
              <input
                type="text"
                placeholder="e.g. Parkinson's disease"
                value={disease}
                onChange={e => setDisease(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Patient Name (Optional)</label>
              <input
                type="text"
                placeholder="e.g. John Smith"
                value={patientName}
                onChange={e => setPatientName(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label>Location (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Toronto, Canada"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="query-input-row">
          <textarea
            ref={textareaRef}
            className="query-textarea"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              inputMode === 'structured'
                ? 'Enter treatment or intervention (e.g. Deep Brain Stimulation)...'
                : 'Ask about any disease, treatment, or clinical trial...'
            }
            disabled={isLoading}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={handleSubmit}
            disabled={isLoading || (!query.trim() && !disease.trim())}
            title="Send query"
          >
            {isLoading ? '⏳' : '🚀'}
          </button>
        </div>

        <div className="input-footer">
          <span className="input-hint">
            {context?.disease ? `Context: ${context.disease} | ` : ''}
            Searching PubMed + OpenAlex + ClinicalTrials.gov
            {systemStatus?.ollama?.available ? ' + Ollama LLM' : ' (template mode)'}
          </span>
          {messages.length > 0 && (
            <button className="clear-btn" onClick={onClearChat}>
              🗑 Clear Chat
            </button>
          )}
        </div>
      </div>
    </div>
  );
}