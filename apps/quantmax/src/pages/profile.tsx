// ============================================================================
// QuantMax - Dating Profile Editor
// 6 photo slots (2x3 grid, drag to reorder), 3 prompt/answer slots,
// interests tag picker (max 10), preferences (age range, distance, gender),
// verification selfie upload
// ============================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface ProfilePhoto {
  id: string;
  url: string;
  slot: number;
  isMain: boolean;
}

interface ProfilePrompt {
  id: string;
  question: string;
  answer: string;
}

interface Preferences {
  ageMin: number;
  ageMax: number;
  distanceMax: number;
  genders: string[];
}

interface VerificationState {
  status: 'none' | 'pending' | 'verified' | 'rejected';
  selfieUrl: string | null;
  submittedAt: string | null;
}

const AVAILABLE_INTERESTS = [
  'Travel', 'Music', 'Hiking', 'Photography', 'Cooking', 'Yoga', 'Reading',
  'Coffee', 'Art', 'Dancing', 'Movies', 'Gaming', 'Fitness', 'Pets',
  'Wine', 'Brunch', 'Sports', 'Fashion', 'Technology', 'Nature',
  'Comedy', 'Writing', 'Surfing', 'Cycling', 'Meditation', 'Volunteering',
  'Foodie', 'Gardening', 'Singing', 'Camping',
];

const PROMPT_OPTIONS = [
  'My ideal weekend looks like',
  'A fact about me that surprises people',
  'My most controversial opinion is',
  'The way to win me over is',
  'I geek out on',
  'My love language is',
  'Biggest risk I have taken',
  'Best travel story',
  'A life goal of mine',
  'I am looking for someone who',
  'My most irrational fear',
  'The key to my heart is',
];

const GENDER_OPTIONS = ['Women', 'Men', 'Non-binary', 'Everyone'];

