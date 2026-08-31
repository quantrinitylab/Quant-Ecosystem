/**
 * The one piece of WebGL plumbing every Quant mark shares.
 *
 * Six app marks, one context type, one draw call each: a full-screen triangle
 * and a fragment shader that raymarches an SDF. No mesh, no loader, no scene
 * graph, no three.js — the marks are analytic solids, so the geometry *is* the
 * shader, and a 3 KB fragment program does what a 150 KB library would.
 *
 * What this file owns, so that no mark has to:
 *  - context creation, and an honest `supported: false` when there is no WebGL2
 *  - program compilation with the shared `#version`/uniform preamble
 *  - device-pixel sizing, capped at 2x (a 3x phone renders 2.25x the pixels for
 *    no visible gain on a 32px glyph)
 *  - frame scheduling: coalesced single frames for the static tier, an rAF loop
 *    for the animated one, paused off-screen and on a hidden tab
 *  - context-loss recovery, which is not exotic — a laptop waking from sleep or
 *    a GPU driver reset takes every canvas on the page down at once
 *
 * Deliberately NOT here: anything about a particular mark. The shader source
 * arrives as a string, so the six marks differ by ~15 lines of SDF each.
 */

/** A uniform this renderer knows how to upload. `vec2`..`vec4` as arrays. */
export type UniformValue = number | readonly number[];

export interface MarkRendererOptions {
  /** Mark-specific GLSL. Gets {@link SHADER_PREAMBLE} prepended. */
  fragmentSource: string;
  /** Initial uniform values, by name, without the `u` preamble ones. */
  uniforms?: Readonly<Record<string, UniformValue>>;
  /** `true` runs an rAF loop; `false` (default) draws once per change. */
  animate?: boolean;
  /** Device-pixel-ratio ceiling. Default 2. */
  dprCap?: number;
  /** Called once if the context or the program could not be created. */
  onFailure?: (reason: string) => void;
}

export interface MarkRenderer {
  readonly supported: boolean;
  setUniform(name: string, value: UniformValue): void;
  setUniforms(values: Readonly<Record<string, UniformValue>>): void;
  /** Draw one frame, coalesced into the next animation frame. */
  requestFrame(): void;
  setAnimating(animate: boolean): void;
  dispose(): void;
}

/**
 * A full-screen triangle with no vertex buffer at all: three vertices derived
 * from `gl_VertexID`, clipped by the viewport. One `drawArrays`, zero GPU
 * uploads, nothing to delete on teardown but the program itself.
 */
const VERTEX_SOURCE = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Prepended to every mark shader. `uResolution` is in device pixels and
 * `uTime` in seconds; both are owned by the renderer, so a mark never declares
 * them and two marks can never disagree about their units.
 */
export const SHADER_PREAMBLE = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
out vec4 fragColor;
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // The log is the only useful diagnostic a shader failure has, and it must
    // not vanish: `no-console` is an error in this app, so it travels out
    // through `onFailure` instead of being printed here.
    const log = gl.getShaderInfoLog(shader) ?? 'unknown shader error';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, fragmentSource: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram returned null');

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fs = compile(gl, gl.FRAGMENT_SHADER, SHADER_PREAMBLE + fragmentSource);
  if (!vs || !fs) throw new Error('createShader returned null');

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  // Detached and deleted immediately: the linked program keeps its own copy, so
  // holding the shader objects only leaks driver memory.
  gl.detachShader(program, vs);
  gl.detachShader(program, fs);
  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown link error';
    gl.deleteProgram(program);
    throw new Error(log);
  }
  return program;
}

/** A renderer that reports `supported: false` and does nothing else. */
function inertRenderer(): MarkRenderer {
  return {
    supported: false,
    setUniform: () => {},
    setUniforms: () => {},
    requestFrame: () => {},
    setAnimating: () => {},
    dispose: () => {},
  };
}

