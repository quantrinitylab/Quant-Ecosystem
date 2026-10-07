// ============================================================================
// QuantTube - Picture-in-Picture Controller Service
// Manages PiP window state, dimensions, and positioning
// ============================================================================

export interface PipState {
  isActive: boolean;
  width: number;
  height: number;
  position: { x: number; y: number };
  videoId: string | null;
}

export class PictureInPictureService {
  private state: PipState = {
    isActive: false,
    width: 320,
    height: 180,
    position: { x: 0, y: 0 },
    videoId: null,
  };

  private readonly supported: boolean = true;

  enter(videoId: string, dimensions?: { width: number; height: number }): PipState {
    this.state = {
      isActive: true,
      width: dimensions?.width ?? 320,
      height: dimensions?.height ?? 180,
      position: { ...this.state.position },
      videoId,
    };
    return this.getState();
  }

  exit(): PipState {
    this.state = {
      isActive: false,
      width: this.state.width,
      height: this.state.height,
      position: { ...this.state.position },
      videoId: null,
    };
    return this.getState();
  }

  toggle(videoId: string): PipState {
    if (this.state.isActive && this.state.videoId === videoId) {
      return this.exit();
    }
    return this.enter(videoId);
  }

  isSupported(): boolean {
    return this.supported;
  }

  getState(): PipState {
    return { ...this.state, position: { ...this.state.position } };
  }

  resize(width: number, height: number): PipState {
    if (width <= 0 || height <= 0) {
      return this.getState();
    }
    this.state.width = width;
    this.state.height = height;
    return this.getState();
  }

  reposition(x: number, y: number): PipState {
    this.state.position = { x, y };
    return this.getState();
  }
}
