// ============================================================================
// QuantAI - AI Personas Page
// Persona gallery grid, create/edit form, avatar picker, personality sliders,
// knowledge upload, chat with persona, share toggle
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface Persona {
  id: string;
  name: string;
  avatar: string;
  description: string;
  personality: string;
  knowledgeFiles: string[];
  tone: {
    formality: number;
    seriousness: number;
    detail: number;
  };
  isShared: boolean;
  createdAt: string;
  messageCount: number;
}

interface AvatarOption {
  id: string;
  emoji: string;
  label: string;
}

const AVATAR_OPTIONS: AvatarOption[] = [
  { id: 'a1', emoji: '🤖', label: 'Robot' },
  { id: 'a2', emoji: '🧙', label: 'Wizard' },
  { id: 'a3', emoji: '👩‍💻', label: 'Developer' },
  { id: 'a4', emoji: '📚', label: 'Scholar' },
  { id: 'a5', emoji: '🎨', label: 'Artist' },
  { id: 'a6', emoji: '🧑‍🔬', label: 'Scientist' },
  { id: 'a7', emoji: '👨‍⚕️', label: 'Doctor' },
  { id: 'a8', emoji: '🧑‍🏫', label: 'Teacher' },
  { id: 'a9', emoji: '🦊', label: 'Fox' },
  { id: 'a10', emoji: '🐉', label: 'Dragon' },
  { id: 'a11', emoji: '👽', label: 'Alien' },
  { id: 'a12', emoji: '🥷', label: 'Ninja' },
  { id: 'a13', emoji: '🧑‍🚀', label: 'Astronaut' },
  { id: 'a14', emoji: '🦸', label: 'Hero' },
  { id: 'a15', emoji: '🤴', label: 'Royal' },
  { id: 'a16', emoji: '🧜', label: 'Mermaid' },
];

const INITIAL_PERSONAS: Persona[] = [
  {
    id: 'p1', name: 'Code Mentor', avatar: '👩‍💻', description: 'Expert coding assistant that explains concepts with examples',
    personality: 'Patient, thorough, explains complex topics simply. Loves teaching and uses analogies.',
    knowledgeFiles: ['typescript-handbook.pdf', 'react-patterns.md'],
    tone: { formality: 60, seriousness: 70, detail: 90 },
    isShared: true, createdAt: '2024-01-10T10:00:00Z', messageCount: 245
  },
  {
    id: 'p2', name: 'Creative Writer', avatar: '🎨', description: 'Imaginative storyteller and content creator',
    personality: 'Creative, witty, playful. Uses vivid metaphors and colorful language.',
    knowledgeFiles: ['writing-styles.pdf'],
    tone: { formality: 20, seriousness: 30, detail: 80 },
    isShared: false, createdAt: '2024-01-12T14:00:00Z', messageCount: 89
  },
  {
    id: 'p3', name: 'Research Analyst', avatar: '🧑‍🔬', description: 'Data-driven analyst providing evidence-based insights',
    personality: 'Precise, analytical, cites sources. Presents data clearly with structured arguments.',
    knowledgeFiles: ['research-methods.pdf', 'statistics-guide.pdf', 'datasets.csv'],
    tone: { formality: 90, seriousness: 85, detail: 95 },
    isShared: true, createdAt: '2024-01-08T09:00:00Z', messageCount: 156
  },
  {
    id: 'p4', name: 'Fitness Coach', avatar: '🧑‍🏫', description: 'Motivational fitness and nutrition advisor',
    personality: 'Encouraging, energetic, goal-oriented. Keeps things simple and actionable.',
    knowledgeFiles: ['nutrition-guide.pdf'],
    tone: { formality: 30, seriousness: 50, detail: 60 },
    isShared: true, createdAt: '2024-01-11T08:00:00Z', messageCount: 67
  },
];

