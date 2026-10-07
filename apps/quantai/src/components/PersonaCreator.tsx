// ============================================================================
// QuantAI - PersonaCreator Component
// Persona configuration form with personality sliders, knowledge upload
// ============================================================================

import React, { useState, useCallback, useRef } from 'react';

interface PersonaConfig {
  name: string;
  avatar: string;
  description: string;
  personality: string;
  formality: number;
  seriousness: number;
  detail: number;
  knowledgeFiles: string[];
}

interface PersonaCreatorProps {
  initialData?: Partial<PersonaConfig>;
  onSave: (config: PersonaConfig) => void;
  onCancel: () => void;
  isEditing?: boolean;
}

const AVATAR_GRID = [
  '🤖', '🧙', '👩‍💻', '📚', '🎨', '🧑‍🔬',
  '👨‍⚕️', '🧑‍🏫', '🦊', '🐉', '👽', '🥷',
  '🧑‍🚀', '🦸', '🤴', '🧜', '🧝', '🦄',
  '🐺', '🦅', '🐙', '🌟', '💎', '🔮',
];

export default function PersonaCreator({
  initialData,
  onSave,
  onCancel,
  isEditing = false,
}: PersonaCreatorProps): JSX.Element {
  const [name, setName] = useState<string>(initialData?.name || '');
  const [avatar, setAvatar] = useState<string>(initialData?.avatar || '🤖');
  const [description, setDescription] = useState<string>(initialData?.description || '');
  const [personality, setPersonality] = useState<string>(initialData?.personality || '');
  const [formality, setFormality] = useState<number>(initialData?.formality ?? 50);
  const [seriousness, setSeriousness] = useState<number>(initialData?.seriousness ?? 50);
  const [detail, setDetail] = useState<number>(initialData?.detail ?? 50);
  const [knowledgeFiles, setKnowledgeFiles] = useState<string[]>(initialData?.knowledgeFiles || []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (name.length > 50) newErrors.name = 'Name must be 50 characters or less';
    if (!description.trim()) newErrors.description = 'Description is required';
    if (!personality.trim()) newErrors.personality = 'Personality description is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, description, personality]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    onSave({
      name: name.trim(),
      avatar,
      description: description.trim(),
      personality: personality.trim(),
      formality,
      seriousness,
      detail,
      knowledgeFiles,
    });
  }, [name, avatar, description, personality, formality, seriousness, detail, knowledgeFiles, validate, onSave]);

  const handleFileUpload = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const names = Array.from(files).map(f => f.name);
      setKnowledgeFiles(prev => [...prev, ...names]);
    }
    if (e.target) e.target.value = '';
  }, []);

  const handleRemoveFile = useCallback((fileName: string) => {
    setKnowledgeFiles(prev => prev.filter(f => f !== fileName));
  }, []);

  return (
    <div className="persona-creator-component">
      <h2>{isEditing ? 'Edit Persona' : 'Create New Persona'}</h2>

      <div className="creator-form">
        <div className="form-section">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter persona name..."
              className={`form-input ${errors.name ? 'has-error' : ''}`}
              maxLength={50}
            />
            {errors.name && <span className="error-text">{errors.name}</span>}
            <span className="char-count">{name.length}/50</span>
          </div>

          <div className="form-group">
            <label>Avatar</label>
            <div className="avatar-picker">
              <div className="current-avatar">{avatar}</div>
              <div className="avatar-grid">
                {AVATAR_GRID.map((emoji, i) => (
                  <button
                    key={i}
                    className={`avatar-btn ${avatar === emoji ? 'selected' : ''}`}
                    onClick={() => setAvatar(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-group">
            <label>Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of this persona's role..."
              className={`form-input ${errors.description ? 'has-error' : ''}`}
            />
            {errors.description && <span className="error-text">{errors.description}</span>}
          </div>

          <div className="form-group">
            <label>Personality & Behavior</label>
            <textarea
              value={personality}
              onChange={e => setPersonality(e.target.value)}
              placeholder="Describe how this persona should behave, communicate, and respond. Include areas of expertise, communication style, and any specific behaviors..."
              className={`form-textarea ${errors.personality ? 'has-error' : ''}`}
              rows={5}
            />
            {errors.personality && <span className="error-text">{errors.personality}</span>}
          </div>
        </div>

        <div className="form-section">
          <label className="section-label">Tone Configuration</label>
          <div className="tone-sliders">
            <div className="slider-row">
              <span className="slider-label-left">Formal</span>
              <input
                type="range"
                min="0"
                max="100"
                value={formality}
                onChange={e => setFormality(Number(e.target.value))}
                className="tone-slider"
              />
              <span className="slider-label-right">Casual</span>
              <span className="slider-value">{formality}</span>
            </div>
            <div className="slider-row">
              <span className="slider-label-left">Serious</span>
              <input
                type="range"
                min="0"
                max="100"
                value={seriousness}
                onChange={e => setSeriousness(Number(e.target.value))}
                className="tone-slider"
              />
              <span className="slider-label-right">Playful</span>
              <span className="slider-value">{seriousness}</span>
            </div>
            <div className="slider-row">
              <span className="slider-label-left">Brief</span>
              <input
                type="range"
                min="0"
                max="100"
                value={detail}
                onChange={e => setDetail(Number(e.target.value))}
                className="tone-slider"
              />
              <span className="slider-label-right">Detailed</span>
              <span className="slider-value">{detail}</span>
            </div>
          </div>
        </div>

        <div className="form-section">
          <label className="section-label">Knowledge Documents</label>
          <div className="knowledge-upload">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              accept=".pdf,.md,.txt,.csv,.json,.docx"
              style={{ display: 'none' }}
            />
            <button className="btn-upload" onClick={handleFileUpload}>
              📁 Upload Knowledge Files
            </button>
            <p className="upload-hint">Supported: PDF, Markdown, Text, CSV, JSON, DOCX</p>
            {knowledgeFiles.length > 0 && (
              <div className="file-list">
                {knowledgeFiles.map((file, i) => (
                  <div key={i} className="file-item">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{file}</span>
                    <button className="btn-remove" onClick={() => handleRemoveFile(file)}>x</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="creator-actions">
        <button className="btn-save" onClick={handleSave}>
          {isEditing ? 'Save Changes' : 'Create Persona'}
        </button>
        <button className="btn-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
