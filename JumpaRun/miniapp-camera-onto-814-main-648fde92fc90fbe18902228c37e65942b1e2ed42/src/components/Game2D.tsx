'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Home, Pause, Play } from 'lucide-react';
import type { PowerUpId, PowerUpInventory } from '@/lib/powerups';

export interface Game2DProps {
  isPlaying: boolean;
  paused: boolean;
  inventory: PowerUpInventory;
  /** Order in which timed/charge power-ups should activate. */
  queue: PowerUpId[];
  onGameOver: (score: number, jumpEarned: number) => void;
  onScoreUpdate: (score: number) => void;
  onJumpCollected: (total: number) => void;
  onConsumePowerUp: (id: PowerUpId) => void;
  onPause: () => void;
  onHome: () => void;
}

interface Vec {
  x: number;
  y: number;
}

interface Player extends Vec {
  w: number;
  h: number;
  vy: number;
  onGround: boolean;
  jumpsUsed: number;
  trail: Vec[];
}

type ObstacleType = 'spike' | 'tall' | 'drone' | 'saw';
interface Obstacle extends Vec {
  w: number;
  h: number;
  type: ObstacleType;
  phase: number;
}

interface Token extends Vec {
  collected: boolean;
  bob: number;
}

interface Particle extends Vec {
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

interface Star extends Vec {
  size: number;
  speed: number;
  twinkle: number;
}

interface Mountain {
  x: number;
  w: number;
  h: number;
  shade: number;
}

export default function Game2D({
  isPlaying,
  paused,
  inventory,
  queue,
  onGameOver,
  onScoreUpdate,
  onJumpCollected,
  onConsumePowerUp,
  onPause,
  onHome,
}: Game2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 480 });
  const audioCtxRef = useRef<AudioContext | null>(null);

  const cbRef = useRef({
    onGameOver,
    onScoreUpdate,
    onJumpCollected,
    onConsumePowerUp,
  });
  const pausedRef = useRef(paused);
  const inventoryRef = useRef(inventory);
  const queueRef = useRef(queue);

  useEffect(() => {
    cbRef.current = { onGameOver, onScoreUpdate, onJumpCollected, onConsumePowerUp };
  }, [onGameOver, onScoreUpdate, onJumpCollected, onConsumePowerUp]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const update = () => {
      const maxW = Math.min(window.innerWidth - 16, 960);
      const h = Math.min(window.innerHeight * 0.6, 500);
      setDimensions({ width: maxW, height: h });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const playSound = useCallback((type: 'jump' | 'coin' | 'hit' | 'powerup') => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'jump') {
        osc.frequency.setValueAtTime(420, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'coin') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      } catch {
        /* ignore */
      }
    }

    const W = dimensions.width;
    const H = dimensions.height;
    const GROUND_Y = H - 70;

    // Physics
    const GRAVITY = 0.8;
    const JUMP_V = -14.5;
    const DOUBLE_JUMP_V = -12.5;
    const MAX_HOLD = 9;

    const player: Player = {
      x: 110,
      y: GROUND_Y - 52,
      w: 44,
      h: 52,
      vy: 0,
      onGround: true,
      jumpsUsed: 0,
      trail: [],
    };

    let obstacles: Obstacle[] = [];
    let tokens: Token[] = [];
    let particles: Particle[] = [];
    const stars: Star[] = [];
    const mountains: Mountain[] = [];

    for (let i = 0; i < 55; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (GROUND_Y - 40),
        size: Math.random() * 1.5 + 0.3,
        speed: 0.08 + Math.random() * 0.18,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 10; i++) {
      mountains.push({
        x: (W / 5) * i + Math.random() * 60,
        w: 160 + Math.random() * 120,
        h: 80 + Math.random() * 120,
        shade: Math.random() * 0.3,
      });
    }

    // -------- Runtime state --------
    let score = 0;
    let jumpCount = 0;
    let speed = 4.6;
    let gameActive = true;
    let cameraShake = 0;
    let jumpHold = 0;
    let isHoldingJump = false;

    // Passive power-ups (always available from start if purchased)
    let shieldCharges = inventoryRef.current.shield;
    let djRemaining = inventoryRef.current.doubleJump;
    let autoJumpRemaining = inventoryRef.current.autoJump;

    // Timed power-up queue (one at a time)
    type TimedId = 'magnet' | 'slowmo' | 'rocket';
    const timedQueue: TimedId[] = [];
    const qInv = { ...inventoryRef.current };
    // Use the provided purchase order so things activate in the order the user bought them
    queueRef.current.forEach((id) => {
      if (id === 'magnet' || id === 'slowmo' || id === 'rocket') {
        while (qInv[id] > 0) {
          timedQueue.push(id);
          qInv[id]--;
        }
      }
    });
    // Any leftovers (shouldn't happen) append
    (['magnet', 'slowmo', 'rocket'] as TimedId[]).forEach((id) => {
      while (qInv[id] > 0) {
        timedQueue.push(id);
        qInv[id]--;
      }
    });

    // Currently active timed power-up
    let activeTimed: TimedId | null = null;
    let activeTimedEnd = 0;
    let activeTimedStart = 0;

    const TIMED_DURATIONS: Record<TimedId, number> = {
      magnet: 12_000,
      slowmo: 8_000,
      rocket: 5_000,
    };

    const startNextTimed = (now: number) => {
      const next = timedQueue.shift();
      if (!next) {
        activeTimed = null;
        return;
      }
      activeTimed = next;
      activeTimedStart = now;
      activeTimedEnd = now + TIMED_DURATIONS[next];
      cbRef.current.onConsumePowerUp(next);
      playSound('powerup');
    };

    // Consume passive power-ups so the inventory stays in sync
    if (shieldCharges > 0) {
      for (let i = 0; i < shieldCharges; i++) cbRef.current.onConsumePowerUp('shield');
    }
    // doubleJump and autoJump are charge-based but we consume all at game start
    if (djRemaining > 0) {
      for (let i = 0; i < djRemaining; i++) cbRef.current.onConsumePowerUp('doubleJump');
    }
    if (autoJumpRemaining > 0) {
      for (let i = 0; i < autoJumpRemaining; i++) cbRef.current.onConsumePowerUp('autoJump');
    }

    // Start first timed power-up after a short grace period so the player has time to orient
    const firstTimedAt = performance.now() + 1500;
    let firstTimedStarted = false;

    // Throttle React state updates (biggest perf fix — was firing every frame!)
    let lastScoreSent = 0;
    let lastTokenSent = 0;
    const STATE_UPDATE_MS = 150;

    let lastAutoJump = 0;

    const spawnParticles = (x: number, y: number, color: string, count = 10, spread = 6) => {
      for (let i = 0; i < count; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * spread,
          vy: (Math.random() - 0.8) * spread,
          life: 1,
          size: 2 + Math.random() * 3,
          color,
        });
      }
    };

    const doJump = () => {
      const rocketOn = activeTimed === 'rocket';
      if (rocketOn) return;
      if (player.onGround) {
        player.vy = JUMP_V;
        player.onGround = false;
        player.jumpsUsed = 1;
        jumpHold = 0;
        isHoldingJump = true;
        playSound('jump');
        spawnParticles(player.x + player.w / 2, player.y + player.h, 'hsl(190 95% 50%)', 8, 5);
      } else if (djRemaining > 0 && player.jumpsUsed < 2) {
        player.vy = DOUBLE_JUMP_V;
        player.jumpsUsed = 2;
        jumpHold = 0;
        isHoldingJump = true;
        djRemaining--;
        playSound('jump');
        spawnParticles(
          player.x + player.w / 2,
          player.y + player.h / 2,
          'hsl(145 70% 50%)',
          14,
          7,
        );
      }
    };

    const onDown = (e: Event) => {
      e.preventDefault();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      doJump();
    };
    const onUp = () => {
      isHoldingJump = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        doJump();
        isHoldingJump = true;
      }
      if (e.code === 'KeyP') onPause();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        isHoldingJump = false;
      }
    };

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchend', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);

    // -------- Spawners --------
    // Distance-based spawning — more predictable than time-based with variable speed
    let distSinceObstacle = 0;
    let distSinceToken = 0;

    const spawnObstacle = () => {
      const r = Math.random();
      let type: ObstacleType;
      let w: number;
      let h: number;
      let y: number;
      if (r < 0.5) {
        type = 'spike';
        w = 28;
        h = 40;
        y = GROUND_Y - h;
      } else if (r < 0.75) {
        type = 'tall';
        w = 30;
        h = 70;
        y = GROUND_Y - h;
      } else if (r < 0.9) {
        type = 'saw';
        w = 38;
        h = 38;
        y = GROUND_Y - h;
      } else {
        type = 'drone';
        w = 44;
        h = 28;
        y = GROUND_Y - 120 - Math.random() * 30;
      }
      obstacles.push({ x: W + 40, y, w, h, type, phase: 0 });
    };

    const spawnTokenLine = () => {
      // Small, readable patterns of 3 tokens
      const baseX = W + 60;
      const pattern = Math.floor(Math.random() * 3);
      const count = 3;
      for (let i = 0; i < count; i++) {
        let y: number;
        if (pattern === 0) {
          // low line — pick up while running
          y = GROUND_Y - 40;
        } else if (pattern === 1) {
          // arc (jump-height)
          const t = i / (count - 1);
          y = GROUND_Y - 80 - Math.sin(t * Math.PI) * 50;
        } else {
          // high line — needs a jump to reach
          y = GROUND_Y - 110;
        }
        tokens.push({ x: baseX + i * 34, y, collected: false, bob: Math.random() * Math.PI * 2 });
      }
    };

    const rectHit = (ax: number, ay: number, aw: number, ah: number, o: Obstacle) => {
      const m = 5;
      return ax + m < o.x + o.w && ax + aw - m > o.x && ay + m < o.y + o.h && ay + ah - m > o.y;
    };

    let animId = 0;

    const update = () => {
      const now = performance.now();

      // Start the first timed power-up after grace period
      if (!firstTimedStarted && now >= firstTimedAt) {
        firstTimedStarted = true;
        if (timedQueue.length > 0) startNextTimed(now);
      }

      // Expire timed power-up -> start next one from the queue
      if (activeTimed && now >= activeTimedEnd) {
        activeTimed = null;
        if (timedQueue.length > 0) startNextTimed(now);
      }

      const magnetOn = activeTimed === 'magnet';
      const slowmoOn = activeTimed === 'slowmo';
      const rocketOn = activeTimed === 'rocket';

      const effSpeed = rocketOn ? speed * 1.6 : slowmoOn ? speed * 0.55 : speed;

      // Variable jump height
      if (isHoldingJump && jumpHold < MAX_HOLD && player.vy < 0) {
        player.vy -= 0.5;
        jumpHold++;
      }

      // Auto-jump
      if (autoJumpRemaining > 0 && obstacles.length > 0 && player.onGround) {
        const next = obstacles.find((o) => o.x + o.w > player.x);
        if (next) {
          const dist = next.x - (player.x + player.w);
          if (dist > 90 && dist < 160 && now - lastAutoJump > 500) {
            doJump();
            autoJumpRemaining--;
            lastAutoJump = now;
          }
        }
      }

      // Rocket: float at mid-air
      if (rocketOn) {
        const target = GROUND_Y - 170;
        player.y += (target - player.y) * 0.2;
        player.vy = 0;
        player.onGround = false;
      } else {
        player.vy += GRAVITY;
        if (player.vy > 20) player.vy = 20;
        player.y += player.vy;
        if (player.y >= GROUND_Y - player.h) {
          player.y = GROUND_Y - player.h;
          player.vy = 0;
          if (!player.onGround) {
            spawnParticles(player.x + player.w / 2, GROUND_Y, 'hsl(190 95% 50%)', 6, 4);
          }
          player.onGround = true;
          player.jumpsUsed = 0;
          jumpHold = 0;
        }
      }

      // Trail
      player.trail.push({ x: player.x + player.w / 2, y: player.y + player.h / 2 });
      if (player.trail.length > 12) player.trail.shift();

      // Gentle speed ramp (was too aggressive before)
      speed = Math.min(speed + 0.0006, 9);

      // Move obstacles
      obstacles.forEach((o) => {
        o.x -= effSpeed;
        o.phase += 0.1;
        if (o.type === 'drone') o.y += Math.sin(o.phase) * 0.5;
      });
      obstacles = obstacles.filter((o) => o.x + o.w > -40);

      // Distance-based obstacle spawn — scales gap with speed so game stays readable
      distSinceObstacle += effSpeed;
      const minGap = Math.max(240, 360 - speed * 8);
      const maxGap = minGap + 200;
      if (distSinceObstacle > minGap + Math.random() * (maxGap - minGap)) {
        spawnObstacle();
        distSinceObstacle = 0;
      }

      // Tokens
      tokens.forEach((c) => {
        c.x -= effSpeed;
        c.bob += 0.14;
        if (magnetOn) {
          const dx = player.x + player.w / 2 - c.x;
          const dy = player.y + player.h / 2 - c.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 240) {
            const pull = (1 - dist / 240) * 5;
            c.x += (dx / dist) * pull;
            c.y += (dy / dist) * pull;
          }
        }
      });
      tokens = tokens.filter((c) => !c.collected && c.x > -40);

      distSinceToken += effSpeed;
      if (distSinceToken > 420 + Math.random() * 300) {
        spawnTokenLine();
        distSinceToken = 0;
      }

      // Token pickups
      for (const c of tokens) {
        const dx = c.x - (player.x + player.w / 2);
        const dy = c.y - (player.y + player.h / 2);
        if (Math.hypot(dx, dy) < 26) {
          c.collected = true;
          jumpCount += 10; // each pickup = 10 $JUMP
          playSound('coin');
          spawnParticles(c.x, c.y, 'hsl(35 95% 58%)', 6, 3);
        }
      }

      // Obstacle collision
      for (const o of obstacles) {
        if (rectHit(player.x, player.y, player.w, player.h, o)) {
          if (rocketOn) {
            spawnParticles(o.x + o.w / 2, o.y + o.h / 2, 'hsl(35 95% 58%)', 20, 9);
            o.x = -9999;
            cameraShake = 6;
            playSound('hit');
            continue;
          }
          if (shieldCharges > 0) {
            shieldCharges--;
            spawnParticles(
              player.x + player.w / 2,
              player.y + player.h / 2,
              'hsl(190 95% 50%)',
              28,
              10,
            );
            obstacles.forEach((other) => {
              if (Math.abs(other.x - player.x) < 180) other.x = -9999;
            });
            cameraShake = 8;
            playSound('powerup');
            continue;
          }
          gameActive = false;
          cameraShake = 14;
          playSound('hit');
          spawnParticles(
            player.x + player.w / 2,
            player.y + player.h / 2,
            'hsl(0 84% 60%)',
            26,
            10,
          );
          cbRef.current.onGameOver(Math.floor(score), jumpCount);
          return;
        }
      }

      // Particles
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.life -= 0.022;
      });
      particles = particles.filter((p) => p.life > 0);

      // Background layers
      stars.forEach((s) => {
        s.x -= s.speed;
        s.twinkle += 0.04;
        if (s.x < -4) {
          s.x = W + 4;
          s.y = Math.random() * (GROUND_Y - 40);
        }
      });
      mountains.forEach((m) => {
        m.x -= effSpeed * 0.12;
        if (m.x + m.w < -20) {
          m.x = W + Math.random() * 80;
          m.w = 160 + Math.random() * 120;
          m.h = 80 + Math.random() * 120;
        }
      });

      // Scoring
      const gain = rocketOn ? 2.2 : 1;
      score += gain;

      // Throttled React state updates (150ms) — was the main source of "hanging"
      if (now - lastScoreSent > STATE_UPDATE_MS) {
        cbRef.current.onScoreUpdate(Math.floor(score));
        lastScoreSent = now;
      }
      if (now - lastTokenSent > STATE_UPDATE_MS) {
        cbRef.current.onJumpCollected(jumpCount);
        lastTokenSent = now;
      }

      if (cameraShake > 0) cameraShake *= 0.88;
    };

    // -------- Drawing --------
    const drawPlayer = () => {
      const now = performance.now();
      const rocketOn = activeTimed === 'rocket';
      const magnetOn = activeTimed === 'magnet';
      const slowmoOn = activeTimed === 'slowmo';

      for (let i = 0; i < player.trail.length; i++) {
        const t = player.trail[i];
        const a = i / player.trail.length;
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = rocketOn ? 'hsl(35 95% 58%)' : 'hsl(190 95% 50%)';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 4 + a * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const px = player.x;
      const py = player.y;
      const pw = player.w;
      const ph = player.h;
      const cx = px + pw / 2;
      const cy = py + ph / 2;
      const r = pw / 2;

      ctx.shadowColor = rocketOn ? 'hsl(35 95% 58%)' : 'hsl(190 95% 50%)';
      ctx.shadowBlur = 22;

      ctx.fillStyle = rocketOn ? 'hsl(35 95% 58%)' : 'hsl(190 95% 50%)';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'hsl(222 47% 5%)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // "J" for JUMP
      ctx.fillStyle = rocketOn ? 'hsl(35 95% 58%)' : 'hsl(190 95% 50%)';
      ctx.font = 'bold 18px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('J', cx, cy + 1);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';

      if (shieldCharges > 0) {
        ctx.strokeStyle = `hsl(190 95% 50% / ${0.5 + Math.sin(now * 0.01) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (magnetOn) {
        ctx.strokeStyle = `hsl(320 90% 60% / ${0.3 + Math.sin(now * 0.008) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(cx, cy, 200, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (slowmoOn) {
        ctx.strokeStyle = `hsl(190 95% 50% / ${0.2 + Math.sin(now * 0.005) * 0.15})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 16 + Math.sin(now * 0.01) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (rocketOn) {
        ctx.fillStyle = 'hsl(35 95% 58%)';
        for (let i = 0; i < 4; i++) {
          ctx.globalAlpha = 0.6 - i * 0.14;
          ctx.beginPath();
          ctx.ellipse(px - 6 - i * 8, cy, 4, 10 + i * 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    };

    const drawObstacle = (o: Obstacle) => {
      ctx.save();
      const now = performance.now();
      if (o.type === 'spike') {
        const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
        grad.addColorStop(0, 'hsl(0 84% 70%)');
        grad.addColorStop(1, 'hsl(0 84% 45%)');
        ctx.shadowColor = 'hsl(0 84% 60%)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y + o.h);
        ctx.lineTo(o.x + o.w / 2, o.y);
        ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'hsl(0 84% 30%)';
        ctx.fillRect(o.x - 2, o.y + o.h - 4, o.w + 4, 4);
      } else if (o.type === 'tall') {
        const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y);
        grad.addColorStop(0, 'hsl(320 90% 35%)');
        grad.addColorStop(0.5, 'hsl(320 90% 55%)');
        grad.addColorStop(1, 'hsl(320 90% 35%)');
        ctx.shadowColor = 'hsl(320 90% 60%)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = grad;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'hsl(320 90% 70%)';
        ctx.fillRect(o.x - 2, o.y, o.w + 4, 6);
        ctx.fillStyle = 'hsl(222 47% 5%)';
        for (let i = 1; i < 4; i++) {
          ctx.fillRect(o.x + 4, o.y + (o.h / 4) * i, o.w - 8, 2);
        }
      } else if (o.type === 'drone') {
        ctx.shadowColor = 'hsl(35 95% 58%)';
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'hsl(35 95% 58%)';
        ctx.beginPath();
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'hsl(222 47% 5%)';
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2, o.y + o.h / 2, o.h / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'hsl(0 84% 60%)';
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2, o.y + o.h / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'hsl(35 95% 58%)';
        ctx.lineWidth = 2;
        const prop = Math.sin(now * 0.05) * 10;
        ctx.beginPath();
        ctx.moveTo(o.x - 4, o.y + 4);
        ctx.lineTo(o.x + 4 + prop, o.y - 2);
        ctx.moveTo(o.x + o.w + 4, o.y + 4);
        ctx.lineTo(o.x + o.w - 4 - prop, o.y - 2);
        ctx.stroke();
      } else if (o.type === 'saw') {
        ctx.shadowColor = 'hsl(190 95% 50%)';
        ctx.shadowBlur = 16;
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const rad = o.w / 2;
        ctx.fillStyle = 'hsl(190 95% 50%)';
        ctx.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + o.phase;
          const rr = i % 2 === 0 ? rad : rad * 0.7;
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'hsl(222 47% 5%)';
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawToken = (c: Token) => {
      const now = performance.now();
      const pulse = 1 + Math.sin(c.bob) * 0.08;
      ctx.save();
      ctx.shadowColor = 'hsl(35 95% 58%)';
      ctx.shadowBlur = 14;

      // outer coin
      ctx.fillStyle = 'hsl(35 95% 58%)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // inner disc
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'hsl(222 47% 5%)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 9 * pulse, 0, Math.PI * 2);
      ctx.fill();

      // "J" logo
      ctx.fillStyle = 'hsl(35 95% 58%)';
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('J', c.x, c.y + 1);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';

      // pulsing ring
      ctx.strokeStyle = `hsl(35 95% 58% / ${0.25 + Math.sin(now * 0.008 + c.bob) * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 16 + Math.sin(c.bob * 1.2) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    const draw = () => {
      const now = performance.now();
      const rocketOn = activeTimed === 'rocket';
      const slowmoOn = activeTimed === 'slowmo';
      const magnetOn = activeTimed === 'magnet';

      const shakeX = (Math.random() - 0.5) * cameraShake;
      const shakeY = (Math.random() - 0.5) * cameraShake;

      const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, 'hsl(222 47% 5%)');
      skyGrad.addColorStop(0.5, 'hsl(222 50% 10%)');
      skyGrad.addColorStop(1, 'hsl(222 55% 16%)');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(shakeX, shakeY);

      stars.forEach((s) => {
        const alpha = 0.4 + Math.sin(s.twinkle) * 0.4;
        ctx.fillStyle = `hsl(190 95% 80% / ${alpha})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      });

      mountains.forEach((m) => {
        ctx.fillStyle = `hsl(222 40% ${12 + m.shade * 8}%)`;
        ctx.beginPath();
        ctx.moveTo(m.x, GROUND_Y);
        ctx.lineTo(m.x + m.w / 2, GROUND_Y - m.h);
        ctx.lineTo(m.x + m.w, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'hsl(190 95% 50% / 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.x, GROUND_Y);
        ctx.lineTo(m.x + m.w / 2, GROUND_Y - m.h);
        ctx.lineTo(m.x + m.w, GROUND_Y);
        ctx.stroke();
      });

      ctx.strokeStyle = 'hsl(190 95% 50% / 0.15)';
      ctx.lineWidth = 1;
      const horizonY = GROUND_Y;
      for (let i = 0; i < 10; i++) {
        const y = horizonY + i * 8 + i * i * 0.8;
        if (y > H) break;
        ctx.globalAlpha = 1 - i / 10;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.4;
      const vpX = W / 2;
      const offset = (performance.now() * 0.06) % 40;
      for (let i = -12; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(vpX + i * 40 + offset, horizonY);
        ctx.lineTo(vpX + i * 160, H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = 'hsl(190 95% 50% / 0.55)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'hsl(190 95% 50%)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(W, GROUND_Y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (slowmoOn) {
        ctx.fillStyle = 'hsl(190 95% 50% / 0.08)';
        ctx.fillRect(0, 0, W, H);
      }
      if (rocketOn) {
        ctx.fillStyle = 'hsl(35 95% 58% / 0.08)';
        ctx.fillRect(0, 0, W, H);
      }

      obstacles.forEach(drawObstacle);
      tokens.forEach(drawToken);

      particles.forEach((p) => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      drawPlayer();
      ctx.restore();

      // HUD
      const roundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
      };

      // Active power-up badge (timed)
      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      let row = 0;
      if (activeTimed) {
        const color =
          activeTimed === 'rocket'
            ? 'hsl(35 95% 58%)'
            : activeTimed === 'magnet'
              ? 'hsl(320 90% 60%)'
              : 'hsl(190 95% 50%)';
        const label =
          activeTimed === 'rocket' ? 'ROCKET' : activeTimed === 'magnet' ? 'MAGNET' : 'SLOW-MO';
        const remaining = Math.max(0, Math.ceil((activeTimedEnd - now) / 1000));
        // progress bar
        const pct =
          1 - (now - activeTimedStart) / (activeTimedEnd - activeTimedStart || 1);
        const text = `${label} ${remaining}s`;
        const w = ctx.measureText(text).width + 28;
        const x = 14;
        const y = 14 + row * 30;
        ctx.fillStyle = 'hsl(222 40% 8% / 0.85)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        roundedRect(x, y, w, 22, 6);
        ctx.fill();
        ctx.stroke();
        // bar
        ctx.fillStyle = `${color.replace(')', ' / 0.25)').replace('hsl', 'hsl')}`;
        roundedRect(x, y + 18, w * pct, 4, 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText(text, x + 10, y + 14);
        row++;
      }
      if (shieldCharges > 0) {
        const x = 14;
        const y = 14 + row * 30;
        const text = `SHIELD ×${shieldCharges}`;
        const w = ctx.measureText(text).width + 28;
        ctx.fillStyle = 'hsl(222 40% 8% / 0.85)';
        ctx.strokeStyle = 'hsl(190 95% 50%)';
        ctx.lineWidth = 1;
        roundedRect(x, y, w, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'hsl(190 95% 50%)';
        ctx.fillText(text, x + 10, y + 14);
        row++;
      }
      if (djRemaining > 0) {
        const x = 14;
        const y = 14 + row * 30;
        const text = `2X JUMP ×${djRemaining}`;
        const w = ctx.measureText(text).width + 28;
        ctx.fillStyle = 'hsl(222 40% 8% / 0.85)';
        ctx.strokeStyle = 'hsl(145 70% 50%)';
        ctx.lineWidth = 1;
        roundedRect(x, y, w, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'hsl(145 70% 50%)';
        ctx.fillText(text, x + 10, y + 14);
        row++;
      }
      if (autoJumpRemaining > 0) {
        const x = 14;
        const y = 14 + row * 30;
        const text = `AUTO ×${autoJumpRemaining}`;
        const w = ctx.measureText(text).width + 28;
        ctx.fillStyle = 'hsl(222 40% 8% / 0.85)';
        ctx.strokeStyle = 'hsl(145 70% 50%)';
        ctx.lineWidth = 1;
        roundedRect(x, y, w, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'hsl(145 70% 50%)';
        ctx.fillText(text, x + 10, y + 14);
        row++;
      }

      // Queue indicator (bottom-left): shows how many timed power-ups still waiting
      if (timedQueue.length > 0) {
        ctx.fillStyle = 'hsl(222 40% 8% / 0.85)';
        ctx.strokeStyle = 'hsl(210 20% 96% / 0.25)';
        ctx.lineWidth = 1;
        const text = `NEXT · ${timedQueue.length} queued`;
        const w = ctx.measureText(text).width + 20;
        roundedRect(14, H - 34, w, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'hsl(210 20% 96%)';
        ctx.fillText(text, 24, H - 20);
      }

      // Pause overlay
      if (pausedRef.current) {
        ctx.fillStyle = 'hsl(222 47% 5% / 0.8)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'hsl(190 95% 50%)';
        ctx.font = 'bold 44px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', W / 2, H / 2 - 10);
        ctx.font = 'bold 13px ui-sans-serif, system-ui';
        ctx.fillStyle = 'hsl(210 20% 96%)';
        ctx.fillText('Open the shop to buy power-ups', W / 2, H / 2 + 18);
        ctx.textAlign = 'start';
      }
    };

    const loop = () => {
      if (!pausedRef.current && gameActive) update();
      draw();
      if (gameActive) animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('touchstart', onDown);
      canvas.removeEventListener('touchend', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [isPlaying, dimensions, playSound, onPause]);

  return (
    <div className="relative w-full" style={{ maxWidth: dimensions.width }}>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="neon-border w-full rounded-2xl bg-background cursor-pointer"
        style={{ touchAction: 'none', display: 'block' }}
      />

      <div className="pointer-events-none absolute right-3 top-3 flex gap-2">
        <button
          onClick={onHome}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-surface-1/80 text-primary backdrop-blur-md transition-all hover:border-primary hover:bg-surface-2 active:scale-95"
          aria-label="Home"
        >
          <Home className="h-4 w-4" />
        </button>
        <button
          onClick={onPause}
          className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-surface-1/80 text-primary backdrop-blur-md transition-all hover:border-primary hover:bg-surface-2 active:scale-95"
          aria-label={paused ? 'Resume' : 'Pause'}
        >
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
