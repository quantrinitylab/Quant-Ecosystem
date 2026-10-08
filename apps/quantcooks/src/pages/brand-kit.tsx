// ============================================================================
// QuantEdits - Brand Kit Manager
// Brand kits are loaded from the real GET /api/brand-kit endpoint and every
// mutation (create, update colors/fonts, set default, remove logo, delete)
// goes through the real API. Logo upload and sharing have no backend, so they
// show honest "not available" states instead of fabricated entries.
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { PageTransition } from '../components/PageTransition';
import { apiFetchRaw } from '@quant/api-client';

/** Matches the backend BrandKit shape exactly. */
interface BrandKit {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  fonts: {
    heading: string;
    body: string;
    accent: string;
  };
  logos: {
    id: string;
    url: string;
    variant: string;
  }[];
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface BrandKitPageProps {
  userId: string;
  teamId: string;
}

type FontRole = keyof BrandKit['fonts'];
type ColorKey = keyof BrandKit['colors'];

const FONT_ROLES: { role: FontRole; label: string }[] = [
  { role: 'heading', label: 'Heading' },
  { role: 'body', label: 'Body' },
  { role: 'accent', label: 'Accent' },
];

const COLOR_KEYS: { key: ColorKey; label: string }[] = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'background', label: 'Background' },
  { key: 'text', label: 'Text' },
];

const LOGO_VARIANTS = ['primary', 'secondary', 'icon', 'wordmark'];

