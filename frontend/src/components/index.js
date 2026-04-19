import React from 'react';

// ━━━━━━━━━━━━━━━━━━━━━━ HEADER ━━━━━━━━━━━━━━━━━━━━━━
export function Header({ systemStatus, context }) {
  const ollamaOnline = systemStatus?.ollama?.available;
  const modelName = systemStatus?.model || 'mistral';

  return (
    <header className="header">
      <div className="header-logo">
        <div className="logo-icon">🧬</div>
        <span className="logo-text">Cura<span>link</span></span>
        <span className="logo-badge">AI Research</span>
      </div>

      <div className="header-center">
        {context?.disease && (
          <span className="context-pill">{context.disease}</span>
        )}
      </div>

      <div className="header-right">
        <div className="status-indicator">
          <span className={`status-dot ${ollamaOnline ? '' : 'warning'}`} />
          <span>{ollamaOnline ? `${modelName} online` : 'Template mode'}</span>
        </div>

        <div className="status-indicator">
          <span className="status-dot" />
          <span>APIs online</span>
        </div>
      </div>
    </header>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━ PAPER CARD ━━━━━━━━━━━━━━━━━━━━━━
function PaperCard({ paper, rank }) {
  const sourceClass = {
    PubMed: 'source-pubmed',
    OpenAlex: 'source-openalex',
    'ClinicalTrials.gov': 'source-clinicaltrials'
  }[paper.source] || 'source-pubmed';

  return (
    <div
      className="paper-card"
      onClick={() => paper.url && window.open(paper.url, '_blank')}
    >
      <div className="paper-rank">
        <span className="rank-badge">#{rank}</span>

        <div className="relevance-bar">
          <span className="relevance-score">{paper.relevanceScore}%</span>

          <div className="score-bar">
            <div
              className="score-fill"
              style={{ width: `${paper.relevanceScore}%` }}
            />
          </div>
        </div>
      </div>

      <div className="paper-title">{paper.title}</div>

      <div className="paper-meta">
        <span className={`paper-source ${sourceClass}`}>
          {paper.source}
        </span>

        {paper.year > 0 && (
          <span className="paper-year">{paper.year}</span>
        )}

        {paper.citationCount > 0 && (
          <span className="paper-year">📎 {paper.citationCount}</span>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━ TRIAL CARD ━━━━━━━━━━━━━━━━━━━━━━
function TrialCard({ trial }) {
  const statusClass = {
    RECRUITING: 'status-recruiting',
    NOT_YET_RECRUITING: 'status-default',
    ACTIVE_NOT_RECRUITING: 'status-active',
    COMPLETED: 'status-completed'
  }[trial.status] || 'status-default';

  return (
    <div className="trial-card">
      <div>
        <span className={`trial-status ${statusClass}`}>
          {trial.status === 'RECRUITING' && '● '}
          {(trial.statusDisplay || trial.status)
            .replace(/[🟢🔵🟡⚫🔴🟠]/g, '')
            .trim()}
        </span>
      </div>

      <div className="trial-title">{trial.title}</div>

      {trial.phases?.length > 0 && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginBottom: 6,
            fontFamily: 'var(--font-mono)'
          }}
        >
          {trial.phases.join(' / ')}
        </div>
      )}

      {trial.url && (
        <a
          className="trial-link"
          href={trial.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {trial.nctId || 'View Trial'} ↗
        </a>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━ STATS PANEL ━━━━━━━━━━━━━━━━━━━━━━
function StatsPanel({ stats }) {
  if (!stats) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📊</div>
        <div className="empty-state-text">
          Statistics will appear here after your first query
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.pubmed}</div>
          <div className="stat-label">PubMed</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{stats.openAlex}</div>
          <div className="stat-label">OpenAlex</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{stats.clinicalTrials}</div>
          <div className="stat-label">Trials</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      <div
        style={{
          background: 'rgba(0, 229, 160, 0.05)',
          border: '1px solid rgba(0, 229, 160, 0.1)',
          borderRadius: 10,
          padding: 12,
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.7
        }}
      >
        <div>
          🏆 Top Papers:{' '}
          <strong style={{ color: 'var(--accent-cyan)' }}>
            {stats.topPapers}
          </strong>
        </div>

        <div>
          🏥 Top Trials:{' '}
          <strong style={{ color: 'var(--accent-cyan)' }}>
            {stats.topTrials}
          </strong>
        </div>

        <div>
          ⚡ Processing:{' '}
          <strong style={{ color: 'var(--accent-cyan)' }}>
            {stats.processingTimeMs}ms
          </strong>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━ SIDEBAR ━━━━━━━━━━━━━━━━━━━━━━
export function Sidebar({
  papers,
  trials,
  stats,
  activeTab,
  setActiveTab
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'papers' ? 'active' : ''}`}
          onClick={() => setActiveTab('papers')}
        >
          Papers
          {papers.length > 0 && (
            <span className="tab-badge">{papers.length}</span>
          )}
        </button>

        <button
          className={`sidebar-tab ${activeTab === 'trials' ? 'active' : ''}`}
          onClick={() => setActiveTab('trials')}
        >
          Trials
          {trials.length > 0 && (
            <span className="tab-badge">{trials.length}</span>
          )}
        </button>

        <button
          className={`sidebar-tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'papers' && (
          <>
            <div className="sidebar-section-title">
              Research Papers · Ranked by Relevance
            </div>

            {papers.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📚</div>
                <div className="empty-state-text">
                  Research papers will appear here after your query
                </div>
              </div>
            ) : (
              papers.map((paper, idx) => (
                <PaperCard
                  key={paper.id || idx}
                  paper={paper}
                  rank={idx + 1}
                />
              ))
            )}
          </>
        )}

        {activeTab === 'trials' && (
          <>
            <div className="sidebar-section-title">
              Clinical Trials · ClinicalTrials.gov
            </div>

            {trials.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🏥</div>
                <div className="empty-state-text">
                  Clinical trials will appear here after your query
                </div>
              </div>
            ) : (
              trials.map((trial, idx) => (
                <TrialCard
                  key={trial.id || idx}
                  trial={trial}
                />
              ))
            )}
          </>
        )}

        {activeTab === 'stats' && (
          <>
            <div className="sidebar-section-title">
              Retrieval Statistics
            </div>

            <StatsPanel stats={stats} />
          </>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;