'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Home, Pause, Play } from 'lucide-react';
import type { PowerUpId, PowerUpInventory } from '@/lib/powerups';

export interface Game2DProps {
  isPlaying: boolean;
  paused: boolean;
  inventory: PowerUpInventory;
  onGameOver: (score: number, jumpEarned: number) => void;
  onScoreUpdate: (score: number) => void;
  onJumpCollected: (total: number) => void;
  onConsumePowerUp: (id: PowerUpId) => void;
  onPause: () => void;
  onHome: () => void;
}

export default function Game2D({
  isPlaying,
  paused,
  inventory,
  onGameOver,
  onScoreUpdate,
  onJumpCollected,
  onConsumePowerUp,
  onPause,
  onHome,
}: Game2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 360 });

  // Keep latest callbacks/state in refs so the game loop closure never goes stale
  const cbRef = useRef({ onGameOver, onScoreUpdate, onJumpCollected, onConsumePowerUp });
  const pausedRef = useRef(paused);
  const inventoryRef = useRef(inventory);

  useEffect(() => {
    cbRef.current = { onGameOver, onScoreUpdate, onJumpCollected, onConsumePowerUp };
  });
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);

  useEffect(() => {
    const resize = () => {
      const w = Math.min(window.innerWidth - 16, 900);
      const h = Math.round(w * 0.42);
      setDimensions({ width: w, height: Math.max(h, 260) });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Stable sound helper (doesn't depend on game state)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playSound = useCallback((type: 'jump' | 'coin' | 'hit' | 'powerup') => {
    try {
      if (!audioCtxRef.current) return;
      const ac = audioCtxRef.current;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.connect(g); g.connect(ac.destination);
      const t = ac.currentTime;
      if (type === 'jump') {
        osc.frequency.setValueAtTime(400, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.12);
        g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.12);
      } else if (type === 'coin') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
        g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
        osc.start(t); osc.stop(t + 0.1);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(55, t + 0.35);
        g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t); osc.stop(t + 0.35);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, t);
        osc.frequency.exponentialRampToValueAtTime(1000, t + 0.18);
        g.gain.setValueAtTime(0.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.2);
      }
    } catch { /* ignore */ }
  }, []);

  // Main game loop — restarts every time isPlaying flips on or dimensions change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Init audio on first user interaction (canvas click/touch starts it)
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        )();
      } catch { /* ignore */ }
    }

    const W = dimensions.width;
    const H = dimensions.height;
    const GROUND = H - 60;       // y where ground surface is
    const PLAYER_W = 38;
    const PLAYER_H = 44;

    // ── Physics constants ─────────────────────────────────────────────
    const GRAVITY = 0.55;
    const JUMP_FORCE = -13;
    const HOLD_BONUS = -0.4;     // extra vy each frame while holding, up to MAX_HOLD frames
    const MAX_HOLD_FRAMES = 10;
    const TERMINAL_VEL = 18;

    // ── Game state (plain variables — no React setState inside loop) ──
    let alive = true;
    let score = 0;
    let jumpTokens = 0;          // earned this run
    let speed = 4.2;             // pixels/frame at 60fps equivalent
    const SPEED_MAX = 9;
    const SPEED_RAMP = 0.0008;   // added each frame

    // ── Player ────────────────────────────────────────────────────────
    const p = { x: 90, y: GROUND - PLAYER_H, vy: 0, onGround: true, jumpsLeft: 1 };

    // ── Power-up state (read from inventory at game start, then local) ─
    let shieldLeft = inventoryRef.current.shield;
    let djLeft = inventoryRef.current.doubleJump;       // extra mid-air jumps
    let autoLeft = inventoryRef.current.autoJump;
    let magnetActive = false;
    let magnetEnd = 0;
    let slowmoActive = false;
    let slowmoEnd = 0;
    let rocketActive = false;
    let rocketEnd = 0;

    // Consume passive power-ups from inventory immediately
    for (let i = 0; i < inventoryRef.current.shield; i++) cbRef.current.onConsumePowerUp('shield');
    for (let i = 0; i < inventoryRef.current.doubleJump; i++) cbRef.current.onConsumePowerUp('doubleJump');
    for (let i = 0; i < inventoryRef.current.autoJump; i++) cbRef.current.onConsumePowerUp('autoJump');

    // Timed power-ups: activate them sequentially
    // Build a queue from inventory at game start
    type TimedId = 'magnet' | 'slowmo' | 'rocket';
    const TIMED_DUR: Record<TimedId, number> = { magnet: 12000, slowmo: 8000, rocket: 5000 };
    const timedQ: TimedId[] = [];
    (['magnet', 'slowmo', 'rocket'] as TimedId[]).forEach((id) => {
      for (let i = 0; i < inventoryRef.current[id]; i++) timedQ.push(id);
      for (let i = 0; i < inventoryRef.current[id]; i++) cbRef.current.onConsumePowerUp(id);
    });
    let timedQueueStarted = false;
    const TIMED_GRACE_MS = 2000; // wait before first activation
    let gameStartTime = 0;

    const activateNextTimed = (now: number) => {
      const next = timedQ.shift();
      if (!next) return;
      const end = now + TIMED_DUR[next];
      if (next === 'magnet') { magnetActive = true; magnetEnd = end; }
      else if (next === 'slowmo') { slowmoActive = true; slowmoEnd = end; }
      else if (next === 'rocket') { rocketActive = true; rocketEnd = end; }
      playSound('powerup');
    };

    // ── Obstacles ─────────────────────────────────────────────────────
    interface Obs { x: number; y: number; w: number; h: number; phase: number; drone: boolean }
    let obstacles: Obs[] = [];
    let distSinceObs = 0;
    // Minimum gap scales with speed so game stays readable
    const obsGap = () => Math.max(260, 420 - speed * 12) + Math.random() * 120;

    const spawnObs = () => {
      const drone = Math.random() < 0.2;
      if (drone) {
        obstacles.push({
          x: W + 30, w: 48, h: 26,
          y: GROUND - 100 - Math.random() * 40,
          phase: 0, drone: true,
        });
      } else {
        const tall = Math.random() < 0.3;
        const h = tall ? 66 : 38;
        obstacles.push({ x: W + 30, w: 26, h, y: GROUND - h, phase: 0, drone: false });
      }
    };

    // ── Tokens ($JUMP) ─────────────────────────────────────────────────
    interface Tok { x: number; y: number; bob: number; taken: boolean }
    let tokens: Tok[] = [];
    let distSinceTok = 0;
    const tokGap = () => 460 + Math.random() * 280;

    const spawnToks = () => {
      const baseX = W + 50;
      const low = Math.random() < 0.5;
      for (let i = 0; i < 4; i++) {
        tokens.push({
          x: baseX + i * 38,
          y: low ? GROUND - 34 : GROUND - 95 - Math.sin((i / 3) * Math.PI) * 30,
          bob: i * 0.5,
          taken: false,
        });
      }
    };

    // ── Input ─────────────────────────────────────────────────────────
    let holdFrames = 0;
    let holding = false;
    let lastAutoJumpAt = 0;

    const doJump = () => {
      if (rocketActive) return; // rocket = auto-fly, no manual jump
      if (p.onGround) {
        p.vy = JUMP_FORCE;
        p.onGround = false;
        p.jumpsLeft = 0;
        holdFrames = 0;
        holding = true;
        playSound('jump');
      } else if (djLeft > 0 && p.jumpsLeft === 0) {
        p.vy = JUMP_FORCE * 0.88;
        p.jumpsLeft = -1; // used double jump
        djLeft--;
        holdFrames = 0;
        holding = true;
        playSound('jump');
      }
    };

    const onPointerDown = (e: Event) => {
      e.preventDefault();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      doJump();
    };
    const onPointerUp = () => { holding = false; };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); doJump(); holding = true; }
      if (e.code === 'KeyP') onPause();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') holding = false;
    };

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchend', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Background stars (pre-computed, just scrolled) ─────────────────
    const STAR_COUNT = 40;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * (GROUND - 30),
      r: 0.5 + Math.random() * 1.2,
      spd: 0.3 + Math.random() * 0.5,
    }));

    // ── Throttled React state updates ──────────────────────────────────
    let lastReactUpdate = 0;
    const REACT_UPDATE_INTERVAL = 160; // ms

    // ── Ground line decoration ─────────────────────────────────────────
    let groundOffset = 0;

    // ── Trail ──────────────────────────────────────────────────────────
    const trail: { x: number; y: number }[] = [];

    // ── Collision helper ───────────────────────────────────────────────
    const MARGIN = 6;
    const hits = (o: Obs) =>
      p.x + MARGIN < o.x + o.w &&
      p.x + PLAYER_W - MARGIN > o.x &&
      p.y + MARGIN < o.y + o.h &&
      p.y + PLAYER_H - MARGIN > o.y;

    // ── Draw helpers ───────────────────────────────────────────────────
    const rrect = (x: number, y: number, w: number, h: number, r: number) => {
      const cr = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + cr, y);
      ctx.lineTo(x + w - cr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
      ctx.lineTo(x + w, y + h - cr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
      ctx.lineTo(x + cr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
      ctx.lineTo(x, y + cr);
      ctx.quadraticCurveTo(x, y, x + cr, y);
      ctx.closePath();
    };

    // ── Main loop ─────────────────────────────────────────────────────
    let animId = 0;
    let lastTime = 0;

    const loop = (now: number) => {
      animId = requestAnimationFrame(loop);

      // Cap delta so a tab-switch doesn't cause a giant jump
      const rawDt = now - lastTime;
      lastTime = now;
      if (rawDt < 1) return; // first frame

      // Clamp dt: treat anything > 50ms as 50ms (e.g. when tab is backgrounded)
      const dt = Math.min(rawDt, 50) / (1000 / 60); // normalized to ~1 at 60fps

      if (pausedRef.current) {
        // Still draw the paused frame
        drawFrame(now);
        return;
      }

      // ── Update ──────────────────────────────────────────────────────

      if (gameStartTime === 0) gameStartTime = now;

      // Timed power-up queue
      if (!timedQueueStarted && now - gameStartTime > TIMED_GRACE_MS) {
        timedQueueStarted = true;
        activateNextTimed(now);
      }
      if (magnetActive && now > magnetEnd) { magnetActive = false; activateNextTimed(now); }
      if (slowmoActive && now > slowmoEnd) { slowmoActive = false; activateNextTimed(now); }
      if (rocketActive && now > rocketEnd) { rocketActive = false; p.onGround = false; activateNextTimed(now); }

      const effSpeed = rocketActive ? speed * 1.5 : slowmoActive ? speed * 0.5 : speed;

      // ── Player physics ──────────────────────────────────────────────
      if (rocketActive) {
        // Float at a fixed height
        const targetY = GROUND - PLAYER_H - 100;
        p.y += (targetY - p.y) * 0.15 * dt;
        p.vy = 0;
        p.onGround = false;
      } else {
        // Hold-to-jump: add upward boost while holding and still rising
        if (holding && holdFrames < MAX_HOLD_FRAMES && p.vy < 0) {
          p.vy += HOLD_BONUS * dt;
          holdFrames += dt;
        }
        p.vy = Math.min(p.vy + GRAVITY * dt, TERMINAL_VEL);
        p.y += p.vy * dt;

        // Ground snap
        if (p.y >= GROUND - PLAYER_H) {
          p.y = GROUND - PLAYER_H;
          p.vy = 0;
          p.onGround = true;
          p.jumpsLeft = 1;
          holdFrames = 0;
        }
      }

      // Trail
      trail.push({ x: p.x + PLAYER_W / 2, y: p.y + PLAYER_H / 2 });
      if (trail.length > 10) trail.shift();

      // ── Auto-jump ───────────────────────────────────────────────────
      if (autoLeft > 0 && p.onGround) {
        const next = obstacles.find((o) => o.x + o.w > p.x);
        if (next) {
          const dist = next.x - (p.x + PLAYER_W);
          if (dist > 60 && dist < 160 && now - lastAutoJumpAt > 600) {
            doJump();
            autoLeft--;
            lastAutoJumpAt = now;
          }
        }
      }

      // ── Speed ramp ─────────────────────────────────────────────────
      speed = Math.min(speed + SPEED_RAMP * dt, SPEED_MAX);
      score += 0.08 * effSpeed * dt; // score tied to distance

      // ── Obstacles ──────────────────────────────────────────────────
      for (const o of obstacles) {
        o.x -= effSpeed * dt;
        if (o.drone) o.phase += 0.08 * dt;
        if (o.drone) o.y = (o.y - 0.5 * dt) + Math.sin(o.phase) * 0.8 * dt + 0.25 * dt;
      }
      obstacles = obstacles.filter((o) => o.x + o.w > -20);

      distSinceObs += effSpeed * dt;
      if (distSinceObs >= obsGap()) { spawnObs(); distSinceObs = 0; }

      // ── Tokens ─────────────────────────────────────────────────────
      for (const tk of tokens) {
        tk.x -= effSpeed * dt;
        tk.bob += 0.1 * dt;
        if (magnetActive) {
          const dx = (p.x + PLAYER_W / 2) - tk.x;
          const dy = (p.y + PLAYER_H / 2) - tk.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 220 && dist > 1) {
            const pull = (1 - dist / 220) * 6 * dt;
            tk.x += (dx / dist) * pull;
            tk.y += (dy / dist) * pull;
          }
        }
      }
      tokens = tokens.filter((tk) => !tk.taken && tk.x > -20);

      distSinceTok += effSpeed * dt;
      if (distSinceTok >= tokGap()) { spawnToks(); distSinceTok = 0; }

      // ── Token collection ───────────────────────────────────────────
      for (const tk of tokens) {
        const dx = tk.x - (p.x + PLAYER_W / 2);
        const dy = tk.y - (p.y + PLAYER_H / 2);
        if (Math.hypot(dx, dy) < 24) {
          tk.taken = true;
          jumpTokens += 5;
          playSound('coin');
        }
      }

      // ── Collision ──────────────────────────────────────────────────
      for (const o of obstacles) {
        if (!hits(o)) continue;
        if (rocketActive) {
          // Rocket destroys obstacles
          o.x = -9999;
          playSound('hit');
          continue;
        }
        if (shieldLeft > 0) {
          shieldLeft--;
          o.x = -9999;
          // Clear nearby obstacles too
          obstacles.forEach((other) => { if (Math.abs(other.x - p.x) < 160) other.x = -9999; });
          playSound('powerup');
          continue;
        }
        // Dead
        alive = false;
        playSound('hit');
        cbRef.current.onGameOver(Math.floor(score), jumpTokens);
        cancelAnimationFrame(animId);
        drawFrame(now); // draw final death frame
        cleanup();
        return;
      }

      // ── Background scroll ─────────────────────────────────────────
      for (const s of stars) {
        s.x -= s.spd * dt;
        if (s.x < -2) s.x = W + 2;
      }
      groundOffset = (groundOffset + effSpeed * dt) % 40;

      // ── Throttled React updates (score + jump bank) ────────────────
      if (now - lastReactUpdate > REACT_UPDATE_INTERVAL) {
        lastReactUpdate = now;
        cbRef.current.onScoreUpdate(Math.floor(score));
        cbRef.current.onJumpCollected(jumpTokens);
      }

      drawFrame(now);
    };

    // ── Draw ─────────────────────────────────────────────────────────
    const drawFrame = (now: number) => {
      ctx.clearRect(0, 0, W, H);

      // Sky gradient
      const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
      sky.addColorStop(0, '#050b14');
      sky.addColorStop(1, '#0a1628');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, GROUND);

      // Stars
      ctx.fillStyle = '#ffffff';
      for (const s of stars) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 0.001 + s.x);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Ground
      ctx.fillStyle = '#0d1f3c';
      ctx.fillRect(0, GROUND, W, H - GROUND);
      // Ground glow line
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, GROUND);
      ctx.lineTo(W, GROUND);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Ground dashes
      ctx.strokeStyle = 'rgba(6,182,212,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([20, 20]);
      ctx.lineDashOffset = -groundOffset;
      ctx.beginPath();
      ctx.moveTo(0, GROUND + 14);
      ctx.lineTo(W, GROUND + 14);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;

      // Trail
      for (let i = 0; i < trail.length; i++) {
        const t = trail[i];
        const a = (i / trail.length) * 0.5;
        ctx.globalAlpha = a;
        ctx.fillStyle = rocketActive ? '#f59e0b' : '#06b6d4';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3 + (i / trail.length) * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Tokens
      for (const tk of tokens) {
        if (tk.taken) continue;
        const ty = tk.y + Math.sin(tk.bob) * 4;
        ctx.save();
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;
        // Coin circle
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(tk.x, ty, 10, 0, Math.PI * 2);
        ctx.fill();
        // Inner circle
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(tk.x, ty, 7, 0, Math.PI * 2);
        ctx.fill();
        // "J" label
        ctx.fillStyle = '#78350f';
        ctx.font = 'bold 9px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('J', tk.x, ty);
        ctx.restore();
      }

      // Obstacles
      for (const o of obstacles) {
        if (o.x < -20 || o.x > W + 20) continue;
        ctx.save();
        if (o.drone) {
          // Drone: glowing magenta box
          ctx.shadowColor = '#e879a0';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#831843';
          rrect(o.x, o.y, o.w, o.h, 5);
          ctx.fill();
          ctx.strokeStyle = '#e879a0';
          ctx.lineWidth = 1.5;
          rrect(o.x, o.y, o.w, o.h, 5);
          ctx.stroke();
          // Propeller lines
          ctx.strokeStyle = '#f472b6';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(o.x + 8, o.y - 4); ctx.lineTo(o.x + 8, o.y);
          ctx.moveTo(o.x + o.w - 8, o.y - 4); ctx.lineTo(o.x + o.w - 8, o.y);
          ctx.stroke();
        } else {
          // Ground obstacle
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 14;
          ctx.fillStyle = '#7f1d1d';
          rrect(o.x, o.y, o.w, o.h, 4);
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          rrect(o.x, o.y, o.w, o.h, 4);
          ctx.stroke();
          // spike top
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(o.x + o.w / 2 - 5, o.y);
          ctx.lineTo(o.x + o.w / 2, o.y - 10);
          ctx.lineTo(o.x + o.w / 2 + 5, o.y);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // Player
      ctx.save();
      const px = p.x;
      const py = p.y;
      const pw = PLAYER_W;
      const ph = PLAYER_H;

      // Shield aura
      if (shieldLeft > 0) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(px + pw / 2, py + ph / 2, pw / 2 + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Body glow
      ctx.shadowColor = rocketActive ? '#f59e0b' : magnetActive ? '#e879a0' : '#06b6d4';
      ctx.shadowBlur = rocketActive ? 30 : 18;

      // Body
      ctx.fillStyle = rocketActive ? '#f59e0b' : '#0ea5e9';
      rrect(px + 4, py, pw - 8, ph, 8);
      ctx.fill();

      // Head
      ctx.fillStyle = rocketActive ? '#fbbf24' : '#38bdf8';
      rrect(px + 7, py + 4, pw - 14, ph * 0.45, 6);
      ctx.fill();

      // Eye
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(px + pw / 2 + 5, py + 14, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px + pw / 2 + 6, py + 13, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      ctx.fillStyle = rocketActive ? '#d97706' : '#0284c7';
      rrect(px + 6, py + ph - 14, 10, 14, 3); ctx.fill();
      rrect(px + pw - 16, py + ph - 14, 10, 14, 3); ctx.fill();

      // Rocket flame
      if (rocketActive) {
        ctx.fillStyle = '#fde68a';
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(now * 0.02);
        ctx.beginPath();
        ctx.moveTo(px + 8, py + ph);
        ctx.lineTo(px + pw / 2, py + ph + 18 + Math.random() * 6);
        ctx.lineTo(px + pw - 8, py + ph);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;
      ctx.restore();

      // HUD: active power-up badge
      const activeName = rocketActive ? 'ROCKET' : slowmoActive ? 'SLOW-MO' : magnetActive ? 'MAGNET' : null;
      const activeEnd = rocketActive ? rocketEnd : slowmoActive ? slowmoEnd : magnetActive ? magnetEnd : 0;

      if (activeName && activeEnd > 0) {
        const remaining = Math.max(0, activeEnd - now);
        const dur = rocketActive ? TIMED_DUR.rocket : slowmoActive ? TIMED_DUR.slowmo : TIMED_DUR.magnet;
        const frac = remaining / dur;
        const bx = W / 2 - 60;
        const by = 12;
        const bw = 120;
        const bh = 22;
        ctx.fillStyle = 'rgba(5,15,30,0.85)';
        rrect(bx, by, bw, bh, 6);
        ctx.fill();
        // Progress bar fill
        ctx.fillStyle = rocketActive ? '#f59e0b' : slowmoActive ? '#06b6d4' : '#e879a0';
        rrect(bx + 2, by + 2, (bw - 4) * frac, bh - 4, 4);
        ctx.fill();
        // Label
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(activeName, bx + bw / 2, by + bh / 2);
      }

      // HUD: score top-right
      ctx.fillStyle = 'rgba(5,15,30,0.75)';
      rrect(W - 110, 10, 100, 28, 6);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('SCORE', W - 105, 20);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px ui-sans-serif, system-ui';
      ctx.fillText(Math.floor(score).toString(), W - 105, 31);

      // HUD: shield indicator
      if (shieldLeft > 0) {
        ctx.fillStyle = 'rgba(6,182,212,0.15)';
        rrect(W - 110, 44, 100, 22, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(6,182,212,0.6)';
        ctx.lineWidth = 1;
        rrect(W - 110, 44, 100, 22, 6);
        ctx.stroke();
        ctx.fillStyle = '#06b6d4';
        ctx.font = 'bold 9px ui-sans-serif, system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SHIELD ×${shieldLeft}`, W - 104, 55);
      }

      // Pause overlay
      if (pausedRef.current) {
        ctx.fillStyle = 'rgba(5,10,20,0.70)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 28px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', W / 2, H / 2);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px ui-sans-serif, system-ui';
        ctx.fillText('Buy power-ups below, then resume', W / 2, H / 2 + 28);
      }

      // Death overlay
      if (!alive) {
        ctx.fillStyle = 'rgba(5,10,20,0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 30px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', W / 2, H / 2 - 14);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px ui-sans-serif, system-ui';
        ctx.fillText(`Score: ${Math.floor(score)}`, W / 2, H / 2 + 18);
      }
    };

    const cleanup = () => {
      canvas.removeEventListener('mousedown', onPointerDown);
      canvas.removeEventListener('mouseup', onPointerUp);
      canvas.removeEventListener('touchstart', onPointerDown);
      canvas.removeEventListener('touchend', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animId);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, dimensions.width, dimensions.height]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="cursor-pointer touch-none rounded-2xl border border-primary/20 shadow-[0_0_40px_hsl(190_95%_50%/0.12)]"
        aria-label="Jumparun game canvas — tap to jump"
        role="img"
      />
      {/* In-game controls overlay */}
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
        <span>Tap</span>
        <span className="opacity-50">/</span>
        <span>Space to jump</span>
      </div>
      <div className="absolute right-3 top-3 flex gap-2">
        <button
          onClick={onPause}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur transition hover:border-white/30 hover:text-white"
          aria-label={paused ? 'Resume game' : 'Pause game'}
        >
          {paused ? <Play className="h-3.5 w-3.5" fill="currentColor" /> : <Pause className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={onHome}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/50 text-white/70 backdrop-blur transition hover:border-white/30 hover:text-white"
          aria-label="Go to home screen"
        >
          <Home className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