const ProfileEditorPage: React.FC = () => {
  const [photos, setPhotos] = useState<(ProfilePhoto | null)[]>(Array(6).fill(null));
  const [prompts, setPrompts] = useState<ProfilePrompt[]>([]);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<Preferences>({
    ageMin: 18,
    ageMax: 35,
    distanceMax: 50,
    genders: ['Everyone'],
  });
  const [verification, setVerification] = useState<VerificationState>({
    status: 'none',
    selfieUrl: null,
    submittedAt: null,
  });
  const [displayName, setDisplayName] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [age, setAge] = useState<number>(25);
  const [job, setJob] = useState<string>('');
  const [company, setCompany] = useState<string>('');
  const [education, setEducation] = useState<string>('');
  const [city, setCity] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showPromptSelector, setShowPromptSelector] = useState<boolean>(false);
  const [editingPromptSlot, setEditingPromptSlot] = useState<number>(-1);
  const [promptAnswer, setPromptAnswer] = useState<string>('');
  const [showInterestsPicker, setShowInterestsPicker] = useState<boolean>(false);
  const [showVerificationModal, setShowVerificationModal] = useState<boolean>(false);
  const [draggedPhotoSlot, setDraggedPhotoSlot] = useState<number | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState<boolean>(false);
  const [activeSection, setActiveSection] = useState<'photos' | 'about' | 'prompts' | 'interests' | 'preferences' | 'verification'>('photos');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadSlotRef = useRef<number>(0);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 400));
      // Simulate loaded profile data
      setDisplayName('Alex Johnson');
      setAge(26);
      setBio('Adventure seeker and coffee enthusiast');
      setJob('Software Engineer');
      setCompany('QuantTech');
      setEducation('Stanford University');
      setCity('San Francisco');
      setPhotos([
        { id: 'p1', url: 'https://cdn.quantmax.app/profile/1.jpg', slot: 0, isMain: true },
        { id: 'p2', url: 'https://cdn.quantmax.app/profile/2.jpg', slot: 1, isMain: false },
        { id: 'p3', url: 'https://cdn.quantmax.app/profile/3.jpg', slot: 2, isMain: false },
        null,
        null,
        null,
      ]);
      setSelectedInterests(['Travel', 'Music', 'Hiking', 'Coffee', 'Photography']);
      setPrompts([
        { id: 'pr1', question: 'My ideal weekend looks like', answer: 'Hiking in the morning, coffee shop in the afternoon, live music at night' },
        { id: 'pr2', question: 'A fact about me that surprises people', answer: 'I have visited 30 countries before turning 25' },
      ]);
      setPreferences({ ageMin: 22, ageMax: 32, distanceMax: 30, genders: ['Women'] });
      setVerification({ status: 'verified', selfieUrl: 'https://cdn.quantmax.app/verify/1.jpg', submittedAt: '2024-01-15' });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaveProfile = useCallback(async () => {
    setSaving(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));
      setUnsavedChanges(false);
    } finally {
      setSaving(false);
    }
  }, []);

  const handlePhotoUpload = useCallback((slot: number) => {
    uploadSlotRef.current = slot;
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const slot = uploadSlotRef.current;
    setPhotos(prev => {
      const updated = [...prev];
      updated[slot] = {
        id: `photo-new-${Date.now()}`,
        url,
        slot,
        isMain: slot === 0,
      };
      return updated;
    });
    setUnsavedChanges(true);
  }, []);

  const handleRemovePhoto = useCallback((slot: number) => {
    setPhotos(prev => {
      const updated = [...prev];
      updated[slot] = null;
      return updated;
    });
    setUnsavedChanges(true);
  }, []);

  const handleDragStart = useCallback((slot: number) => {
    setDraggedPhotoSlot(slot);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, slot: number) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((targetSlot: number) => {
    if (draggedPhotoSlot === null || draggedPhotoSlot === targetSlot) return;
    setPhotos(prev => {
      const updated = [...prev];
      const temp = updated[draggedPhotoSlot];
      updated[draggedPhotoSlot] = updated[targetSlot];
      updated[targetSlot] = temp;
      // Update slot numbers and isMain
      return updated.map((photo, idx) => photo ? { ...photo, slot: idx, isMain: idx === 0 } : null);
    });
    setDraggedPhotoSlot(null);
    setUnsavedChanges(true);
  }, [draggedPhotoSlot]);

  const handleAddPrompt = useCallback((question: string) => {
    if (prompts.length >= 3) return;
    setShowPromptSelector(false);
    setEditingPromptSlot(prompts.length);
    setPromptAnswer('');
  }, [prompts]);

  const handleSavePrompt = useCallback((question: string) => {
    if (!promptAnswer.trim()) return;
    const newPrompt: ProfilePrompt = {
      id: `prompt-${Date.now()}`,
      question,
      answer: promptAnswer,
    };
    if (editingPromptSlot < prompts.length) {
      setPrompts(prev => prev.map((p, i) => i === editingPromptSlot ? newPrompt : p));
    } else {
      setPrompts(prev => [...prev, newPrompt]);
    }
    setEditingPromptSlot(-1);
    setPromptAnswer('');
    setUnsavedChanges(true);
  }, [promptAnswer, editingPromptSlot, prompts]);

  const handleRemovePrompt = useCallback((index: number) => {
    setPrompts(prev => prev.filter((_, i) => i !== index));
    setUnsavedChanges(true);
  }, []);

  const handleToggleInterest = useCallback((interest: string) => {
    setSelectedInterests(prev => {
      if (prev.includes(interest)) {
        return prev.filter(i => i !== interest);
      }
      if (prev.length >= 10) return prev;
      return [...prev, interest];
    });
    setUnsavedChanges(true);
  }, []);

  const handleGenderToggle = useCallback((gender: string) => {
    setPreferences(prev => {
      if (gender === 'Everyone') return { ...prev, genders: ['Everyone'] };
      const filtered = prev.genders.filter(g => g !== 'Everyone');
      if (filtered.includes(gender)) {
        return { ...prev, genders: filtered.filter(g => g !== gender) };
      }
      return { ...prev, genders: [...filtered, gender] };
    });
    setUnsavedChanges(true);
  }, []);

  const handleVerificationUpload = useCallback(() => {
    setVerification(prev => ({
      ...prev,
      status: 'pending',
      selfieUrl: 'https://cdn.quantmax.app/verify/pending.jpg',
      submittedAt: new Date().toISOString(),
    }));
    setShowVerificationModal(false);
  }, []);

  const photoCount = useMemo(() => photos.filter(p => p !== null).length, [photos]);

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="loading-spinner" />
        <p>Loading your profile...</p>
      </div>
    );
  }

  return (
    <div className="profile-editor-page">
      {/* Header */}
      <div className="profile-editor-header">
        <h1 className="editor-title">Edit Profile</h1>
        <button
          className={`save-btn ${unsavedChanges ? 'active' : ''}`}
          onClick={handleSaveProfile}
          disabled={saving || !unsavedChanges}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Section Navigation */}
      <div className="section-nav">
        {(['photos', 'about', 'prompts', 'interests', 'preferences', 'verification'] as const).map(section => (
          <button
            key={section}
            className={`section-tab ${activeSection === section ? 'active' : ''}`}
            onClick={() => setActiveSection(section)}
          >
            {section.charAt(0).toUpperCase() + section.slice(1)}
          </button>
        ))}
      </div>

      {/* Photos Section - 2x3 Grid */}
      {activeSection === 'photos' && (
        <div className="photos-section">
          <h3 className="section-heading">Photos ({photoCount}/6)</h3>
          <p className="section-hint">Drag to reorder. First photo is your main profile picture.</p>
          <div className="photo-grid">
            {photos.map((photo, slot) => (
              <div
                key={slot}
                className={`photo-slot ${photo ? 'filled' : 'empty'} ${slot === 0 ? 'main' : ''} ${draggedPhotoSlot === slot ? 'dragging' : ''}`}
                draggable={!!photo}
                onDragStart={() => handleDragStart(slot)}
                onDragOver={(e) => handleDragOver(e, slot)}
                onDrop={() => handleDrop(slot)}
              >
                {photo ? (
                  <>
                    <img className="slot-photo" src={photo.url} alt={`Photo ${slot + 1}`} />
                    {slot === 0 && <span className="main-badge">Main</span>}
                    <button className="remove-photo-btn" onClick={() => handleRemovePhoto(slot)}>&#10005;</button>
                  </>
                ) : (
                  <button className="add-photo-btn" onClick={() => handlePhotoUpload(slot)}>
                    <span className="add-icon">+</span>
                    <span className="add-label">Add Photo</span>
                  </button>
                )}
              </div>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden-file-input"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* About Section */}
      {activeSection === 'about' && (
        <div className="about-section">
          <h3 className="section-heading">About You</h3>
          <div className="form-field">
            <label className="field-label">Display Name</label>
            <input className="field-input" value={displayName} onChange={(e) => { setDisplayName(e.target.value); setUnsavedChanges(true); }} />
          </div>
          <div className="form-field">
            <label className="field-label">Bio</label>
            <textarea className="field-textarea" value={bio} onChange={(e) => { setBio(e.target.value); setUnsavedChanges(true); }} maxLength={300} />
            <span className="char-count">{bio.length}/300</span>
          </div>
          <div className="form-field">
            <label className="field-label">Job Title</label>
            <input className="field-input" value={job} onChange={(e) => { setJob(e.target.value); setUnsavedChanges(true); }} />
          </div>
          <div className="form-field">
            <label className="field-label">Company</label>
            <input className="field-input" value={company} onChange={(e) => { setCompany(e.target.value); setUnsavedChanges(true); }} />
          </div>
          <div className="form-field">
            <label className="field-label">Education</label>
            <input className="field-input" value={education} onChange={(e) => { setEducation(e.target.value); setUnsavedChanges(true); }} />
          </div>
          <div className="form-field">
            <label className="field-label">City</label>
            <input className="field-input" value={city} onChange={(e) => { setCity(e.target.value); setUnsavedChanges(true); }} />
          </div>
        </div>
      )}

      {/* Prompts Section */}
      {activeSection === 'prompts' && (
        <div className="prompts-section">
          <h3 className="section-heading">Prompts ({prompts.length}/3)</h3>
          <p className="section-hint">Share more about yourself with conversation starters</p>
          {prompts.map((prompt, idx) => (
            <div key={prompt.id} className="prompt-card">
              <h4 className="prompt-question">{prompt.question}</h4>
              <p className="prompt-answer">{prompt.answer}</p>
              <div className="prompt-actions">
                <button className="edit-prompt-btn" onClick={() => { setEditingPromptSlot(idx); setPromptAnswer(prompt.answer); }}>Edit</button>
                <button className="remove-prompt-btn" onClick={() => handleRemovePrompt(idx)}>Remove</button>
              </div>
            </div>
          ))}
          {prompts.length < 3 && (
            <button className="add-prompt-btn" onClick={() => setShowPromptSelector(true)}>
              + Add a Prompt
            </button>
          )}

          {/* Prompt Selector */}
          {showPromptSelector && (
            <div className="prompt-selector">
              <h4>Choose a prompt</h4>
              <div className="prompt-options">
                {PROMPT_OPTIONS.filter(q => !prompts.some(p => p.question === q)).map(question => (
                  <button key={question} className="prompt-option" onClick={() => handleAddPrompt(question)}>
                    {question}
                  </button>
                ))}
              </div>
              <button className="close-selector" onClick={() => setShowPromptSelector(false)}>Cancel</button>
            </div>
          )}

          {/* Prompt Answer Editor */}
          {editingPromptSlot >= 0 && (
            <div className="prompt-answer-editor">
              <h4>{PROMPT_OPTIONS[editingPromptSlot] || prompts[editingPromptSlot]?.question}</h4>
              <textarea
                className="answer-textarea"
                value={promptAnswer}
                onChange={(e) => setPromptAnswer(e.target.value)}
                placeholder="Write your answer..."
                maxLength={200}
              />
              <span className="char-count">{promptAnswer.length}/200</span>
              <div className="answer-actions">
                <button className="cancel-btn" onClick={() => setEditingPromptSlot(-1)}>Cancel</button>
                <button className="save-answer-btn" onClick={() => handleSavePrompt(prompts[editingPromptSlot]?.question || PROMPT_OPTIONS[editingPromptSlot] || '')}>Save</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Interests Section */}
      {activeSection === 'interests' && (
        <div className="interests-section">
          <h3 className="section-heading">Interests ({selectedInterests.length}/10)</h3>
          <p className="section-hint">Select up to 10 interests to show on your profile</p>
          <div className="selected-interests-display">
            {selectedInterests.map(interest => (
              <span key={interest} className="interest-chip selected" onClick={() => handleToggleInterest(interest)}>
                {interest} &#10005;
              </span>
            ))}
          </div>
          <div className="all-interests-grid">
            {AVAILABLE_INTERESTS.map(interest => (
              <button
                key={interest}
                className={`interest-option ${selectedInterests.includes(interest) ? 'selected' : ''}`}
                onClick={() => handleToggleInterest(interest)}
                disabled={!selectedInterests.includes(interest) && selectedInterests.length >= 10}
              >
                {interest}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Preferences Section */}
      {activeSection === 'preferences' && (
        <div className="preferences-section">
          <h3 className="section-heading">Preferences</h3>

          {/* Age Range */}
          <div className="preference-group">
            <label className="pref-label">Age Range: {preferences.ageMin} - {preferences.ageMax}</label>
            <div className="dual-slider">
              <input
                type="range"
                className="range-slider min-slider"
                min="18"
                max="65"
                value={preferences.ageMin}
                onChange={(e) => { setPreferences(prev => ({ ...prev, ageMin: Math.min(Number(e.target.value), prev.ageMax - 1) })); setUnsavedChanges(true); }}
              />
              <input
                type="range"
                className="range-slider max-slider"
                min="18"
                max="65"
                value={preferences.ageMax}
                onChange={(e) => { setPreferences(prev => ({ ...prev, ageMax: Math.max(Number(e.target.value), prev.ageMin + 1) })); setUnsavedChanges(true); }}
              />
            </div>
          </div>

          {/* Distance */}
          <div className="preference-group">
            <label className="pref-label">Maximum Distance: {preferences.distanceMax} km</label>
            <input
              type="range"
              className="range-slider distance-slider"
              min="1"
              max="200"
              value={preferences.distanceMax}
              onChange={(e) => { setPreferences(prev => ({ ...prev, distanceMax: Number(e.target.value) })); setUnsavedChanges(true); }}
            />
          </div>

          {/* Gender */}
          <div className="preference-group">
            <label className="pref-label">Show Me</label>
            <div className="gender-options">
              {GENDER_OPTIONS.map(gender => (
                <button
                  key={gender}
                  className={`gender-btn ${preferences.genders.includes(gender) ? 'selected' : ''}`}
                  onClick={() => handleGenderToggle(gender)}
                >
                  {gender}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Verification Section */}
      {activeSection === 'verification' && (
        <div className="verification-section">
          <h3 className="section-heading">Photo Verification</h3>
          <div className="verification-status">
            <div className={`status-badge ${verification.status}`}>
              {verification.status === 'verified' && <span className="badge-icon">&#10003;</span>}
              {verification.status === 'pending' && <span className="badge-icon">&#8987;</span>}
              {verification.status === 'rejected' && <span className="badge-icon">&#10005;</span>}
              <span className="badge-text">
                {verification.status === 'none' && 'Not Verified'}
                {verification.status === 'pending' && 'Verification Pending'}
                {verification.status === 'verified' && 'Verified'}
                {verification.status === 'rejected' && 'Verification Rejected'}
              </span>
            </div>
          </div>
          <p className="verification-description">
            Get a blue verification badge on your profile. Take a selfie matching the pose shown to prove you are real.
          </p>
          {verification.status !== 'verified' && verification.status !== 'pending' && (
            <button className="start-verification-btn" onClick={() => setShowVerificationModal(true)}>
              Start Verification
            </button>
          )}
          {verification.status === 'verified' && (
            <div className="verified-info">
              <p className="verified-date">Verified on {verification.submittedAt}</p>
            </div>
          )}
        </div>
      )}

      {/* Verification Modal */}
      {showVerificationModal && (
        <div className="verification-modal-overlay" onClick={() => setShowVerificationModal(false)}>
          <div className="verification-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Verify Your Profile</h3>
            <p>Take a selfie matching this pose to verify your identity:</p>
            <div className="pose-example">
              <div className="pose-placeholder">
                <span>&#9996;</span>
                <p>Peace sign pose</p>
              </div>
            </div>
            <div className="selfie-area">
              <div className="camera-placeholder">
                <span className="camera-icon">📸</span>
              </div>
            </div>
            <div className="verification-actions">
              <button className="cancel-btn" onClick={() => setShowVerificationModal(false)}>Cancel</button>
              <button className="submit-verification-btn" onClick={handleVerificationUpload}>Submit for Review</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileEditorPage;
