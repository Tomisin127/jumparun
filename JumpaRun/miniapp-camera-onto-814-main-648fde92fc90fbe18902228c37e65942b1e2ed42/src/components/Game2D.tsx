'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Home, Pause, Play } from 'lucide-react';
import type { PowerUpId, PowerUpInventory } from '@/lib/powerups';

export interface Game2DProps {
  isPlaying: boolean;
  paused: boolean;
  inventory: PowerUpInventory;
  onGameOver: (score: number, coinsCollected: number) => void;
  onScoreUpdate: (score: number) => void;
  onCoinCollected: (total: number) => void;
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

interface Coin extends Vec {
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
  onGameOver,
  onScoreUpdate,
  onCoinCollected,
  onConsumePowerUp,
  onPause,
  onHome,
}: Game2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 480 });
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Callback refs so we don't restart the game loop
  const cbRef = useRef({
    onGameOver,
    onScoreUpdate,
    onCoinCollected,
    onConsumePowerUp,
  });
  const pausedRef = useRef(paused);
  const inventoryRef = useRef(inventory);

  useEffect(() => {
    cbRef.current = { onGameOver, onScoreUpdate, onCoinCollected, onConsumePowerUp };
  }, [onGameOver, onScoreUpdate, onCoinCollected, onConsumePowerUp]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  // Responsive sizing
  useEffect(() => {
    const update = () => {
      const maxW = Math.min(window.innerWidth - 16, 960);
      const h = Math.min(window.innerHeight * 0.68, 520);
      setDimensions({ width: maxW, height: h });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Sound helpers
  const playSound = useCallback((type: 'jump' | 'coin' | 'hit' | 'powerup' | 'dash') => {
    try {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'jump') {
        osc.frequency.setValueAtTime(420, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'coin') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'powerup') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1040, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch {
      // ignore
    }
  }, []);

  // Main game loop
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
    const GRAVITY = 0.85;
    const JUMP_V = -15.5;
    const DOUBLE_JUMP_V = -13;
    const MAX_HOLD = 10; // frames of variable-height jump

    const player: Player = {
      x: 120,
      y: GROUND_Y - 52,
      w: 46,
      h: 52,
      vy: 0,
      onGround: true,
      jumpsUsed: 0,
      trail: [],
    };

    let obstacles: Obstacle[] = [];
    let coins: Coin[] = [];
    let particles: Particle[] = [];
    const stars: Star[] = [];
    const mountains: Mountain[] = [];

    // Background layers
    for (let i = 0; i < 60; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * (GROUND_Y - 40),
        size: Math.random() * 1.5 + 0.3,
        speed: 0.08 + Math.random() * 0.2,
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

    let score = 0;
    let coinCount = 0;
    let speed = 5.2;
    let lastObstacleX = W;
    let lastCoinX = W;
    let gameActive = true;
    let cameraShake = 0;
    let jumpHold = 0;
    let isHoldingJump = false;

    // Power-up runtime state
    let shieldActive = inventoryRef.current.shield > 0;
    let djRemaining = inventoryRef.current.doubleJump;
    let autoJumpRemaining = inventoryRef.current.autoJump;
    let magnetEnd = inventoryRef.current.magnet > 0 ? performance.now() + 12000 : 0;
    let rocketEnd = inventoryRef.current.rocket > 0 ? performance.now() + 5000 : 0;
    let slowmoEnd = inventoryRef.current.slowmo > 0 ? performance.now() + 8000 : 0;

    // Consume starting power-ups
    if (shieldActive) cbRef.current.onConsumePowerUp('shield');
    if (inventoryRef.current.magnet > 0) cbRef.current.onConsumePowerUp('magnet');
    if (inventoryRef.current.rocket > 0) cbRef.current.onConsumePowerUp('rocket');
    if (inventoryRef.current.slowmo > 0) cbRef.current.onConsumePowerUp('slowmo');

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
      const now = performance.now();
      const rocketOn = now < rocketEnd;
      if (rocketOn) return; // rocket makes you fly
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
        spawnParticles(player.x + player.w / 2, player.y + player.h / 2, 'hsl(145 70% 50%)', 14, 7);
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

    const spawnObstacle = () => {
      if (lastObstacleX > W - 320) return;
      const r = Math.random();
      let type: ObstacleType;
      let w = 34;
      let h = 54;
      let y = GROUND_Y - h;
      if (r < 0.4) {
        type = 'spike';
        w = 30;
        h = 42;
        y = GROUND_Y - h;
      } else if (r < 0.65) {
        type = 'tall';
        w = 34;
        h = 78;
        y = GROUND_Y - h;
      } else if (r < 0.85) {
        type = 'saw';
        w = 42;
        h = 42;
        y = GROUND_Y - h;
      } else {
        type = 'drone';
        w = 46;
        h = 30;
        y = GROUND_Y - 125 - Math.random() * 30;
      }
      const minGap = 300;
      const maxGap = 500;
      const obstacleX = W + minGap + Math.random() * (maxGap - minGap);
      obstacles.push({ x: obstacleX, y, w, h, type, phase: 0 });
      lastObstacleX = obstacleX;
    };

    const spawnCoins = () => {
      if (lastCoinX > W - 180) return;
      const baseX = W + 200 + Math.random() * 200;
      const pattern = Math.floor(Math.random() * 3);
      if (pattern === 0) {
        // arc over obstacle
        for (let i = 0; i < 5; i++) {
          const t = i / 4;
          const x = baseX + i * 34;
          const y = GROUND_Y - 80 - Math.sin(t * Math.PI) * 60;
          coins.push({ x, y, collected: false, bob: Math.random() * Math.PI * 2 });
        }
      } else if (pattern === 1) {
        // line mid-air
        for (let i = 0; i < 4; i++) {
          coins.push({
            x: baseX + i * 40,
            y: GROUND_Y - 110,
            collected: false,
            bob: Math.random() * Math.PI * 2,
          });
        }
      } else {
        // zigzag low/high
        for (let i = 0; i < 5; i++) {
          coins.push({
            x: baseX + i * 40,
            y: GROUND_Y - 60 - (i % 2) * 70,
            collected: false,
            bob: Math.random() * Math.PI * 2,
          });
        }
      }
      lastCoinX = baseX + 200;
    };

    const rectHit = (ax: number, ay: number, aw: number, ah: number, o: Obstacle) => {
      const m = 4;
      return ax + m < o.x + o.w && ax + aw - m > o.x && ay + m < o.y + o.h && ay + ah - m > o.y;
    };

    let animId = 0;
    let lastTime = performance.now();

    const update = () => {
      const now = performance.now();
      const magnetOn = now < magnetEnd;
      const rocketOn = now < rocketEnd;
      const slowmoOn = now < slowmoEnd;

      const effSpeed = rocketOn ? speed * 1.8 : slowmoOn ? speed * 0.55 : speed;

      // Variable jump height - hold to go higher
      if (isHoldingJump && jumpHold < MAX_HOLD && player.vy < 0) {
        player.vy -= 0.55;
        jumpHold++;
      }

      // Auto-jump
      if (autoJumpRemaining > 0 && obstacles.length > 0 && player.onGround) {
        const next = obstacles.find((o) => o.x + o.w > player.x);
        if (next) {
          const dist = next.x - (player.x + player.w);
          if (dist > 100 && dist < 170 && now - lastAutoJump > 500) {
            doJump();
            autoJumpRemaining--;
            lastAutoJump = now;
          }
        }
      }

      // Rocket: float at mid-air
      if (rocketOn) {
        const target = GROUND_Y - 180;
        player.y += (target - player.y) * 0.18;
        player.vy = 0;
        player.onGround = false;
      } else {
        player.vy += GRAVITY;
        if (player.vy > 22) player.vy = 22;
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
      if (player.trail.length > 14) player.trail.shift();

      // Speed up over time (slight)
      speed += 0.0012;

      // Move & spawn obstacles
      obstacles.forEach((o) => {
        o.x -= effSpeed;
        o.phase += 0.1;
        if (o.type === 'drone') o.y += Math.sin(o.phase) * 0.6;
      });
      obstacles = obstacles.filter((o) => o.x + o.w > -40);
      if (obstacles.length > 0) lastObstacleX = obstacles[obstacles.length - 1].x;
      spawnObstacle();

      // Coins
      coins.forEach((c) => {
        c.x -= effSpeed;
        c.bob += 0.14;
        if (magnetOn) {
          const dx = player.x + player.w / 2 - c.x;
          const dy = player.y + player.h / 2 - c.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 220) {
            const pull = (1 - dist / 220) * 5;
            c.x += (dx / dist) * pull;
            c.y += (dy / dist) * pull;
          }
        }
      });
      coins = coins.filter((c) => !c.collected && c.x > -40);
      if (coins.length > 0) lastCoinX = coins[coins.length - 1].x;
      spawnCoins();

      // Coin pickups
      for (const c of coins) {
        const dx = c.x - (player.x + player.w / 2);
        const dy = c.y - (player.y + player.h / 2);
        if (Math.hypot(dx, dy) < 26) {
          c.collected = true;
          coinCount++;
          cbRef.current.onCoinCollected(coinCount);
          playSound('coin');
          spawnParticles(c.x, c.y, 'hsl(35 95% 58%)', 6, 3);
        }
      }

      // Obstacle collision
      for (const o of obstacles) {
        if (rectHit(player.x, player.y, player.w, player.h, o)) {
          if (rocketOn) {
            // destroy obstacle
            spawnParticles(o.x + o.w / 2, o.y + o.h / 2, 'hsl(35 95% 58%)', 20, 9);
            o.x = -9999;
            cameraShake = 6;
            playSound('hit');
            continue;
          }
          if (shieldActive) {
            shieldActive = false;
            spawnParticles(
              player.x + player.w / 2,
              player.y + player.h / 2,
              'hsl(190 95% 50%)',
              30,
              10,
            );
            // clear nearby obstacles
            obstacles.forEach((other) => {
              if (Math.abs(other.x - player.x) < 180) other.x = -9999;
            });
            cameraShake = 8;
            playSound('powerup');
            continue;
          }
          // Game over
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
          cbRef.current.onGameOver(Math.floor(score), coinCount);
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

      // Stars & mountains
      stars.forEach((s) => {
        s.x -= s.speed;
        s.twinkle += 0.04;
        if (s.x < -4) {
          s.x = W + 4;
          s.y = Math.random() * (GROUND_Y - 40);
        }
      });
      mountains.forEach((m) => {
        m.x -= effSpeed * 0.15;
        if (m.x + m.w < -20) {
          m.x = W + Math.random() * 80;
          m.w = 160 + Math.random() * 120;
          m.h = 80 + Math.random() * 120;
        }
      });

      // Scoring
      const gain = rocketOn ? 2.4 : 1.2;
      score += gain;
      cbRef.current.onScoreUpdate(Math.floor(score));

      if (cameraShake > 0) cameraShake *= 0.88;
    };

    const drawPlayer = () => {
      const now = performance.now();
      const rocketOn = now < rocketEnd;
      const magnetOn = now < magnetEnd;
      const slowmoOn = now < slowmoEnd;

      // Trail
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

      // Player body - Base-inspired design
      const px = player.x;
      const py = player.y;
      const pw = player.w;
      const ph = player.h;

      // Glow
      ctx.shadowColor = rocketOn ? 'hsl(35 95% 58%)' : 'hsl(190 95% 50%)';
      ctx.shadowBlur = 22;

      // Body - hexagonal chip design
      const cx = px + pw / 2;
      const cy = py + ph / 2;
      const r = pw / 2;

      // Outer hex
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

      // Inner core
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'hsl(222 47% 5%)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // Eye
      ctx.fillStyle = rocketOn ? 'hsl(35 95% 58%)' : 'hsl(190 95% 50%)';
      ctx.beginPath();
      ctx.arc(cx + 4, cy - 2, r * 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Shield aura
      if (shieldActive) {
        ctx.strokeStyle = `hsl(190 95% 50% / ${0.5 + Math.sin(now * 0.01) * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Magnet ring
      if (magnetOn) {
        ctx.strokeStyle = `hsl(320 90% 60% / ${0.3 + Math.sin(now * 0.008) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(cx, cy, 200, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Slow-mo ripple
      if (slowmoOn) {
        ctx.strokeStyle = `hsl(190 95% 50% / ${0.2 + Math.sin(now * 0.005) * 0.15})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 16 + Math.sin(now * 0.01) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Rocket flames
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
        // Triangular neon spike
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
        // base
        ctx.fillStyle = 'hsl(0 84% 30%)';
        ctx.fillRect(o.x - 2, o.y + o.h - 4, o.w + 4, 4);
      } else if (o.type === 'tall') {
        // Tall pillar with neon stripes
        const grad = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y);
        grad.addColorStop(0, 'hsl(320 90% 35%)');
        grad.addColorStop(0.5, 'hsl(320 90% 55%)');
        grad.addColorStop(1, 'hsl(320 90% 35%)');
        ctx.shadowColor = 'hsl(320 90% 60%)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = grad;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.shadowBlur = 0;
        // cap
        ctx.fillStyle = 'hsl(320 90% 70%)';
        ctx.fillRect(o.x - 2, o.y, o.w + 4, 6);
        ctx.fillStyle = 'hsl(222 47% 5%)';
        for (let i = 1; i < 4; i++) {
          ctx.fillRect(o.x + 4, o.y + (o.h / 4) * i, o.w - 8, 2);
        }
      } else if (o.type === 'drone') {
        // Flying drone
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
        // propellers
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
        // Rotating saw blade
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

    const drawCoin = (c: Coin) => {
      const now = performance.now();
      const pulse = 1 + Math.sin(c.bob) * 0.1;
      ctx.save();
      ctx.shadowColor = 'hsl(35 95% 58%)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'hsl(35 95% 58%)';
      ctx.beginPath();
      ctx.ellipse(
        c.x,
        c.y,
        10 * pulse,
        10,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'hsl(35 95% 80%)';
      ctx.beginPath();
      ctx.ellipse(c.x - 2, c.y - 2, 5 * pulse, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      // ring
      ctx.strokeStyle = `hsl(35 95% 58% / ${0.3 + Math.sin(now * 0.008 + c.bob) * 0.2})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 14 + Math.sin(c.bob * 1.2) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };

    const draw = () => {
      const now = performance.now();
      const rocketOn = now < rocketEnd;
      const magnetOn = now < magnetEnd;
      const slowmoOn = now < slowmoEnd;

      const shakeX = (Math.random() - 0.5) * cameraShake;
      const shakeY = (Math.random() - 0.5) * cameraShake;

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
      skyGrad.addColorStop(0, 'hsl(222 47% 5%)');
      skyGrad.addColorStop(0.5, 'hsl(222 50% 10%)');
      skyGrad.addColorStop(1, 'hsl(222 55% 16%)');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Stars
      stars.forEach((s) => {
        const alpha = 0.4 + Math.sin(s.twinkle) * 0.4;
        ctx.fillStyle = `hsl(190 95% 80% / ${alpha})`;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      });

      // Distant mountains
      mountains.forEach((m) => {
        ctx.fillStyle = `hsl(222 40% ${12 + m.shade * 8}%)`;
        ctx.beginPath();
        ctx.moveTo(m.x, GROUND_Y);
        ctx.lineTo(m.x + m.w / 2, GROUND_Y - m.h);
        ctx.lineTo(m.x + m.w, GROUND_Y);
        ctx.closePath();
        ctx.fill();
        // Glow peak
        ctx.strokeStyle = 'hsl(190 95% 50% / 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.x, GROUND_Y);
        ctx.lineTo(m.x + m.w / 2, GROUND_Y - m.h);
        ctx.lineTo(m.x + m.w, GROUND_Y);
        ctx.stroke();
      });

      // Grid floor - perspective
      ctx.strokeStyle = 'hsl(190 95% 50% / 0.15)';
      ctx.lineWidth = 1;
      const horizonY = GROUND_Y;
      // horizontal lines
      for (let i = 0; i < 10; i++) {
        const y = horizonY + i * 8 + (i * i) * 0.8;
        if (y > H) break;
        ctx.globalAlpha = 1 - i / 10;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      // vanishing lines
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

      // Horizon line
      ctx.strokeStyle = 'hsl(190 95% 50% / 0.55)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'hsl(190 95% 50%)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(W, GROUND_Y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Slow-mo overlay tint
      if (slowmoOn) {
        ctx.fillStyle = 'hsl(190 95% 50% / 0.08)';
        ctx.fillRect(0, 0, W, H);
      }
      if (rocketOn) {
        ctx.fillStyle = 'hsl(35 95% 58% / 0.08)';
        ctx.fillRect(0, 0, W, H);
      }

      // Obstacles
      obstacles.forEach(drawObstacle);

      // Coins
      coins.forEach(drawCoin);

      // Particles
      particles.forEach((p) => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Player
      drawPlayer();

      ctx.restore();

      // HUD - power-up badges
      const activeBadges: { sym: string; label: string; color: string; val: string }[] = [];
      if (shieldActive)
        activeBadges.push({ sym: 'S', label: 'SHIELD', color: 'hsl(190 95% 50%)', val: '' });
      if (djRemaining > 0)
        activeBadges.push({
          sym: '2',
          label: 'DOUBLE',
          color: 'hsl(145 70% 50%)',
          val: `×${djRemaining}`,
        });
      if (magnetOn) {
        activeBadges.push({
          sym: 'M',
          label: 'MAGNET',
          color: 'hsl(320 90% 60%)',
          val: `${Math.ceil((magnetEnd - now) / 1000)}s`,
        });
      }
      if (slowmoOn) {
        activeBadges.push({
          sym: 'T',
          label: 'SLOW',
          color: 'hsl(190 95% 50%)',
          val: `${Math.ceil((slowmoEnd - now) / 1000)}s`,
        });
      }
      if (rocketOn) {
        activeBadges.push({
          sym: 'R',
          label: 'ROCKET',
          color: 'hsl(35 95% 58%)',
          val: `${Math.ceil((rocketEnd - now) / 1000)}s`,
        });
      }
      if (autoJumpRemaining > 0) {
        activeBadges.push({
          sym: 'A',
          label: 'AUTO',
          color: 'hsl(145 70% 50%)',
          val: `×${autoJumpRemaining}`,
        });
      }

      const roundedRect = (
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
      ) => {
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

      ctx.font = 'bold 11px ui-sans-serif, system-ui';
      activeBadges.forEach((b, i) => {
        const x = 14;
        const y = 14 + i * 30;
        const text = `${b.label}${b.val ? ' ' + b.val : ''}`;
        const w = ctx.measureText(text).width + 40;
        ctx.fillStyle = 'hsl(222 40% 8% / 0.85)';
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1;
        roundedRect(x, y, w, 22, 6);
        ctx.fill();
        ctx.stroke();
        // icon square
        ctx.fillStyle = b.color;
        roundedRect(x + 4, y + 4, 14, 14, 3);
        ctx.fill();
        ctx.fillStyle = 'hsl(222 47% 5%)';
        ctx.fillText(b.sym, x + 8, y + 14);
        ctx.fillStyle = b.color;
        ctx.fillText(text, x + 24, y + 14);
      });

      // Pause overlay
      if (pausedRef.current) {
        ctx.fillStyle = 'hsl(222 47% 5% / 0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'hsl(190 95% 50%)';
        ctx.font = 'bold 48px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.font = 'bold 14px ui-sans-serif, system-ui';
        ctx.fillStyle = 'hsl(210 20% 96%)';
        ctx.fillText('Use the shop to buy more power-ups', W / 2, H / 2 + 28);
        ctx.textAlign = 'start';
      }
    };

    const loop = (t: number) => {
      lastTime = t;
      if (!pausedRef.current && gameActive) {
        update();
      }
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

      {/* Top HUD buttons */}
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