export function createMarkRenderer(
  canvas: HTMLCanvasElement,
  options: MarkRendererOptions,
): MarkRenderer {
  const dprCap = options.dprCap ?? 2;
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false, // the SDF anti-aliases itself, analytically and cheaper
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'low-power', // a 96px glyph must not spin up a dGPU
    preserveDrawingBuffer: false,
  });

  if (!gl) {
    options.onFailure?.('WebGL2 is unavailable');
    return inertRenderer();
  }

  const uniforms: Record<string, UniformValue> = { ...options.uniforms };
  const locations = new Map<string, WebGLUniformLocation | null>();
  let program: WebGLProgram | null = null;
  let animating = options.animate ?? false;
  let frame = 0;
  let disposed = false;
  let contextLost = false;
  let onScreen = true;
  const epoch = performance.now();

  function buildProgram(): boolean {
    try {
      program = link(gl!, options.fragmentSource);
      locations.clear();
      return true;
    } catch (error) {
      options.onFailure?.(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  function locate(name: string): WebGLUniformLocation | null {
    if (!locations.has(name)) {
      locations.set(name, program ? gl!.getUniformLocation(program, name) : null);
    }
    return locations.get(name) ?? null;
  }

  function upload(name: string, value: UniformValue): void {
    const location = locate(name);
    // A uniform a shader does not read is optimised out, and asking for its
    // location is `null`. That is normal — the six marks share a uniform block
    // and each ignores most of it — so it is skipped, not reported.
    if (!location) return;
    if (typeof value === 'number') {
      gl!.uniform1f(location, value);
      return;
    }
    if (value.length === 2) gl!.uniform2f(location, value[0]!, value[1]!);
    else if (value.length === 3) gl!.uniform3f(location, value[0]!, value[1]!, value[2]!);
    else if (value.length === 4) {
      gl!.uniform4f(location, value[0]!, value[1]!, value[2]!, value[3]!);
    }
  }

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const width = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr));
    const height = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw(now: number): void {
    frame = 0;
    if (disposed || contextLost || !program) return;

    resize();
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.useProgram(program);
    upload('uResolution', [canvas.width, canvas.height]);
    upload('uTime', (now - epoch) / 1000);
    for (const name of Object.keys(uniforms)) upload(name, uniforms[name]!);

    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);

    // The loop only continues while the mark is both on screen and on a visible
    // tab. A background tab already throttles rAF to ~1 Hz, but a mark scrolled
    // out of view on a foreground tab would otherwise keep the GPU awake.
    if (animating && onScreen && !document.hidden) {
      frame = requestAnimationFrame(draw);
    }
  }

  function requestFrame(): void {
    if (disposed || contextLost || frame !== 0) return;
    frame = requestAnimationFrame(draw);
  }

  function cancel(): void {
    if (frame !== 0) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  const handleLost = (event: Event): void => {
    // Without `preventDefault` the context is never restorable, and the mark is
    // a blank rectangle until the page reloads.
    event.preventDefault();
    contextLost = true;
    cancel();
  };

  const handleRestored = (): void => {
    contextLost = false;
    program = null;
    if (buildProgram()) requestFrame();
  };

  const handleVisibility = (): void => {
    if (!document.hidden) requestFrame();
  };

  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);
  document.addEventListener('visibilitychange', handleVisibility);

  const resizeObserver =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => requestFrame());
  resizeObserver?.observe(canvas);

  const intersectionObserver =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            const entry = entries[entries.length - 1];
            if (!entry) return;
            onScreen = entry.isIntersecting;
            if (onScreen) requestFrame();
          },
          // A little margin so a mark scrolled into view is already drawn.
          { rootMargin: '96px' },
        );
  intersectionObserver?.observe(canvas);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  if (!buildProgram()) {
    canvas.removeEventListener('webglcontextlost', handleLost);
    canvas.removeEventListener('webglcontextrestored', handleRestored);
    document.removeEventListener('visibilitychange', handleVisibility);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    return inertRenderer();
  }

  requestFrame();

  return {
    supported: true,
    setUniform(name, value) {
      uniforms[name] = value;
      requestFrame();
    },
    setUniforms(values) {
      for (const name of Object.keys(values)) uniforms[name] = values[name]!;
      requestFrame();
    },
    requestFrame,
    setAnimating(next) {
      if (animating === next) return;
      animating = next;
      if (animating) requestFrame();
    },
    dispose() {
      disposed = true;
      cancel();
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
      document.removeEventListener('visibilitychange', handleVisibility);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (program) gl.deleteProgram(program);
      program = null;
      // Releases the GPU allocation now rather than at the next GC, which
      // matters on the lab page where several contexts live and die together.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
