'use client';

import React, { useEffect, useRef, useState, useId, useCallback } from 'react';

// ============================================================================
// Types & Domain Model
// ============================================================================

export interface DeliveryNode {
  id: string;
  name: string;
  city: string;
  country: string;
  region: string;
  lat: number;
  lon: number;
  pingMs: number;
  cryptoStatus: string;
  protocol: string;
  status: 'operational' | 'degraded' | 'syncing';
  tlsVersion: string;
  activeTunnels: number;
}

export interface DeliveryArc {
  fromId: string;
  toId: string;
  label: string;
  throughput: string;
}

export interface GlobalDeliveryGlobeProps {
  nodes?: DeliveryNode[];
  arcs?: DeliveryArc[];
  onSelectNode?: (node: DeliveryNode) => void;
  selectedNodeId?: string;
  autoRotate?: boolean;
  rotationSpeed?: number;
  height?: number | string;
  className?: string;
  forceFallback?: boolean;
}

// ============================================================================
// Canonical Routing Nodes & Connections (<24ms PQC Mesh)
// ============================================================================

export const CANONICAL_DELIVERY_NODES: DeliveryNode[] = [
  {
    id: 'bom',
    name: 'Mumbai Edge Gateway',
    city: 'Mumbai',
    country: 'IN',
    region: 'ap-south-1',
    lat: 19.076,
    lon: 72.8777,
    pingMs: 14,
    cryptoStatus: 'Post-Quantum Dilithium-5',
    protocol: 'QUIC / TLS 1.3 PQC',
    status: 'operational',
    tlsVersion: 'TLS 1.3 + ML-KEM-768',
    activeTunnels: 124,
  },
  {
    id: 'fra',
    name: 'Frankfurt Core Exchange',
    city: 'Frankfurt',
    country: 'DE',
    region: 'eu-central-1',
    lat: 50.1109,
    lon: 8.6821,
    pingMs: 18,
    cryptoStatus: 'Kyber-1024 Handshake Active',
    protocol: 'QUIC / TLS 1.3 PQC',
    status: 'operational',
    tlsVersion: 'TLS 1.3 + ML-KEM-1024',
    activeTunnels: 382,
  },
  {
    id: 'pdx',
    name: 'Oregon Sovereign Vault',
    city: 'Oregon',
    country: 'US',
    region: 'us-west-2',
    lat: 43.8041,
    lon: -120.5542,
    pingMs: 22,
    cryptoStatus: 'Zero-Knowledge Sealed',
    protocol: 'QUIC / WireGuard Sovereign',
    status: 'operational',
    tlsVersion: 'TLS 1.3 + Dilithium-5',
    activeTunnels: 218,
  },
  {
    id: 'sin',
    name: 'Singapore APAC Router',
    city: 'Singapore',
    country: 'SG',
    region: 'ap-southeast-1',
    lat: 1.3521,
    lon: 103.8198,
    pingMs: 16,
    cryptoStatus: 'Post-Quantum Dilithium-5',
    protocol: 'QUIC / TLS 1.3 PQC',
    status: 'operational',
    tlsVersion: 'TLS 1.3 + ML-KEM-768',
    activeTunnels: 195,
  },
  {
    id: 'dub',
    name: 'Dublin EU Transit Mesh',
    city: 'Dublin',
    country: 'IE',
    region: 'eu-west-1',
    lat: 53.3498,
    lon: -6.2603,
    pingMs: 19,
    cryptoStatus: 'Kyber-1024 PQC Sealed',
    protocol: 'QUIC / TLS 1.3 PQC',
    status: 'operational',
    tlsVersion: 'TLS 1.3 + ML-KEM-1024',
    activeTunnels: 164,
  },
];

export const CANONICAL_DELIVERY_ARCS: DeliveryArc[] = [
  { fromId: 'bom', toId: 'fra', label: 'BOM-FRA', throughput: '10 Gbps' },
  { fromId: 'fra', toId: 'dub', label: 'FRA-DUB', throughput: '40 Gbps' },
  { fromId: 'dub', toId: 'pdx', label: 'DUB-PDX', throughput: '20 Gbps' },
  { fromId: 'pdx', toId: 'sin', label: 'PDX-SIN', throughput: '10 Gbps' },
  { fromId: 'sin', toId: 'bom', label: 'SIN-BOM', throughput: '25 Gbps' },
  { fromId: 'fra', toId: 'sin', label: 'FRA-SIN', throughput: '20 Gbps' },
];

