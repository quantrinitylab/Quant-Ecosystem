/**
 * Minimal CDP client over the Node 24 built-in WebSocket — no dependencies.
 * Talks to one browser target (webSocketDebuggerUrl from /json/new).
 */
export class CDPSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.ws = null;
  }

  connect(timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* already closed */ }
        reject(new Error(`CDP connect timeout after ${timeoutMs}ms: ${this.wsUrl}`));
      }, timeoutMs);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve(this);
      });
      ws.addEventListener('message', (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(`CDP ${msg.method || ''}: ${msg.error.message}`));
          else res(msg.result);
        }
      });
      ws.addEventListener('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`CDP websocket error: ${err.message || 'unknown'}`));
      });
    });
  }

  send(method, params = {}) {
    if (!this.ws) throw new Error('CDP session not connected');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /**
   * Evaluate a JS function in the page, serializing args as JSON.
   * Returns the value (returnByValue). Throws if the page throws.
   */
  async evaluate(fn, ...args) {
    const argList = args.map((a) => JSON.stringify(a)).join(', ');
    const expression = `(${fn.toString()})(${argList})`;
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) {
      const text = result.exceptionDetails.exception
        ? result.exceptionDetails.exception.description || result.exceptionDetails.exception.value
        : result.exceptionDetails.text;
      throw new Error(`Page evaluation failed: ${text}`);
    }
    return result.result.value;
  }

  /** Dispatch a real touch tap at page coordinates (hit-tested path). */
  async tap(x, y) {
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
      modifiers: 0,
    });
    await this.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
      modifiers: 0,
    });
  }

  /** Dispatch a real mouse click at page coordinates (fallback path). */
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x, y, button: 'left', clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
    });
  }

  async centerOf(selector) {
    return this.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    }, selector);
  }

  close() {
    try { this.ws && this.ws.close(); } catch { /* ignore */ }
  }
}

/** HTTP helpers for the DevTools /json endpoints (Node built-in fetch). */
export async function getVersion(port) {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) throw new Error(`/json/version HTTP ${res.status}`);
  return res.json();
}

/** Chrome 154 requires PUT for /json/new. Returns the target object. */
export async function newTarget(port, url) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?${new URLSearchParams({ url })}`, {
    method: 'PUT',
  });
  if (!res.ok) throw new Error(`/json/new HTTP ${res.status}`);
  return res.json();
}

export async function closeTarget(port, id) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/close/${id}`);
  } catch { /* best effort */ }
}
