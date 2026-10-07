// ============================================================================
// @quant/shared-ui - Advanced Drag and Drop System
// ============================================================================

import {
  DragItem,
  DropTarget,
  DragState,
  DropPosition,
  SortableConfig,
  DropZoneConfig,
} from './types';

interface DragSource {
  id: string;
  type: string;
  data: any;
  element?: any;
  disabled?: boolean;
}

interface AutoScrollConfig {
  speed: number;
  threshold: number;
  maxSpeed: number;
}

type DragEventHandler = (state: DragState) => void;
type DropHandler = (item: DragItem, target: DropTarget, position: DropPosition) => void;

export class DragDropManager {
  private sources: Map<string, DragSource> = new Map();
  private targets: Map<string, DropTarget> = new Map();
  private sortables: Map<string, SortableConfig> = new Map();
  private fileZones: Map<string, DropZoneConfig> = new Map();
  private state: DragState;
  private dragListeners: Set<DragEventHandler> = new Set();
  private dropListeners: Set<DropHandler> = new Set();
  private autoScrollConfig: AutoScrollConfig;
  private autoScrollInterval: any = null;
  private keyboardDragActive: boolean = false;
  private previewElement: any = null;

  constructor(config?: { autoScroll?: Partial<AutoScrollConfig> }) {
    this.state = {
      isDragging: false,
      item: null,
      source: null,
      position: { x: 0, y: 0 },
      offset: { x: 0, y: 0 },
      overId: null,
      dropPosition: null,
    };
    this.autoScrollConfig = {
      speed: 10,
      threshold: 50,
      maxSpeed: 30,
      ...config?.autoScroll,
    };
  }

  // Register a drag source
  registerSource(id: string, type: string, data: any, element?: any): void {
    this.sources.set(id, { id, type, data, element, disabled: false });
  }

  // Unregister a drag source
  unregisterSource(id: string): void {
    this.sources.delete(id);
  }

  // Register a drop target
  registerTarget(target: DropTarget): void {
    this.targets.set(target.id, target);
  }

  // Unregister a drop target
  unregisterTarget(id: string): void {
    this.targets.delete(id);
  }

  // Register a sortable container
  registerSortable(config: SortableConfig): void {
    this.sortables.set(config.containerId, config);
  }

  // Unregister sortable
  unregisterSortable(containerId: string): void {
    this.sortables.delete(containerId);
  }

  // Register file drop zone
  registerFileZone(config: DropZoneConfig): void {
    this.fileZones.set(config.id, config);
  }

  // Start dragging
  startDrag(sourceId: string, startPosition: { x: number; y: number }): boolean {
    const source = this.sources.get(sourceId);
    if (!source || source.disabled) return false;

    const item: DragItem = {
      id: source.id,
      type: source.type,
      data: source.data,
      sourceId: source.id,
    };

    // Determine index if in a sortable
    for (const [_containerId, sortable] of this.sortables) {
      const index = sortable.items.indexOf(sourceId);
      if (index !== -1) {
        item.index = index;
        break;
      }
    }

    this.state = {
      isDragging: true,
      item,
      source: sourceId,
      position: startPosition,
      offset: { x: 0, y: 0 },
      overId: null,
      dropPosition: null,
    };

    this.createPreview(source);
    this.notifyDragListeners();
    return true;
  }

  // Update drag position (called on mouse/touch move)
  updateDrag(position: { x: number; y: number }): void {
    if (!this.state.isDragging) return;

    this.state.position = position;

    // Find which target we're over
    const target = this.findTargetAtPosition(position);

    if (target) {
      this.state.overId = target.id;
      this.state.dropPosition = this.calculateDropPosition(position, target);

      // Notify target of hover
      if (target.onHover && this.state.item) {
        target.onHover(this.state.item);
      }
    } else {
      this.state.overId = null;
      this.state.dropPosition = null;
    }

    // Update preview position
    this.updatePreviewPosition(position);

    // Auto-scroll check
    this.handleAutoScroll(position);

    this.notifyDragListeners();
  }

  // End drag - perform drop if valid
  endDrag(): DropPosition | null {
    if (!this.state.isDragging || !this.state.item) {
      this.cancelDrag();
      return null;
    }

    const { item, overId, dropPosition } = this.state;
    let result: DropPosition | null = null;

    if (overId && dropPosition) {
      const target = this.targets.get(overId);
      if (target && this.canDrop(item, target)) {
        // Execute drop
        if (target.onDrop) {
          target.onDrop(item, dropPosition);
        }

        // Handle sortable reorder
        this.handleSortableDrop(item, overId, dropPosition);

        // Notify drop listeners
        this.dropListeners.forEach((listener) => listener(item, target, dropPosition));
        result = dropPosition;
      }
    }

    this.resetState();
    return result;
  }

