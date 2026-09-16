'use client';

import { useEffect, useRef } from 'react';

export type OfficeAgent = {
  id: string;
  name: string;
  role: string;
  status: string;
  currentTask: string;
  thoughts?: string;
  color: string;
};

export type AgentOfficeCanvasProps = {
  agents: OfficeAgent[];
  onInspect: (agent: OfficeAgent) => void;
  className?: string;
};

type Point = {
  x: number;
  y: number;
};

type Desk = Point & {
  width: number;
  height: number;
};

type AgentSprite = {
  agent: OfficeAgent;
  desk: Desk;
  position: Point;
  target: Point;
  state: 'working' | 'walking' | 'chai';
  animationPhase: number;
  nextMoveAt: number;
  speechUntil: number;
};

const MAX_AGENTS = 8;
const WALK_SPEED = 64;
const HIT_RADIUS = 25;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
) {
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();

  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 1;
    context.stroke();
  }
}

function truncateText(context: CanvasRenderingContext2D, value: string, maxWidth: number) {
  if (context.measureText(value).width <= maxWidth) {
    return value;
  }

  let result = value;

  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1);
  }

  return `${result}…`;
}

function getDeskLayout(width: number, height: number): Desk[] {
  const horizontalPadding = clamp(width * 0.055, 24, 72);
  const top = clamp(height * 0.21, 105, 155);
  const bottom = clamp(height * 0.65, 310, height - 155);
  const usableWidth = width - horizontalPadding * 2;
  const columnWidth = usableWidth / 4;
  const deskWidth = clamp(columnWidth * 0.63, 90, 142);
  const deskHeight = clamp(height * 0.105, 54, 76);

  return Array.from({ length: MAX_AGENTS }, (_, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);

    return {
      x: horizontalPadding + columnWidth * column + columnWidth / 2,
      y: row === 0 ? top : bottom,
      width: deskWidth,
      height: deskHeight,
    };
  });
}

function getWorkPosition(desk: Desk): Point {
  return {
    x: desk.x,
    y: desk.y + desk.height / 2 + 28,
  };
}

function drawFloor(context: CanvasRenderingContext2D, width: number, height: number) {
  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, '#090d12');
  background.addColorStop(1, '#0d1117');

  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.beginPath();
  context.moveTo(42, 62);
  context.lineTo(width - 30, 62);
  context.lineTo(width - 66, height - 44);
  context.lineTo(76, height - 44);
  context.closePath();

  const floor = context.createLinearGradient(0, 60, 0, height);
  floor.addColorStop(0, '#1b2129');
  floor.addColorStop(1, '#141a21');

  context.fillStyle = floor;
  context.fill();
  context.strokeStyle = '#30363d';
  context.lineWidth = 1;
  context.stroke();
  context.clip();

  context.strokeStyle = 'rgba(48, 54, 61, 0.34)';
  context.lineWidth = 1;

  for (let x = -height; x < width + height; x += 46) {
    context.beginPath();
    context.moveTo(x, 62);
    context.lineTo(x + height * 0.18, height - 44);
    context.stroke();
  }

  for (let y = 105; y < height - 44; y += 52) {
    context.beginPath();
    context.moveTo(55, y);
    context.lineTo(width - 50, y);
    context.stroke();
  }

  context.restore();

  context.fillStyle = '#8b949e';
  context.font = '700 12px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText('QUANTGIT AGENT OPERATIONS FLOOR', 34, 35);

  context.fillStyle = '#484f58';
  context.font = '500 10px ui-monospace, SFMono-Regular, monospace';
  context.fillText('LIVE AUTONOMOUS WORKSPACE', 34, 51);
}

