// ============================================================================
// @quant/shared-ui - Advanced Skeleton Loader System
// ============================================================================

import {
  SkeletonConfig, SkeletonShape, SkeletonElement, SkeletonTemplate
} from './types';

interface ShimmerData {
  gradientStart: number;
  gradientEnd: number;
  angle: number;
  speed: number;
}

interface AnimationState {
  position: number;
  direction: 1 | -1;
  timestamp: number;
}

type SkeletonListener = (elements: SkeletonElement[], animation: ShimmerData) => void;

export class SkeletonLoader {
  private config: SkeletonConfig;
  private elements: SkeletonElement[] = [];
  private templates: Map<string, SkeletonTemplate> = new Map();
  private animationState: AnimationState;
  private listeners: Set<SkeletonListener> = new Set();
  private rafId: any = null;
  private isAnimating: boolean = false;

  constructor(config: SkeletonConfig = {}) {
    this.config = {
      width: '100%',
      height: 'auto',
      borderRadius: 4,
      animate: true,
      animationType: 'shimmer',
      speed: 1.5,
      baseColor: '#e2e8f0',
      highlightColor: '#f8fafc',
      ...config,
    };
    this.animationState = { position: 0, direction: 1, timestamp: 0 };
    this.registerDefaultTemplates();
  }

  // Register default template presets
  private registerDefaultTemplates(): void {
    // Card template
    this.templates.set('card', {
      name: 'card',
      width: 320,
      height: 300,
      elements: [
        { shape: 'image', x: 0, y: 0, width: 320, height: 180, borderRadius: 8 },
        { shape: 'text', x: 16, y: 196, width: 200, height: 16, borderRadius: 4 },
        { shape: 'text', x: 16, y: 220, width: 280, height: 12, borderRadius: 4 },
        { shape: 'text', x: 16, y: 240, width: 240, height: 12, borderRadius: 4 },
        { shape: 'circle', x: 16, y: 270, width: 32, height: 32, borderRadius: 16 },
        { shape: 'text', x: 56, y: 276, width: 100, height: 12, borderRadius: 4 },
      ],
    });

    // List item template
    this.templates.set('list-item', {
      name: 'list-item',
      width: 400,
      height: 72,
      elements: [
        { shape: 'circle', x: 16, y: 16, width: 40, height: 40, borderRadius: 20 },
        { shape: 'text', x: 72, y: 16, width: 180, height: 14, borderRadius: 4 },
        { shape: 'text', x: 72, y: 38, width: 240, height: 12, borderRadius: 4 },
      ],
    });

    // Profile template
    this.templates.set('profile', {
      name: 'profile',
      width: 300,
      height: 200,
      elements: [
        { shape: 'circle', x: 100, y: 20, width: 100, height: 100, borderRadius: 50 },
        { shape: 'text', x: 80, y: 130, width: 140, height: 18, borderRadius: 4 },
        { shape: 'text', x: 60, y: 156, width: 180, height: 12, borderRadius: 4 },
        { shape: 'text', x: 90, y: 176, width: 120, height: 12, borderRadius: 4 },
      ],
    });

    // Article template
    this.templates.set('article', {
      name: 'article',
      width: 600,
      height: 400,
      elements: [
        { shape: 'text', x: 0, y: 0, width: 400, height: 24, borderRadius: 4 },
        { shape: 'text', x: 0, y: 36, width: 200, height: 14, borderRadius: 4 },
        { shape: 'image', x: 0, y: 64, width: 600, height: 200, borderRadius: 8 },
        { shape: 'text', x: 0, y: 280, width: 580, height: 12, borderRadius: 4 },
        { shape: 'text', x: 0, y: 300, width: 560, height: 12, borderRadius: 4 },
        { shape: 'text', x: 0, y: 320, width: 590, height: 12, borderRadius: 4 },
        { shape: 'text', x: 0, y: 340, width: 400, height: 12, borderRadius: 4 },
        { shape: 'text', x: 0, y: 368, width: 580, height: 12, borderRadius: 4 },
        { shape: 'text', x: 0, y: 388, width: 520, height: 12, borderRadius: 4 },
      ],
    });
  }

  // Add a shape element
  addElement(shape: SkeletonShape, x: number, y: number, width: number, height: number, borderRadius?: number): void {
    this.elements.push({
      shape,
      x, y, width, height,
      borderRadius: borderRadius ?? this.getDefaultRadius(shape),
    });
  }

  // Get default border radius for shape type
  private getDefaultRadius(shape: SkeletonShape): number {
    switch (shape) {
      case 'circle': case 'avatar': return 50;
      case 'text': return 4;
      case 'button': return 6;
      case 'rect': return this.config.borderRadius || 4;
      case 'image': return 8;
      default: return 4;
    }
  }

  // Add shape primitives
  addRect(x: number, y: number, width: number, height: number): void {
    this.addElement('rect', x, y, width, height);
  }

  addCircle(x: number, y: number, diameter: number): void {
    this.addElement('circle', x, y, diameter, diameter, diameter / 2);
  }

  addTextLine(x: number, y: number, width: number, height: number = 12): void {
    this.addElement('text', x, y, width, height, 4);
  }

  addTextBlock(x: number, y: number, width: number, lines: number = 3, lineHeight: number = 20): void {
    for (let i = 0; i < lines; i++) {
      // Last line is shorter for natural look
      const lineWidth = i === lines - 1 ? width * 0.7 : width * (0.85 + Math.random() * 0.15);
      this.addTextLine(x, y + i * lineHeight, lineWidth);
    }
  }

