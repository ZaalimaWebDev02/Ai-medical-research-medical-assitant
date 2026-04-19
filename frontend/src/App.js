import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ChatInterface from './components/ChatInterface';
import { Sidebar, Header } from './components/index';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'https://curalink-api-a2b8.onrender.com';

function App() {
  const [sessionId] = useState(() => {
    const stored = localStorage.getItem('curalink_session');
    if (stored) return stored;
    const newId = uuidv4();
    localStorage.setItem('curalink_session', newId);
    return newId;
  });

  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [context, setContext] = useState({});
  const [activeTab, setActiveTab] = useState('papers');
  const [papers, setPapers] = useState([]);
  const [trials, setTrials] = useState([]);
  const [stats, setStats] = useState(null);
  const [systemStatus, setSystemStatus] = useState(null);

  useEffect(() => {
    checkStatus();
    loadHistory();
  }, [sessionId]);

  async function checkStatus() {
    try {
      const res = await fetch(`${API_URL}/api/chat/status`);
      const data = await res.json();
      setSystemStatus(data);
    } catch (err) {
      console.error('Status check failed:', err.message);
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch(`${API_URL}/api/chat/history/${sessionId}`);
      const data = await res.json();
      if (data.messages?.length > 0) {
        setMessages(data.messages);
        setContext(data.context || {});
      }
    } catch (err) {
      console.error('History load failed:', err.message);
    }
  }

  async function sendQuery(queryData) {
    setIsLoading(true);

    const userMsg = {
      id: uuidv4(),
      role: 'user',
      content: queryData.query,
      timestamp: new Date().toISOString(),
      disease: queryData.disease,
      patientName: queryData.patientName
    };

    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await fetch(`${API_URL}/api/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...queryData, sessionId })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        const assistantMsg = {
          id: uuidv4(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toISOString(),
          papers: data.papers,
          trials: data.trials,
          stats: data.stats,
          queryInfo: data.queryInfo
        };

        setMessages(prev => [...prev, assistantMsg]);
        setPapers(data.papers || []);
        setTrials(data.trials || []);
        setStats(data.stats);
        setContext(prev => ({ ...prev, disease: data.queryInfo?.primaryQuery }));
        setActiveTab('papers');
      } else {
        throw new Error(data.error || 'Query failed');
      }
    } catch (error) {
      const errorMsg = {
        id: uuidv4(),
        role: 'assistant',
        content: `❌ Error: ${error.message}`,
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setPapers([]);
    setTrials([]);
    setStats(null);
    setContext({});
    localStorage.removeItem('curalink_session');
    window.location.reload();
  }

  return (
    <div className="app">
      <Header systemStatus={systemStatus} context={context} />
      <div className="app-body">
        <Sidebar
          papers={papers}
          trials={trials}
          stats={stats}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
        <ChatInterface
          messages={messages}
          isLoading={isLoading}
          onSendQuery={sendQuery}
          context={context}
          onClearChat={clearChat}
          systemStatus={systemStatus}
        />
      </div>
    </div>
  );
}

export default App;