// ============================================================================
// Math Utilities for 3D Spherical Coordinate Transformation
// ============================================================================

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface ScreenPoint {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

function latLonToSphere(lat: number, lon: number, radius: number): Point3D {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return {
    x: -(radius * Math.sin(phi) * Math.cos(theta)),
    y: radius * Math.cos(phi),
    z: radius * Math.sin(phi) * Math.sin(theta),
  };
}

function rotateX(point: Point3D, angleRad: number): Point3D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  };
}

function rotateY(point: Point3D, angleRad: number): Point3D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: point.x * cos + point.z * sin,
    y: point.y,
    z: -point.x * sin + point.z * cos,
  };
}

function projectPoint(
  p: Point3D,
  width: number,
  height: number,
  fov: number,
  zoom: number
): ScreenPoint {
  const distance = fov;
  const zOffset = p.z + distance;
  if (zOffset <= 0) {
    return { x: 0, y: 0, z: p.z, visible: false };
  }
  const scale = (distance / zOffset) * zoom;
  return {
    x: width / 2 + p.x * scale,
    y: height / 2 - p.y * scale,
    z: p.z,
    visible: p.z > -distance * 0.7,
  };
}

function slerpPoint(p1: Point3D, p2: Point3D, t: number, peakAltitude: number, baseRadius: number): Point3D {
  // Linear interpolation followed by re-normalization to sphere radius + parabolic altitude
  const x = p1.x + (p2.x - p1.x) * t;
  const y = p1.y + (p2.y - p1.y) * t;
  const z = p1.z + (p2.z - p1.z) * t;
  const len = Math.hypot(x, y, z) || 1;
  const altitude = Math.sin(Math.PI * t) * peakAltitude;
  const targetRadius = baseRadius + altitude;
  const factor = targetRadius / len;
  return {
    x: x * factor,
    y: y * factor,
    z: z * factor,
  };
}

// ============================================================================
// Pure SVG Icons (Zero Raw Unicode Emojis Invariant)
// ============================================================================

const ShieldCheckSvg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

const GlobeSvg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const ActivitySvg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const LockSvg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ZapSvg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const RotateCwSvg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const PauseSvg = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

// ============================================================================
// Graceful 2D SVG Fallback Component (Non-WebGL / SSR / Minimal Mode)
// ============================================================================

