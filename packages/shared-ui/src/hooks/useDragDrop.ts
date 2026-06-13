'use client';

// ============================================================================
// Shared UI - useDragDrop Hook
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { DragDropManager } from '../advanced/drag-drop';
import type { DragState, DropZoneConfig } from '../advanced/types';

export interface UseDragDropOptions {
  zoneId: string;
  accepts?: string[];
  maxFiles?: number;
  maxSize?: number;
  allowedTypes?: string[];
  onDrop?: (files: File[]) => void;
  onValidationError?: (errors: string[]) => void;
}

export interface UseDragDropReturn {
  dragState: DragState;
  dropRef: React.RefObject<HTMLDivElement | null>;
  isDragOver: boolean;
  validationErrors: string[];
}

export function useDragDrop(options: UseDragDropOptions): UseDragDropReturn {
  const {
    zoneId,
    accepts = ['*'],
    maxFiles,
    maxSize,
    allowedTypes,
    onDrop,
    onValidationError,
  } = options;

  const managerRef = useRef<DragDropManager>(new DragDropManager());
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    item: null,
    source: null,
    position: { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    overId: null,
    dropPosition: null,
  });

  // Register file zone
  useEffect(() => {
    const manager = managerRef.current;
    const zoneConfig: DropZoneConfig = {
      id: zoneId,
      accepts,
      maxFiles,
      maxSize,
      allowedTypes,
    };
    manager.registerFileZone(zoneConfig);
    manager.registerTarget({ id: zoneId, accepts });

    const unsubDrag = manager.onDrag((state) => {
      setDragState(state);
    });

    return () => {
      unsubDrag();
      manager.unregisterTarget(zoneId);
    };
  }, [zoneId, accepts, maxFiles, maxSize, allowedTypes]);

  // Attach DOM event listeners to drop ref
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      // Only set false if we actually left the element
      if (!el.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);
      const fileData = fileArray.map((f) => ({ name: f.name, size: f.size, type: f.type }));

      const validation = managerRef.current.validateFileDrop(zoneId, fileData);

      if (validation.valid) {
        setValidationErrors([]);
        onDrop?.(fileArray);
      } else {
        setValidationErrors(validation.errors);
        onValidationError?.(validation.errors);
      }
    };

    el.addEventListener('dragenter', handleDragEnter);
    el.addEventListener('dragover', handleDragOver);
    el.addEventListener('dragleave', handleDragLeave);
    el.addEventListener('drop', handleDrop);

    return () => {
      el.removeEventListener('dragenter', handleDragEnter);
      el.removeEventListener('dragover', handleDragOver);
      el.removeEventListener('dragleave', handleDragLeave);
      el.removeEventListener('drop', handleDrop);
    };
  }, [zoneId, onDrop, onValidationError]);

  return {
    dragState,
    dropRef: dropRef as React.RefObject<HTMLDivElement | null>,
    isDragOver,
    validationErrors,
  };
}
