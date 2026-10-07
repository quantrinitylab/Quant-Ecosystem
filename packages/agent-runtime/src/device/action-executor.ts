export interface ActionResult {
  success: boolean;
  action: string;
  timestamp: number;
  durationMs: number;
  error?: string;
}

export interface Coordinates {
  x: number;
  y: number;
}

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

export class ActionExecutor {
  private readonly actionLog: ActionResult[] = [];

  async tap(x: number, y: number): Promise<ActionResult> {
    const start = Date.now();
    const result: ActionResult = {
      success: true,
      action: `tap(${x}, ${y})`,
      timestamp: Date.now(),
      durationMs: Date.now() - start,
    };
    this.actionLog.push(result);
    return result;
  }

  async swipe(from: Coordinates, to: Coordinates, duration: number = 300): Promise<ActionResult> {
    const start = Date.now();
    const result: ActionResult = {
      success: true,
      action: `swipe(${from.x},${from.y} -> ${to.x},${to.y}, ${duration}ms)`,
      timestamp: Date.now(),
      durationMs: Date.now() - start,
    };
    this.actionLog.push(result);
    return result;
  }

  async type(text: string): Promise<ActionResult> {
    const start = Date.now();
    const result: ActionResult = {
      success: true,
      action: `type("${text}")`,
      timestamp: Date.now(),
      durationMs: Date.now() - start,
    };
    this.actionLog.push(result);
    return result;
  }

  async scroll(direction: ScrollDirection, amount: number = 1): Promise<ActionResult> {
    const start = Date.now();
    const result: ActionResult = {
      success: true,
      action: `scroll(${direction}, ${amount})`,
      timestamp: Date.now(),
      durationMs: Date.now() - start,
    };
    this.actionLog.push(result);
    return result;
  }

  async longPress(x: number, y: number, duration: number = 500): Promise<ActionResult> {
    const start = Date.now();
    const result: ActionResult = {
      success: true,
      action: `longPress(${x}, ${y}, ${duration}ms)`,
      timestamp: Date.now(),
      durationMs: Date.now() - start,
    };
    this.actionLog.push(result);
    return result;
  }

  getActionLog(): ReadonlyArray<ActionResult> {
    return [...this.actionLog];
  }

  clearLog(): void {
    this.actionLog.length = 0;
  }
}