export function GlobalDeliveryFallback({
  nodes = CANONICAL_DELIVERY_NODES,
  selectedNodeId,
  onSelectNode,
}: {
  nodes?: DeliveryNode[];
  selectedNodeId?: string;
  onSelectNode?: (node: DeliveryNode) => void;
}) {
  const fallbackSvgId = useId();

  return (
    <div
      data-testid="global-delivery-fallback"
      className="relative w-full h-full min-h-[380px] flex flex-col items-center justify-between p-6 bg-[#0a0e17] rounded-xl border border-white/10 text-white select-none overflow-hidden"
    >
      {/* Background isometric grid overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(16,185,129,0.08),transparent_70%)] pointer-events-none" />

      {/* Top telemetry bar */}
      <div className="relative z-10 w-full flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <GlobeSvg className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold tracking-wider uppercase text-slate-200">
              QuantMail Telemetry Matrix
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              2D High-Fidelity Cryptographic Projection Fallback
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping mr-1.5" />
            5/5 PQC Nodes Verified
          </span>
        </div>
      </div>

      {/* SVG Isometric World Nodes Map */}
      <div className="relative w-full max-w-xl h-48 my-auto flex items-center justify-center">
        <svg
          className="w-full h-full"
          viewBox="0 0 600 240"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-label="Isometric routing mesh fallback"
        >
          <defs>
            <linearGradient id={`arcGrad-${fallbackSvgId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
              <stop offset="100%" stopColor="var(--quant-info)" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Concentric telemetry rings */}
          <ellipse cx="300" cy="120" rx="260" ry="85" stroke="var(--quant-surface-elevated)" strokeWidth="1" strokeDasharray="4 4" />
          <ellipse cx="300" cy="120" rx="190" ry="60" stroke="var(--quant-surface-elevated)" strokeWidth="1" />
          <ellipse cx="300" cy="120" rx="110" ry="35" stroke="#334155" strokeWidth="1" strokeDasharray="2 2" />

          {/* Connection paths */}
          {/* Mumbai (350, 130) -> Frankfurt (260, 90) */}
          <path d="M 350 130 Q 300 70 260 90" stroke={`url(#arcGrad-${fallbackSvgId})`} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Frankfurt (260, 90) -> Dublin (230, 80) */}
          <path d="M 260 90 Q 245 75 230 80" stroke={`url(#arcGrad-${fallbackSvgId})`} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Dublin (230, 80) -> Oregon (120, 95) */}
          <path d="M 230 80 Q 170 40 120 95" stroke={`url(#arcGrad-${fallbackSvgId})`} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Singapore (420, 145) -> Mumbai (350, 130) */}
          <path d="M 420 145 Q 390 120 350 130" stroke={`url(#arcGrad-${fallbackSvgId})`} strokeWidth="1.5" fill="none" opacity="0.7" />
          {/* Oregon (120, 95) -> Singapore (420, 145) cross-pacific arc */}
          <path d="M 120 95 Q 260 210 420 145" stroke={`url(#arcGrad-${fallbackSvgId})`} strokeWidth="1.5" strokeDasharray="3 3" fill="none" opacity="0.5" />

          {/* Fallback Node Positions */}
          {[
            { id: 'bom', x: 350, y: 130, label: 'Mumbai', ping: '14ms' },
            { id: 'fra', x: 260, y: 90, label: 'Frankfurt', ping: '18ms' },
            { id: 'dub', x: 230, y: 80, label: 'Dublin', ping: '19ms' },
            { id: 'pdx', x: 120, y: 95, label: 'Oregon', ping: '22ms' },
            { id: 'sin', x: 420, y: 145, label: 'Singapore', ping: '16ms' },
          ].map((n) => {
            const isSelected = selectedNodeId === n.id;
            return (
              <g
                key={n.id}
                className="cursor-pointer transition-transform hover:scale-110"
                onClick={() => {
                  const found = nodes.find((item) => item.id === n.id);
                  if (found && onSelectNode) onSelectNode(found);
                }}
              >
                <circle cx={n.x} cy={n.y} r={isSelected ? 8 : 5} fill={isSelected ? '#10b981' : '#06b6d4'} opacity="0.8" />
                <circle cx={n.x} cy={n.y} r={isSelected ? 14 : 9} stroke={isSelected ? '#10b981' : '#06b6d4'} strokeWidth="1" opacity="0.4" />
                <text x={n.x} y={n.y - 12} fill="#e2e8f0" fontSize="10" fontWeight="600" textAnchor="middle" fontFamily="monospace">
                  {n.label}
                </text>
                <text x={n.x} y={n.y + 18} fill="#34d399" fontSize="10" textAnchor="middle" fontFamily="monospace">
                  {n.ping}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom Node Chips */}
      <div className="relative z-10 w-full grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-white/5">
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          return (
            <button
              key={node.id}
              onClick={() => onSelectNode && onSelectNode(node)}
              className={`p-2 rounded-lg text-left transition-all border ${
                isSelected
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                  : 'bg-white/[0.02] border-white/5 hover:border-white/10 text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-200">
                <span>{node.city}</span>
                <span className="font-mono text-emerald-400 text-[10px]">{node.pingMs}ms</span>
              </div>
              <div className="text-[var(--q-type-xs)] font-mono text-slate-400 truncate mt-0.5">{node.region}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Primary GlobalDeliveryGlobe Component
// ============================================================================

export function GlobalDeliveryGlobe({
  nodes = CANONICAL_DELIVERY_NODES,
  arcs = CANONICAL_DELIVERY_ARCS,
  onSelectNode,
  selectedNodeId: controlledSelectedId,
  autoRotate = true,
  rotationSpeed = 0.003,
  height = 420,
  className = '',
  forceFallback = false,
}: GlobalDeliveryGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [activeNodeId, setActiveNodeId] = useState<string>(
    controlledSelectedId || (nodes[0]?.id ?? 'bom')
  );
  const [isRotating, setIsRotating] = useState<boolean>(autoRotate);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [webglSupported, setWebglSupported] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Sync controlled node selection
  useEffect(() => {
    if (controlledSelectedId) {
      setActiveNodeId(controlledSelectedId);
    }
  }, [controlledSelectedId]);

  const activeNode = nodes.find((n) => n.id === activeNodeId) || nodes[0];

  const handleSelectNode = useCallback(
    (node: DeliveryNode) => {
      setActiveNodeId(node.id);
      if (onSelectNode) {
        onSelectNode(node);
      }
    },
    [onSelectNode]
  );

  // Interactive 3D Canvas Lifecycle & WebGL Check
  useEffect(() => {
    if (forceFallback) {
      setWebglSupported(false);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check canvas 2D or WebGL context availability
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      setWebglSupported(false);
      return;
    }

    if (!ctx) {
      setWebglSupported(false);
      return;
    }

    let animationFrameId: number;
    let rotationY = 1.2;
    let rotationX = 0.25;
    let dragStartX = 0;
    let dragStartY = 0;
    let isPointerDown = false;
    let pulseTime = 0;

    // Responsive Canvas Resize Observer
    const handleResize = () => {
      if (!canvas || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(300, rect.width) * dpr;
      canvas.height = Math.max(260, rect.height) * dpr;
    };

    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Pointer Interaction Handlers
    const onPointerDown = (e: PointerEvent) => {
      isPointerDown = true;
      setIsDragging(true);
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      if (canvas) canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerDown) return;
      const deltaX = e.clientX - dragStartX;
      const deltaY = e.clientY - dragStartY;
      dragStartX = e.clientX;
      dragStartY = e.clientY;

      rotationY += deltaX * 0.006;
      rotationX = Math.max(-0.9, Math.min(0.9, rotationX + deltaY * 0.006));
    };

    const onPointerUp = (e: PointerEvent) => {
      isPointerDown = false;
      setIsDragging(false);
      if (canvas) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          // ignore release error
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoomLevel((prev) => Math.max(0.7, Math.min(1.6, prev - e.deltaY * 0.001)));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Precalculate Node 3D Vectors
    const BASE_RADIUS = 120;
    const nodeVectors = new Map<string, Point3D>();
    for (const node of nodes) {
      nodeVectors.set(node.id, latLonToSphere(node.lat, node.lon, BASE_RADIUS));
    }

    // Latitude parallels & Longitude meridians lines definition
    const parallels: Point3D[][] = [-60, -30, 0, 30, 60].map((lat) => {
      const ring: Point3D[] = [];
      for (let lon = -180; lon <= 180; lon += 10) {
        ring.push(latLonToSphere(lat, lon, BASE_RADIUS));
      }
      return ring;
    });

    const meridians: Point3D[][] = [0, 45, 90, 135, 180, 225, 270, 315].map((lon) => {
      const ring: Point3D[] = [];
      for (let lat = -80; lat <= 80; lat += 8) {
        ring.push(latLonToSphere(lat, lon, BASE_RADIUS));
      }
      return ring;
    });

    // ------------------------------------------------------------------------
    // Render Loop
    // ------------------------------------------------------------------------
    const render = () => {
      if (!ctx || !canvas) return;
      const width = canvas.width;
      const height = canvas.height;
      const fov = 400;
      const currentZoom = zoomLevel * (width / 700);

      // Auto rotation
      if (isRotating && !isPointerDown) {
        rotationY += rotationSpeed;
      }
      pulseTime += 0.015;

      ctx.clearRect(0, 0, width, height);

      // Transform 3D point helper
      const transform = (p: Point3D): ScreenPoint => {
        const pRotX = rotateX(p, rotationX);
        const pRotY = rotateY(pRotX, rotationY);
        return projectPoint(pRotY, width, height, fov, currentZoom);
      };

      // 1. Draw Globe Atmosphere Outer Glow
      const centerScreen = projectPoint({ x: 0, y: 0, z: 0 }, width, height, fov, currentZoom);
      const globeScreenRadius = BASE_RADIUS * (fov / (fov + 0)) * currentZoom;

      const radialGrad = ctx.createRadialGradient(
        centerScreen.x,
        centerScreen.y,
        globeScreenRadius * 0.7,
        centerScreen.x,
        centerScreen.y,
        globeScreenRadius * 1.25
      );
      radialGrad.addColorStop(0, 'rgba(16, 185, 129, 0.04)');
      radialGrad.addColorStop(0.7, 'rgba(6, 182, 212, 0.02)');
      radialGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = radialGrad;
      ctx.beginPath();
      ctx.arc(centerScreen.x, centerScreen.y, globeScreenRadius * 1.25, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw Wireframe Parallels
      ctx.lineWidth = 1;
      for (const ring of parallels) {
        ctx.beginPath();
        let started = false;
        for (const pt of ring) {
          const sp = transform(pt);
          if (sp.z > -20) {
            ctx.strokeStyle = sp.z > 30 ? 'rgba(51, 65, 85, 0.35)' : 'rgba(30, 41, 59, 0.2)';
            if (!started) {
              ctx.moveTo(sp.x, sp.y);
              started = true;
            } else {
              ctx.lineTo(sp.x, sp.y);
            }
          } else {
            started = false;
          }
        }
        ctx.stroke();
      }

      // 3. Draw Wireframe Meridians
      for (const meridian of meridians) {
        ctx.beginPath();
        let started = false;
        for (const pt of meridian) {
          const sp = transform(pt);
          if (sp.z > -20) {
            ctx.strokeStyle = sp.z > 30 ? 'rgba(51, 65, 85, 0.35)' : 'rgba(30, 41, 59, 0.2)';
            if (!started) {
              ctx.moveTo(sp.x, sp.y);
              started = true;
            } else {
              ctx.lineTo(sp.x, sp.y);
            }
          } else {
            started = false;
          }
        }
        ctx.stroke();
      }

      // 4. Draw Ballistic Cryptographic Connection Arcs
      const ARC_STEPS = 28;
      for (const arc of arcs) {
        const p1 = nodeVectors.get(arc.fromId);
        const p2 = nodeVectors.get(arc.toId);
        if (!p1 || !p2) continue;

        ctx.beginPath();
        let arcVisible = false;
        for (let i = 0; i <= ARC_STEPS; i++) {
          const t = i / ARC_STEPS;
          const arc3D = slerpPoint(p1, p2, t, 28, BASE_RADIUS);
          const sp = transform(arc3D);
          if (sp.z > -30) {
            arcVisible = true;
            if (i === 0) {
              ctx.moveTo(sp.x, sp.y);
            } else {
              ctx.lineTo(sp.x, sp.y);
            }
          }
        }

        if (arcVisible) {
          ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Telemetry Pulse Particle moving along arc
          const pulseOffset = (pulseTime % 1);
          const pulse3D = slerpPoint(p1, p2, pulseOffset, 28, BASE_RADIUS);
          const pulseSp = transform(pulse3D);
          if (pulseSp.z > -20) {
            ctx.beginPath();
            ctx.arc(pulseSp.x, pulseSp.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#34d399';
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 8;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      // 5. Draw Routing Nodes
      for (const node of nodes) {
        const v = nodeVectors.get(node.id);
        if (!v) continue;
        const sp = transform(v);

        // Cull nodes on backside of globe
        if (sp.z < -10) continue;

        const isSelected = node.id === activeNodeId;
        const alpha = Math.max(0.2, (sp.z + 100) / 220);

        // Concentric pulse ripple
        const pulseRadius = 6 + (Math.sin(pulseTime * 3 + node.pingMs) + 1) * 3;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, pulseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected
          ? `rgba(16, 185, 129, ${alpha * 0.8})`
          : `rgba(6, 182, 212, ${alpha * 0.4})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Core dot
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, isSelected ? 4.5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#10b981' : '#38bdf8';
        ctx.shadowColor = isSelected ? '#10b981' : '#0284c7';
        ctx.shadowBlur = isSelected ? 12 : 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Node Monospace City & Ping Label (for foreground nodes)
        if (sp.z > 20) {
          ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          ctx.textAlign = 'left';
          ctx.fillStyle = isSelected ? '#34d399' : '#cbd5e1';
          ctx.fillText(node.city, sp.x + 8, sp.y - 2);

          ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          ctx.fillStyle = '#10b981';
          ctx.fillText(`${node.pingMs}ms`, sp.x + 8, sp.y + 9);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    // Clean up all resources, listeners, and animation frames on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [forceFallback, nodes, arcs, isRotating, rotationSpeed, zoomLevel, activeNodeId]);

  // If WebGL/Canvas is unsupported or forceFallback is set, render the 2D SVG fallback
  if (!webglSupported || forceFallback) {
    return (
      <GlobalDeliveryFallback
        nodes={nodes}
        selectedNodeId={activeNodeId}
        onSelectNode={handleSelectNode}
      />
    );
  }

  return (
    <div
      data-testid="global-delivery-globe-container"
      className={`relative w-full rounded-xl bg-[#090d16] border border-white/10 text-white select-none overflow-hidden shadow-2xl ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {/* Top Telemetry Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between p-4 bg-gradient-to-b from-[#090d16] via-[#090d16]/80 to-transparent pointer-events-none">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <GlobeSvg className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-slate-100">
                QuantMail Global Telemetry
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ShieldCheckSvg className="w-3 h-3 mr-1" />
                PQC Sovereign Mesh
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5">
              5 Encrypted Points of Presence | Zero-Knowledge Delivery
            </p>
          </div>
        </div>

        {/* Rotation & Controls */}
        <div className="flex items-center space-x-2 pointer-events-auto mt-2 sm:mt-0">
          <button
            type="button"
            onClick={() => setIsRotating((prev) => !prev)}
            aria-label={isRotating ? 'Pause globe rotation' : 'Start globe rotation'}
            className="p-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-colors"
          >
            {isRotating ? <PauseSvg className="w-3.5 h-3.5" /> : <RotateCwSvg className="w-3.5 h-3.5" />}
          </button>
          <div className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/10 font-mono text-[11px] text-slate-300 flex items-center space-x-1.5">
            <ActivitySvg className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mean Ping:</span>
            <span className="text-emerald-400 font-semibold">17.8ms</span>
          </div>
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div ref={containerRef} className="relative w-full h-full cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="QuantMail 3D Global Delivery Globe showing encrypted routing nodes"
          className="w-full h-full block"
        />
        {isDragging && (
          <div className="absolute bottom-24 right-4 pointer-events-none px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-400">
            Rotating 3D Mesh
          </div>
        )}
      </div>

      {/* Bottom Node Inspector Card */}
      {activeNode && (
        <div
          data-testid="selected-node-inspector"
          className="absolute bottom-3 left-3 right-3 z-20 p-3 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center space-x-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-200">{activeNode.name}</span>
                <span className="text-[10px] font-mono px-1.5 py-px bg-white/10 rounded text-slate-300">
                  {activeNode.region}
                </span>
              </div>
              <div className="text-[10px] font-mono text-slate-400 flex items-center space-x-2 mt-0.5">
                <span className="text-emerald-400 flex items-center">
                  <ZapSvg className="w-3 h-3 mr-1" />
                  {activeNode.pingMs}ms latency
                </span>
                <span className="text-slate-600">/</span>
                <span className="text-cyan-400 flex items-center">
                  <LockSvg className="w-3 h-3 mr-1" />
                  {activeNode.cryptoStatus}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Node Selector Pills */}
          <div className="flex items-center space-x-1.5 overflow-x-auto py-1">
            {nodes.map((node) => {
              const isSelected = node.id === activeNode.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => handleSelectNode(node)}
                  className={`px-2 py-1 rounded text-[10px] font-mono transition-all border ${
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-white/5 text-slate-400 border-white/5 hover:border-white/15'
                  }`}
                >
                  {node.city} ({node.pingMs}ms)
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default GlobalDeliveryGlobe;