function drawDesk(context: CanvasRenderingContext2D, desk: Desk, agent: OfficeAgent) {
  const left = desk.x - desk.width / 2;
  const top = desk.y - desk.height / 2;

  context.save();

  context.fillStyle = 'rgba(0, 0, 0, 0.28)';
  context.beginPath();
  context.ellipse(
    desk.x + 7,
    desk.y + desk.height / 2 + 15,
    desk.width * 0.48,
    13,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();

  fillRoundedRect(context, left, top, desk.width, desk.height, 8, '#21262d', '#30363d');

  const monitorWidth = desk.width * 0.55;
  const monitorHeight = desk.height * 0.43;
  const monitorLeft = desk.x - monitorWidth / 2;
  const monitorTop = top + 9;

  fillRoundedRect(
    context,
    monitorLeft,
    monitorTop,
    monitorWidth,
    monitorHeight,
    4,
    '#010409',
    '#30363d',
  );

  context.fillStyle = agent.color;
  context.fillRect(monitorLeft + 8, monitorTop + monitorHeight - 6, monitorWidth - 16, 2);

  context.fillStyle = '#30363d';
  context.fillRect(desk.x - 3, monitorTop + monitorHeight, 6, 8);
  context.fillRect(desk.x - 15, monitorTop + monitorHeight + 7, 30, 3);

  context.fillStyle = '#0d1117';
  context.fillRect(left + 13, top + desk.height - 14, desk.width - 26, 6);

  context.fillStyle = '#8b949e';
  context.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText(agent.name, desk.x, top - 8);

  context.restore();
}

function drawChaiCorner(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
) {
  const cornerWidth = clamp(width * 0.18, 152, 220);
  const cornerHeight = clamp(height * 0.16, 82, 112);
  const x = width - cornerWidth - 38;
  const y = height - cornerHeight - 58;

  fillRoundedRect(context, x, y, cornerWidth, cornerHeight, 12, '#2b1a11', '#5c3016');

  context.fillStyle = '#ff8c42';
  context.font = '800 12px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText('CHAI CORNER', x + 17, y + 23);

  context.fillStyle = '#d29922';
  context.beginPath();
  context.moveTo(x + 20, y + 48);
  context.lineTo(x + 42, y + 40);
  context.lineTo(x + 56, y + 53);
  context.lineTo(x + 52, y + 72);
  context.lineTo(x + 24, y + 72);
  context.closePath();
  context.fill();

  context.strokeStyle = '#f0b72f';
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x + 55, y + 57, 10, -Math.PI / 2, Math.PI / 2);
  context.stroke();

  const cupPositions = [
    { x: x + cornerWidth - 69, y: y + 58 },
    { x: x + cornerWidth - 37, y: y + 58 },
  ];

  for (const cup of cupPositions) {
    fillRoundedRect(context, cup.x, cup.y, 20, 18, 3, '#d29922');

    context.strokeStyle = '#f0b72f';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(cup.x + 21, cup.y + 8, 5, -Math.PI / 2, Math.PI / 2);
    context.stroke();
  }

  for (let index = 0; index < 10; index += 1) {
    const cup = cupPositions[index % cupPositions.length];
    const cycle = (time * 0.025 + index * 11) % 35;
    const wave = Math.sin(time / 420 + index * 1.9) * 3;

    context.globalAlpha = 0.12 + ((35 - cycle) / 35) * 0.42;
    context.fillStyle = '#f0f6fc';
    context.beginPath();
    context.arc(cup.x + 10 + wave, cup.y - 3 - cycle, 1.2 + (index % 3) * 0.4, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;

  context.fillStyle = '#8b949e';
  context.font = '500 9px ui-sans-serif, system-ui, sans-serif';
  context.fillText('Kettle online · cutting chai ready', x + 17, y + cornerHeight - 12);
}

function drawSpeechBubble(context: CanvasRenderingContext2D, sprite: AgentSprite, width: number) {
  const bubbleWidth = clamp(width * 0.13, 105, 155);
  const bubbleHeight = 42;
  const x = clamp(sprite.position.x - bubbleWidth / 2, 12, width - bubbleWidth - 12);
  const y = sprite.position.y - 83;

  fillRoundedRect(context, x, y, bubbleWidth, bubbleHeight, 8, '#0d1117', '#30363d');

  context.beginPath();
  context.moveTo(sprite.position.x - 5, y + bubbleHeight);
  context.lineTo(sprite.position.x + 4, y + bubbleHeight);
  context.lineTo(sprite.position.x, y + bubbleHeight + 7);
  context.closePath();
  context.fillStyle = '#0d1117';
  context.fill();
  context.strokeStyle = '#30363d';
  context.stroke();

  context.fillStyle = sprite.agent.color;
  context.font = '700 9px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'left';
  context.fillText(
    sprite.state === 'chai' ? 'CHAI BREAK' : sprite.agent.status.toUpperCase(),
    x + 8,
    y + 14,
  );

  context.fillStyle = '#e6edf3';
  context.font = '500 9px ui-sans-serif, system-ui, sans-serif';
  context.fillText(
    truncateText(context, sprite.agent.currentTask, bubbleWidth - 16),
    x + 8,
    y + 29,
  );
}

function drawAgentSprite(context: CanvasRenderingContext2D, sprite: AgentSprite, time: number) {
  const moving =
    Math.hypot(sprite.target.x - sprite.position.x, sprite.target.y - sprite.position.y) > 3;

  const walkCycle = moving
    ? Math.sin(time / 95 + sprite.animationPhase)
    : Math.sin(time / 450 + sprite.animationPhase) * 0.18;

  const bob = moving
    ? Math.abs(Math.sin(time / 95 + sprite.animationPhase)) * 2.5
    : Math.sin(time / 520 + sprite.animationPhase) * 1.2;

  const x = sprite.position.x;
  const y = sprite.position.y + bob;

  context.save();

  context.fillStyle = 'rgba(0, 0, 0, 0.35)';
  context.beginPath();
  context.ellipse(x, y + 25, 15, 5, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = '#8b949e';
  context.lineWidth = 4;
  context.lineCap = 'round';

  context.beginPath();
  context.moveTo(x - 5, y + 12);
  context.lineTo(x - 7 + walkCycle * 4, y + 23);
  context.stroke();

  context.beginPath();
  context.moveTo(x + 5, y + 12);
  context.lineTo(x + 7 - walkCycle * 4, y + 23);
  context.stroke();

  fillRoundedRect(context, x - 11, y - 7, 22, 24, 7, sprite.agent.color, '#f0f6fc');

  context.strokeStyle = sprite.agent.color;
  context.lineWidth = 4;

  context.beginPath();
  context.moveTo(x - 10, y);
  context.lineTo(x - 17 - walkCycle * 3, y + 9);
  context.stroke();

  context.beginPath();
  context.moveTo(x + 10, y);
  context.lineTo(x + 17 + walkCycle * 3, y + 9);
  context.stroke();

  context.beginPath();
  context.arc(x, y - 14, 11, 0, Math.PI * 2);
  context.fillStyle = sprite.agent.color;
  context.fill();
  context.strokeStyle = '#f0f6fc';
  context.lineWidth = 1.5;
  context.stroke();

  context.fillStyle = '#010409';
  context.font = '900 9px ui-sans-serif, system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText(sprite.agent.name.slice(0, 1).toUpperCase(), x, y - 11);

  context.fillStyle = '#e6edf3';
  context.font = '700 10px ui-sans-serif, system-ui, sans-serif';
  context.fillText(sprite.agent.name, x, y + 39);

  context.restore();
}

export function AgentOfficeCanvas({ agents, onInspect, className = '' }: AgentOfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<AgentSprite[]>([]);
  const frameRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const onInspectRef = useRef(onInspect);

  useEffect(() => {
    onInspectRef.current = onInspect;
  }, [onInspect]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    let width = 0;
    let height = 0;
    let reducedMotion = false;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateMotionPreference = () => {
      reducedMotion = mediaQuery.matches;
    };

    updateMotionPreference();
    mediaQuery.addEventListener('change', updateMotionPreference);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      width = Math.max(rect.width, 320);
      height = Math.max(rect.height, 420);

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);

      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

      const desks = getDeskLayout(width, height);
      const existingById = new Map(spritesRef.current.map((sprite) => [sprite.agent.id, sprite]));

      spritesRef.current = agents.slice(0, MAX_AGENTS).map((agent, index) => {
        const desk = desks[index];
        const workPosition = getWorkPosition(desk);
        const existing = existingById.get(agent.id);

        return {
          agent,
          desk,
          position: existing?.position ?? { ...workPosition },
          target: existing?.target ?? { ...workPosition },
          state: existing?.state ?? 'working',
          animationPhase: existing?.animationPhase ?? index * 0.83,
          nextMoveAt: existing?.nextMoveAt ?? performance.now() + 3500 + index * 700,
          speechUntil: existing?.speechUntil ?? performance.now() + 2600 + index * 350,
        };
      });
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const chooseNextTarget = (sprite: AgentSprite, time: number) => {
      const chaiPosition = {
        x: width - clamp(width * 0.18, 152, 220) / 2 - 38,
        y: height - clamp(height * 0.16, 82, 112) - 75,
      };

      if (sprite.state === 'working') {
        sprite.state = 'walking';
        sprite.target = chaiPosition;
        sprite.nextMoveAt = time + 7000;
      } else {
        sprite.state = 'walking';
        sprite.target = getWorkPosition(sprite.desk);
        sprite.nextMoveAt = time + 8000;
      }

      sprite.speechUntil = time + 2600;
    };

    const animate = (time: number) => {
      const previousTime = previousTimeRef.current ?? time;
      const deltaSeconds = Math.min((time - previousTime) / 1000, 0.05);
      previousTimeRef.current = time;

      drawFloor(context, width, height);

      for (const sprite of spritesRef.current) {
        drawDesk(context, sprite.desk, sprite.agent);
      }

      drawChaiCorner(context, width, height, time);

      for (const sprite of spritesRef.current) {
        if (!reducedMotion && time >= sprite.nextMoveAt) {
          chooseNextTarget(sprite, time);
        }

        const dx = sprite.target.x - sprite.position.x;
        const dy = sprite.target.y - sprite.position.y;
        const distance = Math.hypot(dx, dy);

        if (!reducedMotion && distance > 2) {
          const movement = Math.min(WALK_SPEED * deltaSeconds, distance);

          sprite.position.x += (dx / distance) * movement;
          sprite.position.y += (dy / distance) * movement;
        } else if (distance <= 2) {
          sprite.position = { ...sprite.target };

          const workPosition = getWorkPosition(sprite.desk);
          const atDesk =
            Math.hypot(sprite.position.x - workPosition.x, sprite.position.y - workPosition.y) < 6;

          sprite.state = atDesk ? 'working' : 'chai';

          if (time >= sprite.nextMoveAt) {
            sprite.nextMoveAt = time + (sprite.state === 'working' ? 5000 : 3500);
          }
        }

        drawAgentSprite(context, sprite, time);

        if (time < sprite.speechUntil || sprite.state === 'working') {
          drawSpeechBubble(context, sprite, width);
        }
      }

      frameRef.current = window.requestAnimationFrame(animate);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const hasHit = spritesRef.current.some(
        (sprite) => Math.hypot(sprite.position.x - x, sprite.position.y - y) <= HIT_RADIUS,
      );

      canvas.style.cursor = hasHit ? 'pointer' : 'default';
    };

    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const hit = spritesRef.current.find(
        (sprite) => Math.hypot(sprite.position.x - x, sprite.position.y - y) <= HIT_RADIUS,
      );

      if (hit) {
        hit.speechUntil = performance.now() + 4000;
        onInspectRef.current(hit.agent);
      }
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('click', handleClick);
    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }

      previousTimeRef.current = null;
      resizeObserver.disconnect();
      mediaQuery.removeEventListener('change', updateMotionPreference);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [agents]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Interactive Agent Lab office. Select an agent to inspect their dossier."
      className={`min-h-[420px] w-full touch-manipulation rounded-xl border border-[#30363d] bg-[#0d1117] ${className}`}
    />
  );
}