  // Cancel drag without dropping
  cancelDrag(): void {
    this.resetState();
  }

  // Check if item can be dropped on target
  private canDrop(item: DragItem, target: DropTarget): boolean {
    return target.accepts.includes(item.type) || target.accepts.includes('*');
  }

  // Find the deepest matching target at position
  private findTargetAtPosition(_position: { x: number; y: number }): DropTarget | null {
    // Iterate targets - in real implementation would use spatial index
    // Here we check if position is within target bounds (simplified)
    let deepestTarget: DropTarget | null = null;

    for (const [_id, target] of this.targets) {
      if (!this.state.item) continue;
      if (!this.canDrop(this.state.item, target)) continue;
      // In a real DOM environment, we'd check element bounds
      // For the engine, we track all valid targets
      deepestTarget = target;
    }
    return deepestTarget;
  }

  // Calculate drop position within target
  private calculateDropPosition(
    cursorPosition: { x: number; y: number },
    target: DropTarget,
  ): DropPosition {
    // Check sortable containers
    for (const [containerId, sortable] of this.sortables) {
      if (containerId === target.id) {
        const index = this.calculateInsertionIndex(cursorPosition, sortable);
        return {
          index,
          zone: containerId,
          side: 'after',
        };
      }
    }

    return {
      index: 0,
      zone: target.id,
      side: 'inside',
    };
  }

  // Calculate insertion index for sortable containers
  private calculateInsertionIndex(
    position: { x: number; y: number },
    sortable: SortableConfig,
  ): number {
    const { items, direction } = sortable;
    if (items.length === 0) return 0;

    // Use position relative to container for index calculation
    // In vertical mode, use y coordinate; horizontal uses x
    const coord = direction === 'horizontal' ? position.x : position.y;
    const itemSize = 50; // Estimated item size, would be measured in real DOM

    const rawIndex = Math.floor(coord / itemSize);
    return Math.max(0, Math.min(rawIndex, items.length));
  }

  // Handle sortable drop (reorder items)
  private handleSortableDrop(item: DragItem, _targetId: string, position: DropPosition): void {
    const sortable = this.sortables.get(position.zone);
    if (!sortable || item.index === undefined) return;

    const fromIndex = item.index;
    const toIndex = position.index;

    if (fromIndex !== toIndex) {
      sortable.onReorder(fromIndex, toIndex);
    }
  }

  // Auto-scroll when dragging near container edges
  private handleAutoScroll(position: { x: number; y: number }): void {
    // Calculate scroll speed based on distance from edge
    const { threshold, speed, maxSpeed } = this.autoScrollConfig;
    const viewportHeight = 800; // Default viewport
    const viewportWidth = 1200;

    let scrollX = 0;
    let scrollY = 0;

    // Top edge
    if (position.y < threshold) {
      scrollY = -speed * (1 - position.y / threshold);
    }
    // Bottom edge
    if (position.y > viewportHeight - threshold) {
      scrollY = speed * (1 - (viewportHeight - position.y) / threshold);
    }
    // Left edge
    if (position.x < threshold) {
      scrollX = -speed * (1 - position.x / threshold);
    }
    // Right edge
    if (position.x > viewportWidth - threshold) {
      scrollX = speed * (1 - (viewportWidth - position.x) / threshold);
    }

    // Clamp to max speed
    scrollX = Math.max(-maxSpeed, Math.min(maxSpeed, scrollX));
    scrollY = Math.max(-maxSpeed, Math.min(maxSpeed, scrollY));

    if (scrollX !== 0 || scrollY !== 0) {
      if (!this.autoScrollInterval) {
        this.autoScrollInterval = setInterval(() => {
          // In real DOM, would scroll the container
          this.state.position.x += scrollX;
          this.state.position.y += scrollY;
        }, 16);
      }
    } else {
      this.stopAutoScroll();
    }
  }

  private stopAutoScroll(): void {
    if (this.autoScrollInterval) {
      clearInterval(this.autoScrollInterval);
      this.autoScrollInterval = null;
    }
  }

  // Create drag preview (clone of element)
  private createPreview(source: DragSource): void {
    this.previewElement = {
      id: source.id,
      type: source.type,
      position: { ...this.state.position },
      opacity: 0.8,
    };
  }

  // Update preview position
  private updatePreviewPosition(position: { x: number; y: number }): void {
    if (this.previewElement) {
      this.previewElement.position = {
        x: position.x - this.state.offset.x,
        y: position.y - this.state.offset.y,
      };
    }
  }

