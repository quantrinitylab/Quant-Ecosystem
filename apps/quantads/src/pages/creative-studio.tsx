// ============================================================================
// QuantAds - Creative Studio Page
// Template gallery, layers, preview across placements, export
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';

interface Template {
  id: string;
  name: string;
  category: 'social' | 'display' | 'video' | 'story' | 'email';
  thumbnail: string;
  dimensions: { width: number; height: number };
  layers: Layer[];
  tags: string[];
  usageCount: number;
}

interface Layer {
  id: string;
  type: 'text' | 'image' | 'button' | 'shape' | 'logo';
  name: string;
  visible: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  properties: Record<string, any>;
}

interface Project {
  id: string;
  name: string;
  template: Template;
  layers: Layer[];
  lastModified: string;
  exported: boolean;
}

interface PlacementPreview {
  name: string;
  dimensions: { width: number; height: number };
  scale: number;
}

interface CreativeStudioPageProps {
  accountId?: string;
}

const PLACEMENT_PREVIEWS: PlacementPreview[] = [
  { name: 'Feed Post', dimensions: { width: 1080, height: 1080 }, scale: 0.2 },
  { name: 'Story', dimensions: { width: 1080, height: 1920 }, scale: 0.15 },
  { name: 'Banner', dimensions: { width: 728, height: 90 }, scale: 0.4 },
  { name: 'Leaderboard', dimensions: { width: 970, height: 250 }, scale: 0.3 },
  { name: 'Mobile', dimensions: { width: 320, height: 480 }, scale: 0.3 },
];