const BrandKitPage: React.FC<BrandKitPageProps> = ({ userId, teamId }) => {
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [selectedKit, setSelectedKit] = useState<BrandKit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKitName, setNewKitName] = useState('');
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [editingFont, setEditingFont] = useState<FontRole | null>(null);
  const [fontInput, setFontInput] = useState('');

  const loadBrandKits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetchRaw('/api/brand-kit');
      const payload = (await res.json().catch(() => null)) as ApiResponse<BrandKit[]> | null;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error?.message || `Failed to load brand kits (HTTP ${res.status})`);
      }
      const kits = payload.data ?? [];
      setBrandKits(kits);
      setSelectedKit((prev) => {
        if (prev) {
          const stillThere = kits.find((k) => k.id === prev.id);
          if (stillThere) return stillThere;
        }
        return kits.find((k) => k.isDefault) ?? kits[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brand kits');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBrandKits();
  }, [loadBrandKits, userId, teamId]);

  const updateKit = useCallback(
    async (kitId: string, patch: Record<string, unknown>): Promise<BrandKit | null> => {
      setActionError(null);
      try {
        const res = await apiFetchRaw(`/api/brand-kit/${encodeURIComponent(kitId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const payload = (await res.json().catch(() => null)) as ApiResponse<BrandKit> | null;
        if (!res.ok || !payload?.success || !payload.data) {
          throw new Error(payload?.error?.message || `Update failed (HTTP ${res.status})`);
        }
        const updated = payload.data;
        setBrandKits((prev) => prev.map((k) => (k.id === kitId ? updated : k)));
        setSelectedKit(updated);
        return updated;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Update failed');
        return null;
      }
    },
    [],
  );

  const handleCreateKit = useCallback(async () => {
    const name = newKitName.trim();
    if (!name) return;
    setActionError(null);
    try {
      const res = await apiFetchRaw('/api/brand-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const payload = (await res.json().catch(() => null)) as ApiResponse<BrandKit> | null;
      if (!res.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.error?.message || `Create failed (HTTP ${res.status})`);
      }
      setBrandKits((prev) => [...prev, payload.data!]);
      setSelectedKit(payload.data);
      setNewKitName('');
      setShowCreateModal(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Create failed');
    }
  }, [newKitName]);

  const handleUpdateColor = useCallback(
    (colorKey: ColorKey, value: string) => {
      if (!selectedKit) return;
      void updateKit(selectedKit.id, {
        colors: { ...selectedKit.colors, [colorKey]: value },
      });
    },
    [selectedKit, updateKit],
  );

  const handleRemoveLogo = useCallback(
    (logoId: string) => {
      if (!selectedKit) return;
      void updateKit(selectedKit.id, {
        logos: selectedKit.logos.filter((l) => l.id !== logoId),
      });
    },
    [selectedKit, updateKit],
  );

  const handleSaveFont = useCallback(
    (role: FontRole) => {
      if (!selectedKit || !fontInput.trim()) return;
      void updateKit(selectedKit.id, {
        fonts: { ...selectedKit.fonts, [role]: fontInput.trim() },
      }).then(() => {
        setEditingFont(null);
        setFontInput('');
      });
    },
    [selectedKit, fontInput, updateKit],
  );

  const handleSetDefault = useCallback(
    (kitId: string) => {
      void updateKit(kitId, { isDefault: true }).then(() => {
        // Only one kit can be default — refresh the list so the old default
        // clears its badge from real server state.
        void loadBrandKits();
      });
    },
    [updateKit, loadBrandKits],
  );

  const handleDeleteKit = useCallback(
    async (kitId: string) => {
      setActionError(null);
      try {
        const res = await apiFetchRaw(`/api/brand-kit/${encodeURIComponent(kitId)}`, {
          method: 'DELETE',
        });
        const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.error?.message || `Delete failed (HTTP ${res.status})`);
        }
        setBrandKits((prev) => prev.filter((k) => k.id !== kitId));
        setSelectedKit((prev) => (prev?.id === kitId ? null : prev));
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Delete failed');
      }
    },
    [],
  );

  if (loading) {
    return (
      <div className="brand-loading">
        <div className="loading-spinner" />
        <p>Loading brand kits...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="brand-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={() => void loadBrandKits()}>Retry</button>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="brand-kit-page">
        <header className="brand-header">
          <h1>Brand Kit</h1>
          <button className="create-kit-btn" onClick={() => setShowCreateModal(true)}>
            + New Brand Kit
          </button>
        </header>

        {actionError && <p className="brand-action-error">{actionError}</p>}

        <div className="brand-layout">
          <div className="kit-list">
            <h3>Your Brand Kits</h3>
            {brandKits.length === 0 ? (
              <p className="kits-empty">No brand kits yet. Create one to get started.</p>
            ) : (
              brandKits.map((kit) => (
                <div
                  key={kit.id}
                  className={`kit-item ${selectedKit?.id === kit.id ? 'active' : ''}`}
                  onClick={() => setSelectedKit(kit)}
                >
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
              ))
            )}
          </div>

          {selectedKit && (
            <div className="kit-editor">
              <div className="kit-editor-header">
                <h2>{selectedKit.name}</h2>
                <div className="kit-actions">
                  <button
                    onClick={() => handleSetDefault(selectedKit.id)}
                    disabled={selectedKit.isDefault}
                  >
                    Set as Default
                  </button>
                  <button
                    className="delete-btn"
                    onClick={() => void handleDeleteKit(selectedKit.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <section className="brand-section">
                <h3>Logos</h3>
                <div className="logos-grid">
                  {selectedKit.logos.map((logo) => (
                    <div key={logo.id} className="logo-card">
                      <img src={logo.url} alt={logo.variant} className="logo-preview" />
                      <div className="logo-info">
                        <span className="logo-variant">{logo.variant}</span>
                      </div>
                      <button className="remove-logo" onClick={() => handleRemoveLogo(logo.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                  <div className="logo-upload-slots">
                    {LOGO_VARIANTS.map((variant) => (
                      <button
                        key={variant}
                        className="upload-logo-btn"
                        disabled
                        title="Logo upload isn't available yet"
                      >
                        + {variant}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="unavailable-note">Logo upload isn&apos;t available yet.</p>
              </section>

              <section className="brand-section">
                <h3>Color Palette</h3>
                <div className="color-palette">
                  {COLOR_KEYS.map(({ key, label }) => (
                    <div key={key} className="color-item">
                      <div
                        className="color-swatch-large"
                        style={{ backgroundColor: selectedKit.colors[key] }}
                        onClick={() => setEditingColor(key)}
                      />
                      <span className="color-label">{label}</span>
                      <span className="color-value">{selectedKit.colors[key]}</span>
                      {editingColor === key && (
                        <input
                          type="color"
                          value={selectedKit.colors[key]}
                          onChange={(e) => handleUpdateColor(key, e.target.value)}
                          onBlur={() => setEditingColor(null)}
                          autoFocus
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="brand-section">
                <h3>Fonts</h3>
                <div className="fonts-list">
                  {FONT_ROLES.map(({ role, label }) => (
                    <div key={role} className="font-card">
                      <div className="font-preview" style={{ fontFamily: selectedKit.fonts[role] }}>
                        Aa Bb Cc 123
                      </div>
                      <div className="font-info">
                        <span className="font-name">{selectedKit.fonts[role] || 'Not set'}</span>
                        <span className="font-role">{label}</span>
                      </div>
                      {editingFont === role ? (
                        <div className="font-edit-row">
                          <input
                            type="text"
                            value={fontInput}
                            onChange={(e) => setFontInput(e.target.value)}
                            placeholder="Font family name"
                            onKeyDown={(e) => e.key === 'Enter' && handleSaveFont(role)}
                            autoFocus
                          />
                          <button onClick={() => handleSaveFont(role)}>Save</button>
                          <button
                            onClick={() => {
                              setEditingFont(null);
                              setFontInput('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingFont(role);
                            setFontInput(selectedKit.fonts[role] ?? '');
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h2>Create Brand Kit</h2>
              <input
                type="text"
                value={newKitName}
                onChange={(e) => setNewKitName(e.target.value)}
                placeholder="Brand kit name"
                onKeyDown={(e) => e.key === 'Enter' && void handleCreateKit()}
              />
              <div className="modal-actions">
                <button onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button onClick={() => void handleCreateKit()} disabled={!newKitName.trim()}>
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default BrandKitPage;
