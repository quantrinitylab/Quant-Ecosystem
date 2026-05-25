// ============================================================================
// QuantAI - AI Chat Interface (ChatGPT-killer)
// Streaming message display, conversation sidebar, multi-modal input,
// model selector, suggested prompts, typing indicator
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface Conversation {
  id: string;
  title: string;
  preview: string;
  date: string;
  messageCount: number;
  model: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  imageUrl?: string;
  isStreaming?: boolean;
  tokens?: number;
  latencyMs?: number;
}

interface SuggestedPrompt {
  id: string;
  title: string;
  description: string;
  icon: string;
  prompt: string;
}

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  maxTokens: number;
  supportsVision: boolean;
  supportsCode: boolean;
}

const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'gpt-4', name: 'GPT-4 Turbo', provider: 'OpenAI', maxTokens: 128000, supportsVision: true, supportsCode: true },
  { id: 'claude-3', name: 'Claude 3 Opus', provider: 'Anthropic', maxTokens: 200000, supportsVision: true, supportsCode: true },
  { id: 'llama-3', name: 'Llama 3 70B', provider: 'Meta', maxTokens: 8192, supportsVision: false, supportsCode: true },
  { id: 'gemini', name: 'Gemini Pro', provider: 'Google', maxTokens: 1000000, supportsVision: true, supportsCode: true },
];

const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { id: '1', title: 'Write Code', description: 'Generate code in any language', icon: '💻', prompt: 'Write a function that...' },
  { id: '2', title: 'Analyze Data', description: 'Interpret data and create insights', icon: '📊', prompt: 'Analyze this dataset...' },
  { id: '3', title: 'Creative Writing', description: 'Stories, poems, and more', icon: '✍️', prompt: 'Write a creative story about...' },
  { id: '4', title: 'Explain Concepts', description: 'Learn anything simply', icon: '🧠', prompt: 'Explain how...' },
  { id: '5', title: 'Brainstorm Ideas', description: 'Generate creative solutions', icon: '💡', prompt: 'Help me brainstorm ideas for...' },
  { id: '6', title: 'Debug Code', description: 'Find and fix errors', icon: '🐛', prompt: 'Debug this code...' },
];