export default function PersonasPage(): JSX.Element {
  const [personas, setPersonas] = useState<Persona[]>(INITIAL_PERSONAS);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [chatWith, setChatWith] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [chatInput, setChatInput] = useState<string>('');

  const [formName, setFormName] = useState<string>('');
  const [formAvatar, setFormAvatar] = useState<string>('🤖');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formPersonality, setFormPersonality] = useState<string>('');
  const [formFormality, setFormFormality] = useState<number>(50);
  const [formSeriousness, setFormSeriousness] = useState<number>(50);
  const [formDetail, setFormDetail] = useState<number>(50);
  const [formFiles, setFormFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedPersonaData = useMemo(() => {
    if (!selectedPersona) return null;
    return personas.find(p => p.id === selectedPersona) || null;
  }, [selectedPersona, personas]);

  const handleCreateNew = useCallback(() => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedPersona(null);
    setFormName('');
    setFormAvatar('🤖');
    setFormDescription('');
    setFormPersonality('');
    setFormFormality(50);
    setFormSeriousness(50);
    setFormDetail(50);
    setFormFiles([]);
  }, []);

  const handleEditPersona = useCallback((persona: Persona) => {
    setIsEditing(true);
    setIsCreating(false);
    setSelectedPersona(persona.id);
    setFormName(persona.name);
    setFormAvatar(persona.avatar);
    setFormDescription(persona.description);
    setFormPersonality(persona.personality);
    setFormFormality(persona.tone.formality);
    setFormSeriousness(persona.tone.seriousness);
    setFormDetail(persona.tone.detail);
    setFormFiles(persona.knowledgeFiles);
  }, []);

  const handleSavePersona = useCallback(() => {
    if (!formName.trim()) return;

    const personaData: Persona = {
      id: isEditing && selectedPersona ? selectedPersona : `p${Date.now()}`,
      name: formName,
      avatar: formAvatar,
      description: formDescription,
      personality: formPersonality,
      knowledgeFiles: formFiles,
      tone: { formality: formFormality, seriousness: formSeriousness, detail: formDetail },
      isShared: false,
      createdAt: new Date().toISOString(),
      messageCount: 0,
    };

    if (isEditing && selectedPersona) {
      setPersonas(prev => prev.map(p => p.id === selectedPersona ? { ...personaData, messageCount: p.messageCount, isShared: p.isShared } : p));
    } else {
      setPersonas(prev => [...prev, personaData]);
    }

    setIsCreating(false);
    setIsEditing(false);
  }, [formName, formAvatar, formDescription, formPersonality, formFiles, formFormality, formSeriousness, formDetail, isEditing, selectedPersona]);

  const handleDeletePersona = useCallback((id: string) => {
    setPersonas(prev => prev.filter(p => p.id !== id));
    if (selectedPersona === id) setSelectedPersona(null);
  }, [selectedPersona]);

  const handleToggleShare = useCallback((id: string) => {
    setPersonas(prev => prev.map(p =>
      p.id === id ? { ...p, isShared: !p.isShared } : p
    ));
  }, []);

  const handleFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files).map(f => f.name);
      setFormFiles(prev => [...prev, ...newFiles]);
    }
  }, []);

  const handleRemoveFile = useCallback((fileName: string) => {
    setFormFiles(prev => prev.filter(f => f !== fileName));
  }, []);

  const handleChatWithPersona = useCallback((personaId: string) => {
    setChatWith(personaId);
    setChatMessages([]);
    setChatInput('');
  }, []);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim() || !chatWith) return;
    const persona = personas.find(p => p.id === chatWith);
    setChatMessages(prev => [
      ...prev,
      { role: 'user', content: chatInput },
      { role: 'assistant', content: `[${persona?.name}]: I understand your question. Let me help you with that based on my expertise.` },
    ]);
    setChatInput('');
  }, [chatInput, chatWith, personas]);

  const handleCancelForm = useCallback(() => {
    setIsCreating(false);
    setIsEditing(false);
  }, []);

  if (error) {
    return (
      <div className="personas-page error-state">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  if (chatWith) {
    const persona = personas.find(p => p.id === chatWith);
    return (
      <div className="personas-page chat-mode">
        <header className="chat-header">
          <button className="btn-back" onClick={() => setChatWith(null)}>← Back</button>
          <div className="chat-persona-info">
            <span className="persona-avatar">{persona?.avatar}</span>
            <span className="persona-name">{persona?.name}</span>
          </div>
        </header>
        <div className="chat-messages">
          {chatMessages.length === 0 ? (
            <div className="chat-empty">
              <span className="big-avatar">{persona?.avatar}</span>
              <h2>Chat with {persona?.name}</h2>
              <p>{persona?.description}</p>
            </div>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} className={`chat-msg ${msg.role}`}>
                <div className="msg-content">{msg.content}</div>
              </div>
            ))
          )}
        </div>
        <div className="chat-input-bar">
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSendChat(); }}
            placeholder={`Message ${persona?.name}...`}
            className="chat-text-input"
          />
          <button className="btn-send-chat" onClick={handleSendChat} disabled={!chatInput.trim()}>
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="personas-page">
      <header className="personas-header">
        <h1>AI Personas</h1>
        <button className="btn-create" onClick={handleCreateNew}>+ Create Persona</button>
      </header>

      {(isCreating || isEditing) && (
        <section className="persona-form">
          <h2>{isEditing ? 'Edit Persona' : 'Create New Persona'}</h2>
          <div className="form-grid">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g., Code Mentor"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label>Avatar</label>
              <div className="avatar-grid">
                {AVATAR_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    className={`avatar-option ${formAvatar === opt.emoji ? 'selected' : ''}`}
                    onClick={() => setFormAvatar(opt.emoji)}
                    title={opt.label}
                  >
                    {opt.emoji}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group full-width">
              <label>Description</label>
              <input
                type="text"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder="Brief description of this persona"
                className="form-input"
              />
            </div>

            <div className="form-group full-width">
              <label>Personality</label>
              <textarea
                value={formPersonality}
                onChange={e => setFormPersonality(e.target.value)}
                placeholder="Describe the personality, communication style, areas of expertise..."
                className="form-textarea"
                rows={4}
              />
            </div>

            <div className="form-group full-width">
              <label>Tone Sliders</label>
              <div className="tone-sliders">
                <div className="slider-row">
                  <span>Formal</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formFormality}
                    onChange={e => setFormFormality(Number(e.target.value))}
                  />
                  <span>Casual</span>
                </div>
                <div className="slider-row">
                  <span>Serious</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formSeriousness}
                    onChange={e => setFormSeriousness(Number(e.target.value))}
                  />
                  <span>Playful</span>
                </div>
                <div className="slider-row">
                  <span>Brief</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={formDetail}
                    onChange={e => setFormDetail(Number(e.target.value))}
                  />
                  <span>Detailed</span>
                </div>
              </div>
            </div>

            <div className="form-group full-width">
              <label>Knowledge Documents</label>
              <div className="file-upload-area">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  accept=".pdf,.md,.txt,.csv,.json"
                  style={{ display: 'none' }}
                />
                <button className="btn-upload" onClick={handleFileUpload}>
                  📁 Upload Files
                </button>
                {formFiles.length > 0 && (
                  <div className="uploaded-files">
                    {formFiles.map((file, i) => (
                      <div key={i} className="file-tag">
                        <span>{file}</span>
                        <button onClick={() => handleRemoveFile(file)}>x</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button className="btn-save" onClick={handleSavePersona} disabled={!formName.trim()}>
              {isEditing ? 'Save Changes' : 'Create Persona'}
            </button>
            <button className="btn-cancel" onClick={handleCancelForm}>Cancel</button>
          </div>
        </section>
      )}

      <section className="personas-gallery">
        {personas.length === 0 ? (
          <div className="empty-personas">
            <h2>No personas yet</h2>
            <p>Create your first AI persona to get started</p>
          </div>
        ) : (
          <div className="personas-grid">
            {personas.map(persona => (
              <div key={persona.id} className="persona-card">
                <div className="card-header">
                  <span className="persona-avatar-large">{persona.avatar}</span>
                  <div className="persona-title">
                    <h3>{persona.name}</h3>
                    <p className="persona-desc">{persona.description}</p>
                  </div>
                </div>
                <div className="persona-stats">
                  <span>{persona.messageCount} messages</span>
                  <span>{persona.knowledgeFiles.length} docs</span>
                </div>
                <div className="persona-actions">
                  <button className="btn-chat" onClick={() => handleChatWithPersona(persona.id)}>
                    💬 Chat
                  </button>
                  <button className="btn-edit" onClick={() => handleEditPersona(persona)}>
                    ✏️ Edit
                  </button>
                  <button className="btn-delete" onClick={() => handleDeletePersona(persona.id)}>
                    🗑️
                  </button>
                  <label className="share-toggle">
                    <input
                      type="checkbox"
                      checked={persona.isShared}
                      onChange={() => handleToggleShare(persona.id)}
                    />
                    Share
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
