// ============================================================================
// QuantEdits - Brand Kit Manager
// Logo uploads, color palette, font selector, brand application, team sharing
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';

interface BrandKit {
  id: string;
  name: string;
  logos: BrandLogo[];
  colors: ColorPalette;
  fonts: BrandFont[];
  createdAt: string;
  updatedAt: string;
  isDefault: boolean;
  sharedWith: string[];
}

interface BrandLogo {
  id: string;
  name: string;
  url: string;
  variant: 'primary' | 'secondary' | 'icon' | 'wordmark';
  format: string;
  width: number;
  height: number;
}

interface ColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  custom: { name: string; value: string }[];
}

interface BrandFont {
  id: string;
  name: string;
  family: string;
  role: 'heading' | 'body' | 'accent';
  weight: string;
  url: string;
}

interface BrandKitPageProps {
  userId: string;
  teamId: string;
}

const BrandKitPage: React.FC<BrandKitPageProps> = ({ userId, teamId }) => {
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [selectedKit, setSelectedKit] = useState<BrandKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKitName, setNewKitName] = useState('');
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');

  useEffect(() => {
    const loadBrandKits = async () => {
      setLoading(true);
      try {
        const kits: BrandKit[] = [
          {
            id: 'kit-1', name: 'Primary Brand', isDefault: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sharedWith: ['team-member-1', 'team-member-2'],
            logos: [
              { id: 'logo-1', name: 'Main Logo', url: '/brands/logo-primary.png', variant: 'primary', format: 'png', width: 400, height: 100 },
              { id: 'logo-2', name: 'Icon', url: '/brands/logo-icon.png', variant: 'icon', format: 'png', width: 100, height: 100 },
              { id: 'logo-3', name: 'Wordmark', url: '/brands/logo-wordmark.svg', variant: 'wordmark', format: 'svg', width: 300, height: 60 },
            ],
            colors: { primary: '#6366f1', secondary: '#8b5cf6', accent: '#10b981', background: '#ffffff', text: '#1f2937', custom: [{ name: 'Warning', value: '#f59e0b' }, { name: 'Error', value: '#ef4444' }] },
            fonts: [
              { id: 'font-1', name: 'Inter Bold', family: 'Inter', role: 'heading', weight: '700', url: '/fonts/inter-bold.woff2' },
              { id: 'font-2', name: 'Inter Regular', family: 'Inter', role: 'body', weight: '400', url: '/fonts/inter-regular.woff2' },
              { id: 'font-3', name: 'Fira Code', family: 'Fira Code', role: 'accent', weight: '500', url: '/fonts/fira-code.woff2' },
            ],
          },
          {
            id: 'kit-2', name: 'Social Media', isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sharedWith: [],
            logos: [{ id: 'logo-4', name: 'Social Logo', url: '/brands/logo-social.png', variant: 'primary', format: 'png', width: 200, height: 200 }],
            colors: { primary: '#ec4899', secondary: '#f97316', accent: '#06b6d4', background: '#0f172a', text: '#f8fafc', custom: [] },
            fonts: [{ id: 'font-4', name: 'Poppins', family: 'Poppins', role: 'heading', weight: '600', url: '/fonts/poppins.woff2' }],
          },
        ];
        setBrandKits(kits);
        setSelectedKit(kits[0]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load brand kits');
      } finally {
        setLoading(false);
      }
    };
    loadBrandKits();
  }, [userId, teamId]);

  const handleCreateKit = useCallback(() => {
    if (!newKitName.trim()) return;
    const newKit: BrandKit = {
      id: `kit-${Date.now()}`, name: newKitName, isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sharedWith: [],
      logos: [], colors: { primary: '#000000', secondary: '#333333', accent: '#666666', background: '#ffffff', text: '#000000', custom: [] }, fonts: [],
    };
    setBrandKits(prev => [...prev, newKit]);
    setSelectedKit(newKit);
    setNewKitName('');
    setShowCreateModal(false);
  }, [newKitName]);

  const handleUpdateColor = useCallback((colorKey: string, value: string) => {
    if (!selectedKit) return;
    setSelectedKit(prev => prev ? { ...prev, colors: { ...prev.colors, [colorKey]: value } } : null);
    setBrandKits(prev => prev.map(k => k.id === selectedKit.id ? { ...k, colors: { ...k.colors, [colorKey]: value } } : k));
  }, [selectedKit]);

  const handleAddCustomColor = useCallback(() => {
    if (!selectedKit) return;
    const newColor = { name: `Color ${selectedKit.colors.custom.length + 1}`, value: '#000000' };
    const updated = { ...selectedKit, colors: { ...selectedKit.colors, custom: [...selectedKit.colors.custom, newColor] } };
    setSelectedKit(updated);
    setBrandKits(prev => prev.map(k => k.id === selectedKit.id ? updated : k));
  }, [selectedKit]);

  const handleUploadLogo = useCallback((variant: BrandLogo['variant']) => {
    if (!selectedKit) return;
    const newLogo: BrandLogo = { id: `logo-${Date.now()}`, name: `New ${variant} Logo`, url: '/brands/placeholder.png', variant, format: 'png', width: 200, height: 200 };
    const updated = { ...selectedKit, logos: [...selectedKit.logos, newLogo] };
    setSelectedKit(updated);
    setBrandKits(prev => prev.map(k => k.id === selectedKit.id ? updated : k));
  }, [selectedKit]);

  const handleRemoveLogo = useCallback((logoId: string) => {
    if (!selectedKit) return;
    const updated = { ...selectedKit, logos: selectedKit.logos.filter(l => l.id !== logoId) };
    setSelectedKit(updated);
    setBrandKits(prev => prev.map(k => k.id === selectedKit.id ? updated : k));
  }, [selectedKit]);

  const handleAddFont = useCallback((role: BrandFont['role']) => {
    if (!selectedKit) return;
    const newFont: BrandFont = { id: `font-${Date.now()}`, name: 'New Font', family: 'Arial', role, weight: '400', url: '' };
    const updated = { ...selectedKit, fonts: [...selectedKit.fonts, newFont] };
    setSelectedKit(updated);
    setBrandKits(prev => prev.map(k => k.id === selectedKit.id ? updated : k));
  }, [selectedKit]);

  const handleShare = useCallback(() => {
    if (!shareEmail.trim() || !selectedKit) return;
    const updated = { ...selectedKit, sharedWith: [...selectedKit.sharedWith, shareEmail] };
    setSelectedKit(updated);
    setBrandKits(prev => prev.map(k => k.id === selectedKit.id ? updated : k));
    setShareEmail('');
    setShowShareModal(false);
  }, [shareEmail, selectedKit]);

  const handleSetDefault = useCallback((kitId: string) => {
    setBrandKits(prev => prev.map(k => ({ ...k, isDefault: k.id === kitId })));
  }, []);

  const handleDeleteKit = useCallback((kitId: string) => {
    setBrandKits(prev => prev.filter(k => k.id !== kitId));
    if (selectedKit?.id === kitId) setSelectedKit(null);
  }, [selectedKit]);

  if (loading) {
    return (<div className="brand-loading"><div className="loading-spinner" /><p>Loading brand kits...</p></div>);
  }

  if (error) {
    return (<div className="brand-error"><h3>Error</h3><p>{error}</p><button onClick={() => window.location.reload()}>Retry</button></div>);
  }

  return (
    <div className="brand-kit-page">
      <header className="brand-header">
        <h1>Brand Kit</h1>
        <button className="create-kit-btn" onClick={() => setShowCreateModal(true)}>+ New Brand Kit</button>
      </header>

      <div className="brand-layout">
        <div className="kit-list">
          <h3>Your Brand Kits</h3>
          {brandKits.map(kit => (
            <div key={kit.id} className={`kit-item ${selectedKit?.id === kit.id ? 'active' : ''}`} onClick={() => setSelectedKit(kit)}>
              <div className="kit-colors-preview">
                <div className="mini-swatch" style={{ backgroundColor: kit.colors.primary }} />
                <div className="mini-swatch" style={{ backgroundColor: kit.colors.secondary }} />
                <div className="mini-swatch" style={{ backgroundColor: kit.colors.accent }} />
              </div>
              <div className="kit-info">
                <span className="kit-name">{kit.name}</span>
                {kit.isDefault && <span className="default-badge">Default</span>}
              </div>
            </div>
          ))}
        </div>

        {selectedKit && (
          <div className="kit-editor">
            <div className="kit-editor-header">
              <h2>{selectedKit.name}</h2>
              <div className="kit-actions">
                <button onClick={() => handleSetDefault(selectedKit.id)} disabled={selectedKit.isDefault}>Set as Default</button>
                <button onClick={() => setShowShareModal(true)}>Share</button>
                <button className="delete-btn" onClick={() => handleDeleteKit(selectedKit.id)}>Delete</button>
              </div>
            </div>

            <section className="brand-section">
              <h3>Logos</h3>
              <div className="logos-grid">
                {selectedKit.logos.map(logo => (
                  <div key={logo.id} className="logo-card">
                    <img src={logo.url} alt={logo.name} className="logo-preview" />
                    <div className="logo-info">
                      <span className="logo-name">{logo.name}</span>
                      <span className="logo-variant">{logo.variant}</span>
                      <span className="logo-dims">{logo.width}x{logo.height}</span>
                    </div>
                    <button className="remove-logo" onClick={() => handleRemoveLogo(logo.id)}>Remove</button>
                  </div>
                ))}
                <div className="logo-upload-slots">
                  {(['primary', 'secondary', 'icon', 'wordmark'] as BrandLogo['variant'][]).map(variant => (
                    <button key={variant} className="upload-logo-btn" onClick={() => handleUploadLogo(variant)}>
                      + {variant}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="brand-section">
              <h3>Color Palette</h3>
              <div className="color-palette">
                {(['primary', 'secondary', 'accent', 'background', 'text'] as const).map(colorKey => (
                  <div key={colorKey} className="color-item">
                    <div className="color-swatch-large" style={{ backgroundColor: selectedKit.colors[colorKey] }} onClick={() => setEditingColor(colorKey)} />
                    <span className="color-label">{colorKey}</span>
                    <span className="color-value">{selectedKit.colors[colorKey]}</span>
                    {editingColor === colorKey && (
                      <input type="color" value={selectedKit.colors[colorKey]} onChange={(e) => handleUpdateColor(colorKey, e.target.value)} onBlur={() => setEditingColor(null)} autoFocus />
                    )}
                  </div>
                ))}
                {selectedKit.colors.custom.map((color, i) => (
                  <div key={i} className="color-item custom">
                    <div className="color-swatch-large" style={{ backgroundColor: color.value }} />
                    <span className="color-label">{color.name}</span>
                    <span className="color-value">{color.value}</span>
                  </div>
                ))}
                <button className="add-color-btn" onClick={handleAddCustomColor}>+ Add Color</button>
              </div>
            </section>

            <section className="brand-section">
              <h3>Fonts</h3>
              <div className="fonts-list">
                {selectedKit.fonts.map(font => (
                  <div key={font.id} className="font-card">
                    <div className="font-preview" style={{ fontFamily: font.family, fontWeight: font.weight }}>
                      Aa Bb Cc 123
                    </div>
                    <div className="font-info">
                      <span className="font-name">{font.name}</span>
                      <span className="font-role">{font.role}</span>
                      <span className="font-family">{font.family} {font.weight}</span>
                    </div>
                  </div>
                ))}
                <div className="font-add-row">
                  <button onClick={() => handleAddFont('heading')}>+ Heading Font</button>
                  <button onClick={() => handleAddFont('body')}>+ Body Font</button>
                  <button onClick={() => handleAddFont('accent')}>+ Accent Font</button>
                </div>
              </div>
            </section>

            <section className="brand-section">
              <h3>Team Access</h3>
              <div className="shared-list">
                {selectedKit.sharedWith.length === 0 ? (
                  <p className="no-shares">Not shared with anyone yet</p>
                ) : (
                  selectedKit.sharedWith.map((email, i) => (
                    <div key={i} className="shared-member">
                      <span>{email}</span>
                      <button className="remove-share">Remove</button>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create Brand Kit</h2>
            <input type="text" value={newKitName} onChange={(e) => setNewKitName(e.target.value)} placeholder="Brand kit name" onKeyDown={(e) => e.key === 'Enter' && handleCreateKit()} />
            <div className="modal-actions">
              <button onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button onClick={handleCreateKit} disabled={!newKitName.trim()}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Share Brand Kit</h2>
            <input type="email" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} placeholder="Email address" />
            <div className="modal-actions">
              <button onClick={() => setShowShareModal(false)}>Cancel</button>
              <button onClick={handleShare} disabled={!shareEmail.trim()}>Share</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BrandKitPage;