  // Keyboard-accessible drag and drop
  startKeyboardDrag(sourceId: string): boolean {
    const source = this.sources.get(sourceId);
    if (!source) return false;

    this.keyboardDragActive = true;
    return this.startDrag(sourceId, { x: 0, y: 0 });
  }

  // Move with keyboard (arrow keys)
  keyboardMove(direction: 'up' | 'down' | 'left' | 'right'): void {
    if (!this.keyboardDragActive || !this.state.item) return;

    // Find the sortable containing this item
    for (const [containerId, sortable] of this.sortables) {
      const currentIndex = sortable.items.indexOf(this.state.item.sourceId);
      if (currentIndex === -1) continue;

      let newIndex = currentIndex;
      if (direction === 'up' || direction === 'left') {
        newIndex = Math.max(0, currentIndex - 1);
      } else if (direction === 'down' || direction === 'right') {
        newIndex = Math.min(sortable.items.length - 1, currentIndex + 1);
      }

      this.state.dropPosition = {
        index: newIndex,
        zone: containerId,
        side: newIndex > currentIndex ? 'after' : 'before',
      };
      this.state.overId = containerId;
      this.notifyDragListeners();
      break;
    }
  }

  // Confirm keyboard drop
  keyboardDrop(): DropPosition | null {
    if (!this.keyboardDragActive) return null;
    this.keyboardDragActive = false;
    return this.endDrag();
  }

  // Cancel keyboard drag
  keyboardCancel(): void {
    this.keyboardDragActive = false;
    this.cancelDrag();
  }

  // Validate file drop
  validateFileDrop(
    zoneId: string,
    files: Array<{ name: string; size: number; type: string }>,
  ): { valid: boolean; errors: string[] } {
    const zone = this.fileZones.get(zoneId);
    if (!zone) return { valid: false, errors: ['Drop zone not found'] };

    const errors: string[] = [];

    // Check max files
    if (zone.maxFiles && files.length > zone.maxFiles) {
      errors.push(`Maximum ${zone.maxFiles} files allowed`);
    }

    for (const file of files) {
      // Check file size
      if (zone.maxSize && file.size > zone.maxSize) {
        errors.push(`File "${file.name}" exceeds maximum size of ${zone.maxSize} bytes`);
      }

      // Check file type
      if (zone.allowedTypes && zone.allowedTypes.length > 0) {
        const isAllowed = zone.allowedTypes.some((type) => {
          if (type.endsWith('/*')) {
            return file.type.startsWith(type.replace('/*', '/'));
          }
          return file.type === type || file.name.endsWith(type);
        });
        if (!isAllowed) {
          errors.push(`File "${file.name}" type "${file.type}" not accepted`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Get drop indicators for visual feedback
  getDropIndicators(): Array<{ zone: string; index: number; side: 'before' | 'after' }> {
    if (!this.state.isDragging || !this.state.dropPosition) return [];
    return [
      {
        zone: this.state.dropPosition.zone,
        index: this.state.dropPosition.index,
        side: this.state.dropPosition.side as 'before' | 'after',
      },
    ];
  }

  // Get current drag state
  getState(): DragState {
    return { ...this.state };
  }

  // Get preview data
  getPreview(): any {
    return this.previewElement;
  }

  // Subscribe to drag state changes
  onDrag(handler: DragEventHandler): () => void {
    this.dragListeners.add(handler);
    return () => this.dragListeners.delete(handler);
  }

  // Subscribe to drop events
  onDrop(handler: DropHandler): () => void {
    this.dropListeners.add(handler);
    return () => this.dropListeners.delete(handler);
  }

  // Disable/enable a source
  setSourceDisabled(id: string, disabled: boolean): void {
    const source = this.sources.get(id);
    if (source) source.disabled = disabled;
  }

  // Notify all drag listeners
  private notifyDragListeners(): void {
    const stateCopy = { ...this.state };
    this.dragListeners.forEach((listener) => listener(stateCopy));
  }

  // Reset state after drag end
  private resetState(): void {
    this.state = {
      isDragging: false,
      item: null,
      source: null,
      position: { x: 0, y: 0 },
      offset: { x: 0, y: 0 },
      overId: null,
      dropPosition: null,
    };
    this.previewElement = null;
    this.stopAutoScroll();
    this.notifyDragListeners();
  }

  destroy(): void {
    this.resetState();
    this.sources.clear();
    this.targets.clear();
    this.sortables.clear();
    this.fileZones.clear();
    this.dragListeners.clear();
    this.dropListeners.clear();
  }
}

export default DragDropManager;