const CreativeStudioPage: React.FC<CreativeStudioPageProps> = ({ accountId: _accountId }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeView, setActiveView] = useState<'gallery' | 'editor' | 'projects'>('gallery');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showExport, setShowExport] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [projectName, setProjectName] = useState<string>('');
  const [undoStack, setUndoStack] = useState<Layer[][]>([]);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/creative-studio/templates');
      if (!response.ok) throw new Error('Failed to load templates');
      const data = await response.json();
      setTemplates(data.templates || []);
      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load creative studio');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const startFromTemplate = useCallback((template: Template) => {
    setSelectedTemplate(template);
    setLayers(template.layers.map((l) => ({ ...l })));
    setProjectName(`${template.name} - ${new Date().toLocaleDateString()}`);
    setActiveView('editor');
    setUndoStack([]);
  }, []);

  const openProject = useCallback((project: Project) => {
    setCurrentProject(project);
    setSelectedTemplate(project.template);
    setLayers(project.layers.map((l) => ({ ...l })));
    setProjectName(project.name);
    setActiveView('editor');
  }, []);

  const saveUndoState = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-20), layers.map((l) => ({ ...l }))]);
  }, [layers]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    if (prev) setLayers(prev);
    setUndoStack((s) => s.slice(0, -1));
  }, [undoStack]);

  const updateLayer = useCallback(
    (layerId: string, updates: Partial<Layer>) => {
      saveUndoState();
      setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, ...updates } : l)));
    },
    [saveUndoState],
  );

  const addLayer = useCallback(
    (type: Layer['type']) => {
      saveUndoState();
      const newLayer: Layer = {
        id: `layer_${Date.now()}`,
        type,
        name: `New ${type}`,
        visible: true,
        locked: false,
        x: 50,
        y: 50,
        width: type === 'text' ? 200 : 100,
        height: type === 'text' ? 40 : 100,
        rotation: 0,
        opacity: 100,
        properties:
          type === 'text'
            ? {
                content: 'New Text',
                fontSize: 24,
                fontFamily: 'Inter',
                fontWeight: 'bold',
                color: '#000000',
                alignment: 'center',
              }
            : type === 'button'
              ? {
                  text: 'Click Here',
                  backgroundColor: '#3B82F6',
                  textColor: '#FFFFFF',
                  borderRadius: 8,
                  fontSize: 16,
                }
              : type === 'image'
                ? { src: '', fit: 'cover', borderRadius: 0 }
                : {},
      };
      setLayers((prev) => [...prev, newLayer]);
      setSelectedLayerId(newLayer.id);
    },
    [saveUndoState],
  );

  const deleteLayer = useCallback(
    (layerId: string) => {
      saveUndoState();
      setLayers((prev) => prev.filter((l) => l.id !== layerId));
      if (selectedLayerId === layerId) setSelectedLayerId(null);
    },
    [selectedLayerId, saveUndoState],
  );

  const moveLayer = useCallback(
    (layerId: string, direction: 'up' | 'down') => {
      saveUndoState();
      setLayers((prev) => {
        const idx = prev.findIndex((l) => l.id === layerId);
        if (idx < 0) return prev;
        const newLayers = [...prev];
        const targetIdx = direction === 'up' ? idx + 1 : idx - 1;
        if (targetIdx < 0 || targetIdx >= newLayers.length) return prev;
        const a = newLayers[idx];
        const b = newLayers[targetIdx];
        if (a && b) {
          newLayers[idx] = b;
          newLayers[targetIdx] = a;
        }
        return newLayers;
      });
    },
    [saveUndoState],
  );

  const saveProject = useCallback(async () => {
    try {
      const body = { name: projectName, templateId: selectedTemplate?.id, layers };
      const response = await fetch('/api/creative-studio/projects', {
        method: currentProject ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentProject ? { ...body, id: currentProject.id } : body),
      });
      if (!response.ok) throw new Error('Failed to save');
      const saved = await response.json();
      setCurrentProject(saved);
    } catch (err: any) {
      setError(err.message);
    }
  }, [projectName, selectedTemplate, layers, currentProject]);

  const exportCreative = useCallback(
    async (format: 'png' | 'jpg' | 'svg' | 'pdf') => {
      setExporting(true);
      try {
        const response = await fetch('/api/creative-studio/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layers, format, dimensions: selectedTemplate?.dimensions }),
        });
        if (!response.ok) throw new Error('Export failed');
        setShowExport(false);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setExporting(false);
      }
    },
    [layers, selectedTemplate],
  );

  const selectedLayer = layers.find((l) => l.id === selectedLayerId);

  const filteredTemplates = templates.filter((t) => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  if (loading && templates.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500" />
        <span className="ml-3 text-gray-500">Loading Creative Studio...</span>
      </div>
    );
  }

  if (error && templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Studio Error</div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button onClick={fetchTemplates} className="px-6 py-2 bg-violet-500 text-white rounded-lg">
          Retry
        </button>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', ...spring.gentle }}
    >
      {activeView === 'gallery' && (
        <div className="max-w-7xl mx-auto p-6">
          <header className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Creative Studio</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveView('projects')}
                className="px-4 py-2 border border-violet-500 text-violet-600 rounded-lg"
              >
                My Projects ({projects.length})
              </button>
            </div>
          </header>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {['all', 'social', 'display', 'video', 'story', 'email'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded text-sm capitalize ${categoryFilter === cat ? 'bg-white shadow font-medium' : 'text-gray-600'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="flex-1 max-w-sm px-4 py-2 border rounded-lg"
            />
          </div>

          {filteredTemplates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="text-6xl mb-4">🎨</div>
              <h3 className="text-xl font-semibold text-gray-700">No templates found</h3>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => startFromTemplate(template)}
                className="group bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-all text-left"
              >
                <div className="aspect-square bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center text-4xl group-hover:scale-105 transition-transform">
                  🖼
                </div>
                <div className="p-3">
                  <h4 className="font-medium text-sm">{template.name}</h4>
                  <p className="text-xs text-gray-500">
                    {template.dimensions.width}x{template.dimensions.height} - {template.category}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Used {template.usageCount} times</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeView === 'projects' && (
        <div className="max-w-7xl mx-auto p-6">
          <header className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-900">My Projects</h1>
            <button
              onClick={() => setActiveView('gallery')}
              className="px-4 py-2 text-violet-600 hover:bg-violet-50 rounded-lg"
            >
              Back to Gallery
            </button>
          </header>
          {projects.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              No projects yet. Start from a template to create one.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => openProject(project)}
                  className="bg-white rounded-xl shadow-sm border p-4 text-left hover:shadow-md"
                >
                  <div className="aspect-video bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                    🎨
                  </div>
                  <h4 className="font-medium text-sm">{project.name}</h4>
                  <p className="text-xs text-gray-500">
                    {new Date(project.lastModified).toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeView === 'editor' && selectedTemplate && (
        <div className="flex h-screen">
          <div className="w-64 bg-white border-r overflow-y-auto">
            <div className="p-4 border-b">
              <button
                onClick={() => setActiveView('gallery')}
                className="text-sm text-violet-600 mb-2 hover:underline"
              >
                Back to Gallery
              </button>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="w-full px-2 py-1 border rounded text-sm"
              />
            </div>
            <div className="p-4 border-b">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Add Layer</h3>
              <div className="flex gap-1 flex-wrap">
                {(['text', 'image', 'button', 'shape'] as Layer['type'][]).map((type) => (
                  <button
                    key={type}
                    onClick={() => addLayer(type)}
                    className="px-2 py-1 bg-gray-100 rounded text-xs hover:bg-violet-100 capitalize"
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Layers</h3>
              <div className="space-y-1">
                {[...layers].reverse().map((layer) => (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer ${selectedLayerId === layer.id ? 'bg-violet-100' : 'hover:bg-gray-50'}`}
                  >
                    <span className="text-xs">
                      {layer.type === 'text'
                        ? 'T'
                        : layer.type === 'image'
                          ? '🖼'
                          : layer.type === 'button'
                            ? '⬜'
                            : '◆'}
                    </span>
                    <span className="text-sm truncate flex-1">{layer.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateLayer(layer.id, { visible: !layer.visible });
                      }}
                      className={`text-xs ${layer.visible ? 'text-gray-600' : 'text-gray-300'}`}
                    >
                      {layer.visible ? '👁' : '👁‍🗨'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 bg-gray-100 p-8 overflow-auto flex items-center justify-center">
            <div
              className="bg-white shadow-lg"
              style={{
                width: selectedTemplate.dimensions.width * 0.5,
                height: selectedTemplate.dimensions.height * 0.5,
                position: 'relative',
              }}
            >
              {layers
                .filter((l) => l.visible)
                .map((layer) => (
                  <div
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`absolute cursor-pointer ${selectedLayerId === layer.id ? 'ring-2 ring-violet-500' : ''}`}
                    style={{
                      left: layer.x * 0.5,
                      top: layer.y * 0.5,
                      width: layer.width * 0.5,
                      height: layer.height * 0.5,
                      opacity: layer.opacity / 100,
                      transform: `rotate(${layer.rotation}deg)`,
                    }}
                  >
                    {layer.type === 'text' && (
                      <div className="w-full h-full flex items-center justify-center text-sm font-medium truncate">
                        {layer.properties.content || 'Text'}
                      </div>
                    )}
                    {layer.type === 'image' && (
                      <div className="w-full h-full bg-gray-200 rounded flex items-center justify-center text-xs">
                        IMG
                      </div>
                    )}
                    {layer.type === 'button' && (
                      <div
                        className="w-full h-full rounded flex items-center justify-center text-xs text-white"
                        style={{ backgroundColor: layer.properties.backgroundColor || '#3B82F6' }}
                      >
                        {layer.properties.text || 'Button'}
                      </div>
                    )}
                    {layer.type === 'shape' && (
                      <div className="w-full h-full bg-gray-300 rounded" />
                    )}
                  </div>
                ))}
            </div>
          </div>

          <div className="w-72 bg-white border-l overflow-y-auto">
            <div className="p-4 border-b flex gap-2">
              <button
                onClick={saveProject}
                className="flex-1 py-2 bg-violet-500 text-white rounded text-sm hover:bg-violet-600"
              >
                Save
              </button>
              <button
                onClick={() => setShowExport(true)}
                className="flex-1 py-2 border border-violet-500 text-violet-600 rounded text-sm hover:bg-violet-50"
              >
                Export
              </button>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="py-2 px-3 border rounded text-sm hover:bg-gray-50"
              >
                👁
              </button>
            </div>
            <div className="p-4 border-b">
              <button
                onClick={undo}
                disabled={undoStack.length === 0}
                className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-30"
              >
                Undo
              </button>
            </div>
            {selectedLayer && (
              <div className="p-4 space-y-4">
                <h3 className="text-xs font-medium text-gray-500 uppercase">Properties</h3>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={selectedLayer.name}
                    onChange={(e) => updateLayer(selectedLayer.id, { name: e.target.value })}
                    className="w-full px-2 py-1 border rounded text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-600">X</label>
                    <input
                      type="number"
                      value={selectedLayer.x}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, { x: parseInt(e.target.value) })
                      }
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">Y</label>
                    <input
                      type="number"
                      value={selectedLayer.y}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, { y: parseInt(e.target.value) })
                      }
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">W</label>
                    <input
                      type="number"
                      value={selectedLayer.width}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, { width: parseInt(e.target.value) })
                      }
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600">H</label>
                    <input
                      type="number"
                      value={selectedLayer.height}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, { height: parseInt(e.target.value) })
                      }
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Opacity</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={selectedLayer.opacity}
                    onChange={(e) =>
                      updateLayer(selectedLayer.id, { opacity: parseInt(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600">Rotation</label>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    value={selectedLayer.rotation}
                    onChange={(e) =>
                      updateLayer(selectedLayer.id, { rotation: parseInt(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
                {selectedLayer.type === 'text' && (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Text</label>
                    <input
                      type="text"
                      value={selectedLayer.properties.content || ''}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, {
                          properties: { ...selectedLayer.properties, content: e.target.value },
                        })
                      }
                      className="w-full px-2 py-1 border rounded text-sm"
                    />
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => moveLayer(selectedLayer.id, 'up')}
                    className="text-xs px-2 py-1 bg-gray-100 rounded"
                  >
                    Move Up
                  </button>
                  <button
                    onClick={() => moveLayer(selectedLayer.id, 'down')}
                    className="text-xs px-2 py-1 bg-gray-100 rounded"
                  >
                    Move Down
                  </button>
                  <button
                    onClick={() => deleteLayer(selectedLayer.id)}
                    className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
            {showPreview && (
              <div className="p-4 border-t">
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-3">
                  Placement Previews
                </h3>
                <div className="space-y-3">
                  {PLACEMENT_PREVIEWS.map((pp) => (
                    <div key={pp.name}>
                      <p className="text-xs text-gray-600 mb-1">
                        {pp.name} ({pp.dimensions.width}x{pp.dimensions.height})
                      </p>
                      <div
                        className="bg-gray-100 rounded border"
                        style={{
                          width: pp.dimensions.width * pp.scale,
                          height: pp.dimensions.height * pp.scale,
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {showExport && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-96">
                <h2 className="text-lg font-semibold mb-4">Export Creative</h2>
                <div className="grid grid-cols-2 gap-3">
                  {(['png', 'jpg', 'svg', 'pdf'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => exportCreative(fmt)}
                      disabled={exporting}
                      className="p-4 border rounded-lg hover:bg-violet-50 uppercase font-medium text-sm disabled:opacity-50"
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowExport(false)}
                  className="mt-4 w-full py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

export default CreativeStudioPage;
