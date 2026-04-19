import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import ChatInterface from './components/ChatInterface';
import Sidebar, { Header } from './components';
import './App.css';

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
  const [activeTab, setActiveTab] = useState('chat');
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
      const res = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/chat/status`
      );

      const data = await res.json();
      setSystemStatus(data);
    } catch (error) {
      console.log(error);
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/chat/history/${sessionId}`
      );

      const data = await res.json();

      if (data.messages?.length > 0) {
        setMessages(data.messages);
        setContext(data.context || {});
      }
    } catch (error) {
      console.log(error);
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

    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/chat/query`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ...queryData,
            sessionId
          })
        }
      );

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

        setMessages((prev) => [...prev, assistantMsg]);
        setPapers(data.papers || []);
        setTrials(data.trials || []);
        setStats(data.stats);
        setContext((prev) => ({
          ...prev,
          disease: data.queryInfo?.primaryQuery
        }));
      } else {
        throw new Error(data.error || 'Query failed');
      }
    } catch (error) {
      const errorMsg = {
        id: uuidv4(),
        role: 'assistant',
        content: `❌ Error: ${error.message}. Please check if backend server is running.`,
        timestamp: new Date().toISOString(),
        isError: true
      };

      setMessages((prev) => [...prev, errorMsg]);
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