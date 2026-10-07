// ============================================================================
// QuantEdits - useProject Hook
// Project state: load, save, metadata, recent projects, auto-save
// ============================================================================

import { useState, useCallback, useEffect, useRef } from 'react';

interface ProjectMetadata {
  id: string;
  title: string;
  type: 'video' | 'photo' | 'design';
  resolution: { width: number; height: number };
  fps: number;
  duration: number;
  createdAt: string;
  updatedAt: string;
  size: number;
  thumbnail: string;
}

interface ProjectState {
  metadata: ProjectMetadata | null;
  isDirty: boolean;
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  lastSaved: string | null;
  autoSaveEnabled: boolean;
  autoSaveInterval: number;
}

interface UseProjectReturn {
  state: ProjectState;
  loadProject: (id: string) => Promise<void>;
  saveProject: () => Promise<void>;
  createProject: (title: string, type: ProjectMetadata['type'], resolution: { width: number; height: number }) => Promise<string>;
  updateMetadata: (updates: Partial<ProjectMetadata>) => void;
  markDirty: () => void;
  toggleAutoSave: () => void;
  setAutoSaveInterval: (ms: number) => void;
  exportProject: () => Promise<string>;
  deleteProject: () => Promise<boolean>;
}

export function useProject(): UseProjectReturn {
  const [state, setState] = useState<ProjectState>({
    metadata: null,
    isDirty: false,
    isSaving: false,
    isLoading: false,
    error: null,
    lastSaved: null,
    autoSaveEnabled: true,
    autoSaveInterval: 30000,
  });

  const autoSaveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = state.isDirty;
  }, [state.isDirty]);

  useEffect(() => {
    if (state.autoSaveEnabled && state.metadata) {
      autoSaveRef.current = setInterval(() => {
        if (dirtyRef.current) {
          saveProject();
        }
      }, state.autoSaveInterval);
      return () => { if (autoSaveRef.current) clearInterval(autoSaveRef.current); };
    }
    return undefined;
  }, [state.autoSaveEnabled, state.autoSaveInterval, state.metadata]);

  const loadProject = useCallback(async (id: string) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const metadata: ProjectMetadata = {
        id,
        title: `Project ${id}`,
        type: 'video',
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        duration: 120,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date().toISOString(),
        size: 150 * 1024 * 1024,
        thumbnail: `/thumbnails/${id}.jpg`,
      };
      setState(prev => ({ ...prev, metadata, isLoading: false, isDirty: false }));
    } catch (err) {
      setState(prev => ({ ...prev, isLoading: false, error: err instanceof Error ? err.message : 'Failed to load' }));
    }
  }, []);

  const saveProject = useCallback(async () => {
    if (!state.metadata) return;
    setState(prev => ({ ...prev, isSaving: true }));
    try {
      await new Promise(resolve => setTimeout(resolve, 300));
      const now = new Date().toISOString();
      setState(prev => ({
        ...prev,
        isSaving: false,
        isDirty: false,
        lastSaved: now,
        metadata: prev.metadata ? { ...prev.metadata, updatedAt: now } : null,
      }));
    } catch (err) {
      setState(prev => ({ ...prev, isSaving: false, error: 'Failed to save' }));
    }
  }, [state.metadata]);

  const createProject = useCallback(async (title: string, type: ProjectMetadata['type'], resolution: { width: number; height: number }): Promise<string> => {
    const id = `project-${Date.now()}`;
    const metadata: ProjectMetadata = {
      id, title, type, resolution, fps: 30, duration: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      size: 0, thumbnail: '',
    };
    setState(prev => ({ ...prev, metadata, isDirty: false, lastSaved: metadata.createdAt }));
    return id;
  }, []);

  const updateMetadata = useCallback((updates: Partial<ProjectMetadata>) => {
    setState(prev => ({ ...prev, metadata: prev.metadata ? { ...prev.metadata, ...updates } : null, isDirty: true }));
  }, []);

  const markDirty = useCallback(() => {
    setState(prev => ({ ...prev, isDirty: true }));
  }, []);

  const toggleAutoSave = useCallback(() => {
    setState(prev => ({ ...prev, autoSaveEnabled: !prev.autoSaveEnabled }));
  }, []);

  const setAutoSaveInterval = useCallback((ms: number) => {
    setState(prev => ({ ...prev, autoSaveInterval: Math.max(5000, ms) }));
  }, []);

  const exportProject = useCallback(async (): Promise<string> => {
    if (!state.metadata) return '';
    return JSON.stringify(state.metadata);
  }, [state.metadata]);

  const deleteProject = useCallback(async (): Promise<boolean> => {
    if (!state.metadata) return false;
    setState(prev => ({ ...prev, metadata: null, isDirty: false }));
    return true;
  }, [state.metadata]);

  return {
    state, loadProject, saveProject, createProject, updateMetadata,
    markDirty, toggleAutoSave, setAutoSaveInterval, exportProject, deleteProject,
  };
}

export default useProject;