  addAvatar(x: number, y: number, size: number = 40): void {
    this.addElement('avatar', x, y, size, size, size / 2);
  }

  addButton(x: number, y: number, width: number = 100, height: number = 36): void {
    this.addElement('button', x, y, width, height, 6);
  }

  addImage(x: number, y: number, width: number, height: number): void {
    this.addElement('image', x, y, width, height, 8);
  }

  // Load a template preset
  useTemplate(name: string, x: number = 0, y: number = 0): void {
    const template = this.templates.get(name);
    if (!template) return;

    for (const element of template.elements) {
      this.elements.push({
        ...element,
        x: element.x + x,
        y: element.y + y,
      });
    }
  }

  // Register custom template
  registerTemplate(name: string, template: SkeletonTemplate): void {
    this.templates.set(name, template);
  }

  // Generate repeated template (e.g., list of items)
  repeat(templateName: string, count: number, spacing: number = 0): void {
    const template = this.templates.get(templateName);
    if (!template) return;

    for (let i = 0; i < count; i++) {
      const offsetY = i * (template.height + spacing);
      this.useTemplate(templateName, 0, offsetY);
    }
  }

  // Content-aware skeleton generation
  generateForContentType(type: 'text' | 'image' | 'card' | 'table' | 'form', containerWidth: number): void {
    this.elements = [];
    switch (type) {
      case 'text':
        this.addTextBlock(0, 0, containerWidth, 5, 24);
        break;
      case 'image':
        this.addImage(0, 0, containerWidth, containerWidth * 0.6);
        break;
      case 'card':
        this.useTemplate('card');
        break;
      case 'table':
        // Header row
        const colWidth = containerWidth / 4;
        for (let col = 0; col < 4; col++) {
          this.addRect(col * colWidth + 8, 8, colWidth - 16, 20);
        }
        // Data rows
        for (let row = 1; row <= 5; row++) {
          for (let col = 0; col < 4; col++) {
            this.addTextLine(col * colWidth + 8, row * 48 + 8, colWidth - 16, 14);
          }
        }
        break;
      case 'form':
        for (let i = 0; i < 4; i++) {
          this.addTextLine(0, i * 72, 120, 14); // Label
          this.addRect(0, i * 72 + 22, containerWidth, 40); // Input
        }
        this.addButton(0, 4 * 72, 120, 40); // Submit button
        break;
    }
  }

  // Responsive adjustment
  adjustForWidth(containerWidth: number): void {
    if (this.elements.length === 0) return;
    const maxX = Math.max(...this.elements.map(e => e.x + e.width));
    if (maxX <= 0) return;
    const scale = containerWidth / maxX;
    if (scale >= 1) return;

    this.elements = this.elements.map(el => ({
      ...el,
      x: el.x * scale,
      width: el.width * scale,
    }));
  }

  // Get shimmer animation data
  getShimmerData(): ShimmerData {
    const speed = this.config.speed || 1.5;
    return {
      gradientStart: this.animationState.position - 0.3,
      gradientEnd: this.animationState.position + 0.3,
      angle: 90,
      speed,
    };
  }

  // Get pulse animation data
  getPulseData(): { opacity: number } {
    const t = this.animationState.position;
    // Smooth pulse between 0.4 and 1.0
    const opacity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
    return { opacity };
  }

  // Start animation loop
  startAnimation(): void {
    if (this.isAnimating || !this.config.animate) return;
    this.isAnimating = true;
    this.animationState.timestamp = Date.now();
    this.animationLoop();
  }

  private animationLoop(): void {
    if (!this.isAnimating) return;

    const now = Date.now();
    const elapsed = (now - this.animationState.timestamp) / 1000;
    const speed = this.config.speed || 1.5;

    // Position cycles from 0 to 1
    this.animationState.position = (elapsed * speed / 2) % 1;

    this.notifyListeners();

    this.rafId = typeof requestAnimationFrame !== 'undefined'
      ? requestAnimationFrame(() => this.animationLoop())
      : setTimeout(() => this.animationLoop(), 16);
  }

  // Stop animation
  stopAnimation(): void {
    this.isAnimating = false;
    if (this.rafId !== null) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.rafId);
      } else {
        clearTimeout(this.rafId);
      }
      this.rafId = null;
    }
  }

  // Get CSS styles for a skeleton element
  getElementStyles(element: SkeletonElement): Record<string, string> {
    return {
      position: 'absolute',
      left: `${element.x}px`,
      top: `${element.y}px`,
      width: `${element.width}px`,
      height: `${element.height}px`,
      borderRadius: `${element.borderRadius || 0}px`,
      backgroundColor: this.config.baseColor || '#e2e8f0',
    };
  }

  // Get all elements
  getElements(): SkeletonElement[] { return [...this.elements]; }

  // Clear all elements
  clear(): void { this.elements = []; }

  // Get total height
  getTotalHeight(): number {
    if (this.elements.length === 0) return 0;
    return Math.max(...this.elements.map(e => e.y + e.height));
  }

  // Subscribe
  subscribe(listener: SkeletonListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const shimmer = this.getShimmerData();
    this.listeners.forEach(listener => listener(this.elements, shimmer));
  }

  destroy(): void {
    this.stopAnimation();
    this.listeners.clear();
    this.elements = [];
  }
}

export default SkeletonLoader;