export default function AIAssistantPage(): JSX.Element {
  const [conversations, setConversations] = useState<Conversation[]>([
    { id: 'c1', title: 'React Component Help', preview: 'How do I use useEffect...', date: '2024-01-15T10:30:00Z', messageCount: 8, model: 'gpt-4' },
    { id: 'c2', title: 'Python Data Analysis', preview: 'Can you help me with pandas...', date: '2024-01-14T15:20:00Z', messageCount: 12, model: 'claude-3' },
    { id: 'c3', title: 'API Design Discussion', preview: 'What are REST best practices...', date: '2024-01-13T09:00:00Z', messageCount: 5, model: 'gpt-4' },
  ]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentConversation, setCurrentConversation] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4');
  const [inputText, setInputText] = useState<string>('');
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [showModelSelector, setShowModelSelector] = useState<boolean>(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredConversations = useMemo(() => {
    if (!searchQuery) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      c => c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const currentModel = useMemo(() => {
    return AVAILABLE_MODELS.find(m => m.id === selectedModel) || AVAILABLE_MODELS[0];
  }, [selectedModel]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  useEffect(() => {
    if (currentConversation) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setMessages([
          { id: 'm1', role: 'user', content: 'How do I use useEffect with async functions?', timestamp: '2024-01-15T10:30:00Z' },
          { id: 'm2', role: 'assistant', content: 'You can use useEffect with async by creating an inner async function and calling it immediately. Here is an example:\n\n```javascript\nuseEffect(() => {\n  const fetchData = async () => {\n    const response = await fetch("/api/data");\n    const data = await response.json();\n    setData(data);\n  };\n  fetchData();\n}, []);\n```\n\nNever make the useEffect callback itself async, as it should return either nothing or a cleanup function.', timestamp: '2024-01-15T10:30:05Z', model: 'gpt-4', tokens: 156, latencyMs: 1200 },
        ]);
        setIsLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentConversation]);

  const handleNewChat = useCallback(() => {
    const newConv: Conversation = {
      id: `c${Date.now()}`,
      title: 'New Chat',
      preview: '',
      date: new Date().toISOString(),
      messageCount: 0,
      model: selectedModel,
    };
    setConversations(prev => [newConv, ...prev]);
    setCurrentConversation(newConv.id);
    setMessages([]);
  }, [selectedModel]);

  const handleSelectConversation = useCallback((id: string) => {
    setCurrentConversation(id);
    setError(null);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (currentConversation === id) {
      setCurrentConversation(null);
      setMessages([]);
    }
  }, [currentConversation]);

  const simulateStreaming = useCallback((content: string, messageId: string) => {
    setIsStreaming(true);
    let index = 0;
    const interval = setInterval(() => {
      index += Math.floor(Math.random() * 5) + 3;
      if (index >= content.length) {
        setMessages(prev =>
          prev.map(m => m.id === messageId ? { ...m, content, isStreaming: false } : m)
        );
        setIsStreaming(false);
        clearInterval(interval);
      } else {
        setMessages(prev =>
          prev.map(m => m.id === messageId ? { ...m, content: content.slice(0, index), isStreaming: true } : m)
        );
      }
    }, 30);
  }, []);

  const handleSendMessage = useCallback(() => {
    if (!inputText.trim() && !uploadedImage) return;
    if (isStreaming) return;

    const userMsg: ChatMessage = {
      id: `m${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date().toISOString(),
      imageUrl: uploadedImage || undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setUploadedImage(null);

    if (!currentConversation) {
      handleNewChat();
    }

    const assistantMsg: ChatMessage = {
      id: `m${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      model: selectedModel,
      isStreaming: true,
    };

    setTimeout(() => {
      setMessages(prev => [...prev, assistantMsg]);
      const responseContent = generateResponse(inputText.trim());
      simulateStreaming(responseContent, assistantMsg.id);
    }, 300);
  }, [inputText, uploadedImage, isStreaming, currentConversation, selectedModel, handleNewChat, simulateStreaming]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleImageUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedImage(URL.createObjectURL(file));
    }
  }, []);

  const handleVoiceRecord = useCallback(() => {
    setIsRecording(prev => !prev);
    if (!isRecording) {
      setTimeout(() => {
        setIsRecording(false);
        setInputText('Transcribed voice message goes here');
      }, 3000);
    }
  }, [isRecording]);

  const handlePromptClick = useCallback((prompt: SuggestedPrompt) => {
    setInputText(prompt.prompt);
    inputRef.current?.focus();
  }, []);

  const formatDate = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }, []);

  if (error) {
    return (
      <div className="ai-chat-page error-state">
        <div className="error-container">
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button onClick={() => setError(null)} className="btn-retry">Try Again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-chat-page">
      <aside className="conversations-sidebar">
        <div className="sidebar-header">
          <h2>QuantAI</h2>
          <button className="btn-new-chat" onClick={handleNewChat}>
            <span className="icon">+</span> New Chat
          </button>
        </div>
        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="conversations-list">
          {filteredConversations.length === 0 ? (
            <div className="empty-conversations">
              <p>No conversations yet</p>
            </div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.id}
                className={`conversation-item ${currentConversation === conv.id ? 'active' : ''}`}
                onClick={() => handleSelectConversation(conv.id)}
              >
                <div className="conv-title">{conv.title}</div>
                <div className="conv-preview">{conv.preview}</div>
                <div className="conv-meta">
                  <span className="conv-date">{formatDate(conv.date)}</span>
                  <span className="conv-model">{conv.model}</span>
                </div>
                <button
                  className="btn-delete-conv"
                  onClick={e => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                >
                  x
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="chat-main">
        <header className="chat-header">
          <div className="model-selector-wrapper">
            <button
              className="model-selector-btn"
              onClick={() => setShowModelSelector(!showModelSelector)}
            >
              <span className="model-name">{currentModel.name}</span>
              <span className="model-provider">{currentModel.provider}</span>
              <span className="dropdown-arrow">▼</span>
            </button>
            {showModelSelector && (
              <div className="model-dropdown">
                {AVAILABLE_MODELS.map(model => (
                  <div
                    key={model.id}
                    className={`model-option ${selectedModel === model.id ? 'selected' : ''}`}
                    onClick={() => { setSelectedModel(model.id); setShowModelSelector(false); }}
                  >
                    <div className="model-option-name">{model.name}</div>
                    <div className="model-option-meta">
                      <span>{model.provider}</span>
                      <span>{(model.maxTokens / 1000).toFixed(0)}K tokens</span>
                      {model.supportsVision && <span className="badge-vision">Vision</span>}
                      {model.supportsCode && <span className="badge-code">Code</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="messages-container">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading conversation...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-chat">
              <div className="welcome-section">
                <h1>QuantAI Assistant</h1>
                <p>Ask anything. Generate code. Analyze images. Create content.</p>
              </div>
              <div className="suggested-prompts-grid">
                {SUGGESTED_PROMPTS.map(prompt => (
                  <div
                    key={prompt.id}
                    className="prompt-card"
                    onClick={() => handlePromptClick(prompt)}
                  >
                    <span className="prompt-icon">{prompt.icon}</span>
                    <div className="prompt-info">
                      <div className="prompt-title">{prompt.title}</div>
                      <div className="prompt-desc">{prompt.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map(msg => (
                <div key={msg.id} className={`message-bubble ${msg.role}`}>
                  <div className="message-avatar">
                    {msg.role === 'user' ? '👤' : '🤖'}
                  </div>
                  <div className="message-body">
                    <div className="message-content">
                      {msg.content}
                      {msg.isStreaming && <span className="typing-cursor">|</span>}
                    </div>
                    {msg.imageUrl && (
                      <div className="message-image">
                        <img src={msg.imageUrl} alt="Uploaded" />
                      </div>
                    )}
                    <div className="message-footer">
                      {msg.model && <span className="msg-model">{msg.model}</span>}
                      {msg.tokens && <span className="msg-tokens">{msg.tokens} tokens</span>}
                      {msg.latencyMs && <span className="msg-latency">{msg.latencyMs}ms</span>}
                      <span className="msg-time">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="input-bar">
          {uploadedImage && (
            <div className="image-preview">
              <img src={uploadedImage} alt="Upload preview" />
              <button onClick={() => setUploadedImage(null)} className="btn-remove-image">x</button>
            </div>
          )}
          <div className="input-row">
            <button
              className={`btn-upload ${!currentModel.supportsVision ? 'disabled' : ''}`}
              onClick={handleImageUpload}
              disabled={!currentModel.supportsVision}
              title="Upload image"
            >
              📎
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${currentModel.name}...`}
              className="message-input"
              rows={1}
            />
            <button
              className={`btn-voice ${isRecording ? 'recording' : ''}`}
              onClick={handleVoiceRecord}
              title="Voice input"
            >
              {isRecording ? '⏹️' : '🎤'}
            </button>
            <button
              className="btn-send"
              onClick={handleSendMessage}
              disabled={(!inputText.trim() && !uploadedImage) || isStreaming}
            >
              {isStreaming ? '⏳' : '➤'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function generateResponse(input: string): string {
  const responses: Record<string, string> = {
    code: 'Here is a code example that demonstrates the concept:\n\n```typescript\nfunction example() {\n  const result = processData(input);\n  return result.map(item => transform(item));\n}\n```\n\nThis pattern allows you to chain operations efficiently while maintaining type safety throughout the pipeline.',
    data: 'Based on the data analysis, here are the key findings:\n\n1. There is a strong correlation (r=0.87) between the variables\n2. The trend shows a 23% increase over the past quarter\n3. Outliers were detected in 3 data points\n\nI recommend focusing on the segments showing the highest growth potential.',
    default: 'I understand your question. Let me provide a comprehensive answer.\n\nThe approach you should consider involves several key steps:\n\n1. First, identify the core requirements and constraints\n2. Design the architecture with scalability in mind\n3. Implement using established best practices\n4. Test thoroughly with both unit and integration tests\n\nWould you like me to elaborate on any of these points?',
  };
  if (input.toLowerCase().includes('code') || input.toLowerCase().includes('function')) return responses.code;
  if (input.toLowerCase().includes('data') || input.toLowerCase().includes('analyze')) return responses.data;
  return responses.default;
}
