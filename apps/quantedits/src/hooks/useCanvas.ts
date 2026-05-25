// ============================================================================
// QuantEdits - useCanvas Hook
// Canvas state: elements, selection, transform, history, clipboard, alignment
// ============================================================================

import { useState, useCallback, useMemo } from 'react';

interface CanvasElement {
  id: string;
  type: 'text' | 'shape' | 'image' | 'icon' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  name: string;
  zIndex: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  borderRadius: number;
  shadow: { x: number; y: number; blur: number; color: string } | null;
  text?: { content: string; fontSize: number; fontFamily: string; fontWeight: string; textAlign: string; color: string };
  shape?: string;
  imageUrl?: string;
  groupChildren?: string[];
}

interface CanvasState {
  elements: CanvasElement[];
  selectedIds: Set<string>;
  canvasWidth: number;
  canvasHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  backgroundColor: string;
  showGrid: boolean;
  gridSize: number;
  snapToGrid: boolean;
  showRulers: boolean;
}

interface AlignGuide {
  type: 'vertical' | 'horizontal';
  position: number;
  source: string;
}

interface HistoryEntry {
  elements: CanvasElement[];
  description: string;
}

interface UseCanvasReturn {
  state: CanvasState;
  selectedElements: CanvasElement[];
  alignGuides: AlignGuide[];
  canUndo: boolean;
  canRedo: boolean;
  setCanvasSize: (width: number, height: number) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setBackgroundColor: (color: string) => void;
  toggleGrid: () => void;
  toggleRulers: () => void;
  toggleSnap: () => void;
  setGridSize: (size: number) => void;
  addElement: (element: Omit<CanvasElement, 'id' | 'zIndex'>) => void;
  removeElement: (id: string) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  selectElement: (id: string, addToSelection?: boolean) => void;
  selectAll: () => void;
  deselectAll: () => void;
  moveElement: (id: string, dx: number, dy: number) => void;
  resizeElement: (id: string, width: number, height: number) => void;
  rotateElement: (id: string, rotation: number) => void;
  duplicateElement: (id: string) => void;
  groupSelected: () => void;
  ungroupElement: (id: string) => void;
  alignElements: (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  distributeElements: (direction: 'horizontal' | 'vertical') => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  copy: () => void;
  paste: () => void;
  cut: () => void;
  undo: () => void;
  redo: () => void;
  exportAsJSON: () => string;
  importFromJSON: (json: string) => void;
}

export function useCanvas(initialWidth: number = 1080, initialHeight: number = 1080): UseCanvasReturn {
  const [state, setState] = useState<CanvasState>({
    elements: [],
    selectedIds: new Set(),
    canvasWidth: initialWidth,
    canvasHeight: initialHeight,
    zoom: 1,
    panX: 0,
    panY: 0,
    backgroundColor: '#ffffff',
    showGrid: true,
    gridSize: 20,
    snapToGrid: true,
    showRulers: true,
  });

  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [clipboard, setClipboard] = useState<CanvasElement[]>([]);

  const saveHistory = useCallback((description: string) => {
    setUndoStack(prev => [...prev.slice(-49), { elements: JSON.parse(JSON.stringify(state.elements)), description }]);
    setRedoStack([]);
  }, [state.elements]);

  const selectedElements = useMemo(() => state.elements.filter(e => state.selectedIds.has(e.id)), [state.elements, state.selectedIds]);

  const alignGuides = useMemo((): AlignGuide[] => {
    if (selectedElements.length !== 1) return [];
    const sel = selectedElements[0];
    const guides: AlignGuide[] = [];
    const centerX = sel.x + sel.width / 2;
    const centerY = sel.y + sel.height / 2;
    if (Math.abs(centerX - state.canvasWidth / 2) < 5) guides.push({ type: 'vertical', position: state.canvasWidth / 2, source: 'canvas-center' });
    if (Math.abs(centerY - state.canvasHeight / 2) < 5) guides.push({ type: 'horizontal', position: state.canvasHeight / 2, source: 'canvas-center' });
    state.elements.forEach(el => {
      if (el.id === sel.id) return;
      if (Math.abs(sel.x - el.x) < 5) guides.push({ type: 'vertical', position: el.x, source: el.id });
      if (Math.abs(sel.x + sel.width - (el.x + el.width)) < 5) guides.push({ type: 'vertical', position: el.x + el.width, source: el.id });
      if (Math.abs(sel.y - el.y) < 5) guides.push({ type: 'horizontal', position: el.y, source: el.id });
      if (Math.abs(sel.y + sel.height - (el.y + el.height)) < 5) guides.push({ type: 'horizontal', position: el.y + el.height, source: el.id });
    });
    return guides;
  }, [selectedElements, state.elements, state.canvasWidth, state.canvasHeight]);

  const snapPosition = useCallback((x: number, y: number): { x: number; y: number } => {
    if (!state.snapToGrid) return { x, y };
    return { x: Math.round(x / state.gridSize) * state.gridSize, y: Math.round(y / state.gridSize) * state.gridSize };
  }, [state.snapToGrid, state.gridSize]);

  const setCanvasSize = useCallback((width: number, height: number) => { setState(prev => ({ ...prev, canvasWidth: width, canvasHeight: height })); }, []);
  const setZoom = useCallback((zoom: number) => { setState(prev => ({ ...prev, zoom: Math.max(0.1, Math.min(5, zoom)) })); }, []);
  const setPan = useCallback((x: number, y: number) => { setState(prev => ({ ...prev, panX: x, panY: y })); }, []);
  const setBackgroundColor = useCallback((color: string) => { setState(prev => ({ ...prev, backgroundColor: color })); }, []);
  const toggleGrid = useCallback(() => { setState(prev => ({ ...prev, showGrid: !prev.showGrid })); }, []);
  const toggleRulers = useCallback(() => { setState(prev => ({ ...prev, showRulers: !prev.showRulers })); }, []);
  const toggleSnap = useCallback(() => { setState(prev => ({ ...prev, snapToGrid: !prev.snapToGrid })); }, []);
  const setGridSize = useCallback((size: number) => { setState(prev => ({ ...prev, gridSize: size })); }, []);

  const addElement = useCallback((element: Omit<CanvasElement, 'id' | 'zIndex'>) => {
    saveHistory('add element');
    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const zIndex = state.elements.length;
    setState(prev => ({ ...prev, elements: [...prev.elements, { ...element, id, zIndex }], selectedIds: new Set([id]) }));
  }, [state.elements, saveHistory]);

  const removeElement = useCallback((id: string) => {
    saveHistory('remove element');
    setState(prev => ({ ...prev, elements: prev.elements.filter(e => e.id !== id), selectedIds: (() => { const s = new Set(prev.selectedIds); s.delete(id); return s; })() }));
  }, [saveHistory]);

  const updateElement = useCallback((id: string, updates: Partial<CanvasElement>) => {
    setState(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, ...updates } : e) }));
  }, []);

  const selectElement = useCallback((id: string, addToSelection: boolean = false) => {
    setState(prev => {
      const next = addToSelection ? new Set(prev.selectedIds) : new Set<string>();
      if (next.has(id) && addToSelection) next.delete(id);
      else next.add(id);
      return { ...prev, selectedIds: next };
    });
  }, []);

  const selectAll = useCallback(() => { setState(prev => ({ ...prev, selectedIds: new Set(prev.elements.map(e => e.id)) })); }, []);
  const deselectAll = useCallback(() => { setState(prev => ({ ...prev, selectedIds: new Set() })); }, []);

  const moveElement = useCallback((id: string, dx: number, dy: number) => {
    setState(prev => ({
      ...prev,
      elements: prev.elements.map(e => {
        if (e.id !== id || e.locked) return e;
        const snapped = snapPosition(e.x + dx, e.y + dy);
        return { ...e, x: snapped.x, y: snapped.y };
      }),
    }));
  }, [snapPosition]);

  const resizeElement = useCallback((id: string, width: number, height: number) => {
    setState(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, width: Math.max(1, width), height: Math.max(1, height) } : e) }));
  }, []);

  const rotateElement = useCallback((id: string, rotation: number) => {
    setState(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, rotation: rotation % 360 } : e) }));
  }, []);

  const duplicateElement = useCallback((id: string) => {
    saveHistory('duplicate');
    const el = state.elements.find(e => e.id === id);
    if (!el) return;
    const dup = { ...el, id: `el-dup-${Date.now()}`, x: el.x + 20, y: el.y + 20, name: `${el.name} (copy)`, zIndex: state.elements.length };
    setState(prev => ({ ...prev, elements: [...prev.elements, dup], selectedIds: new Set([dup.id]) }));
  }, [state.elements, saveHistory]);

  const groupSelected = useCallback(() => {
    if (state.selectedIds.size < 2) return;
    saveHistory('group');
    const ids = Array.from(state.selectedIds);
    const selected = state.elements.filter(e => ids.includes(e.id));
    const minX = Math.min(...selected.map(e => e.x));
    const minY = Math.min(...selected.map(e => e.y));
    const maxX = Math.max(...selected.map(e => e.x + e.width));
    const maxY = Math.max(...selected.map(e => e.y + e.height));
    const group: CanvasElement = { id: `group-${Date.now()}`, type: 'group', x: minX, y: minY, width: maxX - minX, height: maxY - minY, rotation: 0, opacity: 1, locked: false, visible: true, name: `Group ${state.elements.filter(e => e.type === 'group').length + 1}`, zIndex: state.elements.length, fill: 'transparent', stroke: '', strokeWidth: 0, borderRadius: 0, shadow: null, groupChildren: ids };
    setState(prev => ({ ...prev, elements: [...prev.elements.filter(e => !ids.includes(e.id)), group], selectedIds: new Set([group.id]) }));
  }, [state.selectedIds, state.elements, saveHistory]);

  const ungroupElement = useCallback((id: string) => {
    const group = state.elements.find(e => e.id === id && e.type === 'group');
    if (!group || !group.groupChildren) return;
    saveHistory('ungroup');
    setState(prev => ({ ...prev, elements: prev.elements.filter(e => e.id !== id), selectedIds: new Set(group.groupChildren) }));
  }, [state.elements, saveHistory]);

  const alignElements = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedElements.length === 0) return;
    saveHistory('align');
    setState(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        if (!prev.selectedIds.has(el.id)) return el;
        switch (alignment) {
          case 'left': return { ...el, x: 0 };
          case 'center': return { ...el, x: (prev.canvasWidth - el.width) / 2 };
          case 'right': return { ...el, x: prev.canvasWidth - el.width };
          case 'top': return { ...el, y: 0 };
          case 'middle': return { ...el, y: (prev.canvasHeight - el.height) / 2 };
          case 'bottom': return { ...el, y: prev.canvasHeight - el.height };
          default: return el;
        }
      }),
    }));
  }, [selectedElements, saveHistory]);

  const distributeElements = useCallback((direction: 'horizontal' | 'vertical') => {
    if (selectedElements.length < 3) return;
    saveHistory('distribute');
    const sorted = [...selectedElements].sort((a, b) => direction === 'horizontal' ? a.x - b.x : a.y - b.y);
    const first = sorted[0]; const last = sorted[sorted.length - 1];
    const totalSpace = direction === 'horizontal' ? (last.x + last.width) - first.x : (last.y + last.height) - first.y;
    const totalElementSize = sorted.reduce((sum, el) => sum + (direction === 'horizontal' ? el.width : el.height), 0);
    const gap = (totalSpace - totalElementSize) / (sorted.length - 1);
    let pos = direction === 'horizontal' ? first.x : first.y;
    const updates = new Map<string, number>();
    sorted.forEach(el => { updates.set(el.id, pos); pos += (direction === 'horizontal' ? el.width : el.height) + gap; });
    setState(prev => ({
      ...prev,
      elements: prev.elements.map(el => {
        const newPos = updates.get(el.id);
        if (newPos === undefined) return el;
        return direction === 'horizontal' ? { ...el, x: newPos } : { ...el, y: newPos };
      }),
    }));
  }, [selectedElements, saveHistory]);

  const bringForward = useCallback((id: string) => { setState(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, zIndex: e.zIndex + 1 } : e) })); }, []);
  const sendBackward = useCallback((id: string) => { setState(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, zIndex: Math.max(0, e.zIndex - 1) } : e) })); }, []);
  const bringToFront = useCallback((id: string) => { const max = Math.max(...state.elements.map(e => e.zIndex)); setState(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, zIndex: max + 1 } : e) })); }, [state.elements]);
  const sendToBack = useCallback((id: string) => { setState(prev => ({ ...prev, elements: prev.elements.map(e => e.id === id ? { ...e, zIndex: 0 } : e.zIndex >= 0 ? { ...e, zIndex: e.zIndex + 1 } : e) })); }, []);

  const copy = useCallback(() => { setClipboard(selectedElements.map(e => ({ ...e }))); }, [selectedElements]);
  const paste = useCallback(() => {
    if (clipboard.length === 0) return;
    saveHistory('paste');
    const pasted = clipboard.map(e => ({ ...e, id: `el-paste-${Date.now()}-${Math.random().toString(36).slice(2)}`, x: e.x + 20, y: e.y + 20 }));
    setState(prev => ({ ...prev, elements: [...prev.elements, ...pasted], selectedIds: new Set(pasted.map(e => e.id)) }));
  }, [clipboard, saveHistory]);
  const cut = useCallback(() => { copy(); saveHistory('cut'); setState(prev => ({ ...prev, elements: prev.elements.filter(e => !prev.selectedIds.has(e.id)), selectedIds: new Set() })); }, [copy, saveHistory]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, { elements: JSON.parse(JSON.stringify(state.elements)), description: 'undo' }]);
    setState(s => ({ ...s, elements: prev.elements }));
    setUndoStack(u => u.slice(0, -1));
  }, [undoStack, state.elements]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, { elements: JSON.parse(JSON.stringify(state.elements)), description: 'redo' }]);
    setState(s => ({ ...s, elements: next.elements }));
    setRedoStack(r => r.slice(0, -1));
  }, [redoStack, state.elements]);

  const exportAsJSON = useCallback((): string => JSON.stringify({ elements: state.elements, canvasWidth: state.canvasWidth, canvasHeight: state.canvasHeight, backgroundColor: state.backgroundColor }), [state]);
  const importFromJSON = useCallback((json: string) => {
    try {
      const data = JSON.parse(json);
      setState(prev => ({ ...prev, elements: data.elements || [], canvasWidth: data.canvasWidth || prev.canvasWidth, canvasHeight: data.canvasHeight || prev.canvasHeight, backgroundColor: data.backgroundColor || prev.backgroundColor }));
    } catch (e) { console.error('Invalid JSON'); }
  }, []);

  return {
    state, selectedElements, alignGuides, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    setCanvasSize, setZoom, setPan, setBackgroundColor, toggleGrid, toggleRulers, toggleSnap, setGridSize,
    addElement, removeElement, updateElement, selectElement, selectAll, deselectAll,
    moveElement, resizeElement, rotateElement, duplicateElement, groupSelected, ungroupElement,
    alignElements, distributeElements, bringForward, sendBackward, bringToFront, sendToBack,
    copy, paste, cut, undo, redo, exportAsJSON, importFromJSON,
  };
}

export default useCanvas;
