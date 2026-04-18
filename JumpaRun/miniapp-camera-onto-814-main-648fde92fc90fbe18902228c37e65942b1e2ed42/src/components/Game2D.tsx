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

/**
 * Simple endless runner:
 *   - Tap / Space / ArrowUp: jump.  Hold for a slightly higher jump.
 *   - Avoid red ground obstacles and magenta flying drones.
 *   - Collect amber $JUMP tokens for bonus currency.
 *   - Score = distance survived.
 *
 *   Power-ups are consumed from inventory at game start and active throughout:
 *     - shield:      absorbs one hit (charges count = uses)
 *     - doubleJump:  enables a second mid-air jump (charges count = uses)
 *     - autoJump:    auto-jumps when obstacle is close (charges count = uses)
 *     - magnet:      tokens pull toward you for the whole run if in inventory
 *     - slowmo:      obstacle/world speed is halved for the whole run if in inventory
 *     - rocket:      invincible flight for 5s at game start if in inventory
 *
 *   Anything consumed is reported via onConsumePowerUp(id) once at game start.
 */
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
  const [dimensions, setDimensions] = useState({ width: 800, height: 340 });

  // Keep latest callbacks/state in refs so the game-loop closure never goes stale.
  const cbRef = useRef({ onGameOver, onScoreUpdate, onJumpCollected, onConsumePowerUp });
  const pausedRef = useRef(paused);
  const inventoryRef = useRef(inventory);

  useEffect(() => {
    cbRef.current = { onGameOver, onScoreUpdate, onJumpCollected, onConsumePowerUp };
  });
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);

  // Responsive canvas
  useEffect(() => {
    const resize = () => {
      const w = Math.min(window.innerWidth - 16, 900);
      const h = Math.round(Math.max(260, Math.min(w * 0.46, 420)));
      setDimensions({ width: w, height: h });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Audio context (lazy-initialized on first interaction)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playSound = useCallback((type: 'jump' | 'coin' | 'hit' | 'power') => {
    const ac = audioCtxRef.current;
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.connect(g);
      g.connect(ac.destination);
      const t = ac.currentTime;
      if (type === 'jump') {
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(780, t + 0.1);
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t); osc.stop(t + 0.11);
      } else if (type === 'coin') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, t);
        osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
        g.gain.setValueAtTime(0.05, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t); osc.stop(t + 0.09);
      } else if (type === 'hit') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(240, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.3);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t); osc.stop(t + 0.3);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, t);
        osc.frequency.exponentialRampToValueAtTime(1000, t + 0.15);
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.16);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Main loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!audioCtxRef.current) {
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioCtxRef.current = new AC();
      } catch { /* ignore */ }
    }

    const W = dimensions.width;
    const H = dimensions.height;
    const GROUND_Y = H - 56;

    // ── Player ─────────────────────────────────────────────────────────
    const PW = 36;
    const PH = 42;
    const player = {
      x: 80,
      y: GROUND_Y - PH,
      vy: 0,
      onGround: true,
      dj: false,           // has an unused double-jump for this airborne period
    };

    // ── Physics constants ──────────────────────────────────────────────
    // Expressed per-frame-at-60fps so we can scale by normalized dt.
    const GRAVITY = 0.78;
    const GRAVITY_HOLD = 0.42;   // softer gravity while holding jump and ascending
    const JUMP_VY = -13.0;
    const DJ_VY   = -11.5;
    const MAX_FALL = 18;

    // ── World ──────────────────────────────────────────────────────────
    // Start slow and ramp gradually so the game is actually playable.
    let speed = 4.8;
    const SPEED_MAX = 9.5;
    const SPEED_RAMP = 0.0006; // per-frame @60fps

    // ── Snapshot power-ups from inventory at game start ────────────────
    const inv = inventoryRef.current;
    let shieldCharges = inv.shield;
    let djCharges = inv.doubleJump;
    let autoCharges = inv.autoJump;
    const magnetActive = inv.magnet > 0;
    const slowmoActive = inv.slowmo > 0;
    let rocketLeftMs = inv.rocket > 0 ? 5000 : 0;

    // Report consumption to React (inventory clears, balance is server-of-truth).
    const consumeStart = () => {
      const invSnap = inventoryRef.current;
      for (let i = 0; i < invSnap.shield; i++)     cbRef.current.onConsumePowerUp('shield');
      for (let i = 0; i < invSnap.doubleJump; i++) cbRef.current.onConsumePowerUp('doubleJump');
      for (let i = 0; i < invSnap.autoJump; i++)   cbRef.current.onConsumePowerUp('autoJump');
      for (let i = 0; i < invSnap.magnet; i++)     cbRef.current.onConsumePowerUp('magnet');
      for (let i = 0; i < invSnap.slowmo; i++)     cbRef.current.onConsumePowerUp('slowmo');
      for (let i = 0; i < invSnap.rocket; i++)     cbRef.current.onConsumePowerUp('rocket');
    };
    consumeStart();

    // Apply slowmo by scaling speed (works for the whole run)
    const speedMultiplier = () => (rocketLeftMs > 0 ? 1.6 : slowmoActive ? 0.55 : 1);

    // ── Entities ───────────────────────────────────────────────────────
    interface Obstacle {
      x: number; y: number; w: number; h: number;
      kind: 'spike' | 'drone';
      baseY: number; // for drones (bob reference)
      phase: number;
    }
    interface Token { x: number; y: number; taken: boolean; bob: number }

    let obstacles: Obstacle[] = [];
    let tokens: Token[] = [];

    // Pixel distance since last spawn — decoupled from wall-clock so pause is safe.
    let distSinceObstacle = 0;
    let distSinceToken = 0;

    const spawnObstacle = () => {
      const isDrone = Math.random() < 0.22;
      if (isDrone) {
        const baseY = GROUND_Y - 90 - Math.random() * 30;
        obstacles.push({
          kind: 'drone',
          x: W + 30,
          y: baseY,
          baseY,
          w: 44,
          h: 24,
          phase: Math.random() * Math.PI * 2,
        });
      } else {
        // Ground obstacles vary in height a little.
        const tall = Math.random() < 0.25;
        const h = tall ? 58 : 34;
        const w = 24 + Math.random() * 14;
        obstacles.push({
          kind: 'spike',
          x: W + 30,
          y: GROUND_Y - h,
          baseY: GROUND_Y - h,
          w,
          h,
          phase: 0,
        });
      }
    };

    const spawnTokens = () => {
      const base = W + 30;
      const low = Math.random() < 0.4;
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        tokens.push({
          x: base + i * 36,
          y: low ? GROUND_Y - 30 : GROUND_Y - 90 + Math.sin(i * 0.7) * 12,
          bob: i * 0.7,
          taken: false,
        });
      }
    };

    // Distance between obstacle spawns scales with speed for readability.
    const obsGap = () => Math.max(260, 420 - speed * 16) + Math.random() * 120;
    const tokGap = () => 340 + Math.random() * 220;

    // ── Input ──────────────────────────────────────────────────────────
    let holding = false;

    const doJump = () => {
      if (rocketLeftMs > 0) return; // rocket = auto-flight
      if (player.onGround) {
        player.vy = JUMP_VY;
        player.onGround = false;
        player.dj = djCharges > 0; // queue a double-jump if any charges
        playSound('jump');
      } else if (player.dj) {
        player.vy = DJ_VY;
        player.dj = false;
        djCharges = Math.max(0, djCharges - 1);
        playSound('jump');
      }
    };

    const resumeAudio = () => {
      const ac = audioCtxRef.current;
      if (ac && ac.state === 'suspended') ac.resume();
    };
    const onPointerDown = (e: Event) => {
      e.preventDefault();
      resumeAudio();
      holding = true;
      doJump();
    };
    const onPointerUp = () => { holding = false; };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        resumeAudio();
        holding = true;
        doJump();
      } else if (e.code === 'KeyP') {
        onPause();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') holding = false;
    };

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);
    canvas.addEventListener('touchstart', onPointerDown, { passive: false });
    canvas.addEventListener('touchend', onPointerUp);
    canvas.addEventListener('touchcancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Background stars (static across frame; only position changes) ──
    const STAR_COUNT = 28;
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * (GROUND_Y - 20),
      r: 0.6 + Math.random() * 1.1,
      spd: 0.15 + Math.random() * 0.35,
    }));

    // ── Collision helper (AABB with safety margin) ─────────────────────
    const M = 5; // inset
    const hit = (o: Obstacle) =>
      player.x + M < o.x + o.w &&
      player.x + PW - M > o.x &&
      player.y + M < o.y + o.h &&
      player.y + PH - M > o.y;

    // ── Rounded rect helper ────────────────────────────────────────────
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

    // ── Run-state scalars ──────────────────────────────────────────────
    let distance = 0;        // total pixels traveled
    let jumpEarned = 0;      // $JUMP tokens collected this run
    let alive = true;
    let lastReactUpdate = 0;
    let groundOffset = 0;
    let shakeMs = 0;

    // ── Frame loop ─────────────────────────────────────────────────────
    let animId = 0;
    let lastTime = 0;

    const tick = (now: number) => {
      animId = requestAnimationFrame(tick);

      const rawDt = lastTime === 0 ? 16 : now - lastTime;
      lastTime = now;
      // Normalize to 60fps baseline; clamp so background tabs / slow frames
      // don't cause a giant step that teleports obstacles across the screen.
      const dt = Math.min(rawDt, 48) / (1000 / 60);

      // Paused: keep rendering (for the "PAUSED" overlay) but skip physics.
      if (pausedRef.current || !alive) {
        render(now);
        return;
      }

      // ── Rocket timer ────────────────────────────────────────────────
      if (rocketLeftMs > 0) {
        rocketLeftMs = Math.max(0, rocketLeftMs - rawDt);
        if (rocketLeftMs === 0) {
          // Drop back to the ground
          player.onGround = false;
        }
      }

      // ── Player physics ──────────────────────────────────────────────
      if (rocketLeftMs > 0) {
        const targetY = GROUND_Y - PH - 90;
        player.y += (targetY - player.y) * 0.18 * dt;
        player.vy = 0;
        player.onGround = false;
      } else {
        const g = holding && player.vy < 0 ? GRAVITY_HOLD : GRAVITY;
        player.vy = Math.min(player.vy + g * dt, MAX_FALL);
        player.y += player.vy * dt;

        // Ground contact
        if (player.y >= GROUND_Y - PH) {
          player.y = GROUND_Y - PH;
          player.vy = 0;
          player.onGround = true;
          player.dj = false;
        }
      }

      // ── Auto-jump assist ────────────────────────────────────────────
      if (autoCharges > 0 && player.onGround && rocketLeftMs === 0) {
        const ahead = obstacles.find((o) => o.kind === 'spike' && o.x > player.x && o.x - player.x < 150);
        if (ahead) {
          doJump();
          autoCharges = Math.max(0, autoCharges - 1);
        }
      }

      // ── World scroll ────────────────────────────────────────────────
      const mult = speedMultiplier();
      const step = speed * mult * dt; // pixels moved this frame
      distance += step;
      groundOffset = (groundOffset + step) % 40;

      // Gentle ramp-up
      speed = Math.min(SPEED_MAX, speed + SPEED_RAMP * dt);

      // ── Spawns ──────────────────────────────────────────────────────
      distSinceObstacle += step;
      if (distSinceObstacle >= obsGap()) {
        spawnObstacle();
        distSinceObstacle = 0;
      }
      distSinceToken += step;
      if (distSinceToken >= tokGap()) {
        spawnTokens();
        distSinceToken = 0;
      }

      // ── Obstacles ───────────────────────────────────────────────────
      for (const o of obstacles) {
        o.x -= step;
        if (o.kind === 'drone') {
          o.phase += 0.06 * dt;
          o.y = o.baseY + Math.sin(o.phase) * 14;
        }
      }
      obstacles = obstacles.filter((o) => o.x + o.w > -40);

      // ── Tokens (scroll, magnet, collect) ────────────────────────────
      for (const tk of tokens) {
        if (tk.taken) continue;
        tk.x -= step;
        tk.bob += 0.12 * dt;
        if (magnetActive) {
          const cx = player.x + PW / 2;
          const cy = player.y + PH / 2;
          const dx = cx - tk.x;
          const dy = cy - tk.y;
          const d = Math.hypot(dx, dy);
          if (d < 220 && d > 0.01) {
            const pull = (1 - d / 220) * 4 * dt;
            tk.x += (dx / d) * pull;
            tk.y += (dy / d) * pull;
          }
        }
        // Collect?
        const dx2 = tk.x - (player.x + PW / 2);
        const dy2 = tk.y - (player.y + PH / 2);
        if (Math.hypot(dx2, dy2) < 22) {
          tk.taken = true;
          jumpEarned += 5;
          playSound('coin');
        }
      }
      tokens = tokens.filter((tk) => !tk.taken && tk.x > -30);

      // ── Collisions ──────────────────────────────────────────────────
      for (const o of obstacles) {
        if (!hit(o)) continue;
        if (rocketLeftMs > 0) {
          o.x = -9999; // destroyed
          shakeMs = 140;
          continue;
        }
        if (shieldCharges > 0) {
          shieldCharges--;
          o.x = -9999;
          shakeMs = 220;
          // Also sweep nearby obstacles so the next frame doesn't insta-kill
          obstacles.forEach((other) => {
            if (other !== o && Math.abs(other.x - player.x) < 160) other.x = -9999;
          });
          playSound('power');
          continue;
        }
        // Dead
        alive = false;
        shakeMs = 400;
        playSound('hit');
        cbRef.current.onGameOver(Math.floor(distance / 10), jumpEarned);
        render(now);
        cancelAnimationFrame(animId);
        cleanup();
        return;
      }

      // ── Decay effects ───────────────────────────────────────────────
      if (shakeMs > 0) shakeMs = Math.max(0, shakeMs - rawDt);

      // ── Background parallax ────────────────────────────────────────
      for (const s of stars) {
        s.x -= s.spd * dt;
        if (s.x < -2) s.x = W + 2;
      }

      // ── Throttled React state updates (~6 per second) ──────────────
      if (now - lastReactUpdate > 160) {
        lastReactUpdate = now;
        cbRef.current.onScoreUpdate(Math.floor(distance / 10));
        cbRef.current.onJumpCollected(jumpEarned);
      }

      render(now);
    };

    // ── Render ─────────────────────────────────────────────────────────
    const render = (now: number) => {
      // Camera shake
      const shakeIntensity = shakeMs > 0 ? Math.min(6, shakeMs / 40) : 0;
      const sx = shakeIntensity ? (Math.random() - 0.5) * shakeIntensity : 0;
      const sy = shakeIntensity ? (Math.random() - 0.5) * shakeIntensity : 0;

      ctx.save();
      ctx.translate(sx, sy);

      // Sky gradient
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#050b14');
      g.addColorStop(0.7, '#0a1628');
      g.addColorStop(1, '#0d1f3c');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // Stars
      ctx.fillStyle = '#ffffff';
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(now * 0.002 + s.x * 0.05);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Ground glow line
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(W, GROUND_Y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Dashed sub-line for motion feel
      ctx.strokeStyle = 'rgba(6,182,212,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([18, 18]);
      ctx.lineDashOffset = -groundOffset;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 14);
      ctx.lineTo(W, GROUND_Y + 14);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tokens
      for (const tk of tokens) {
        if (tk.taken) continue;
        const ty = tk.y + Math.sin(tk.bob) * 4;
        ctx.save();
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(tk.x, ty, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(tk.x, ty, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#78350f';
        ctx.font = 'bold 9px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('J', tk.x, ty + 1);
        ctx.restore();
      }

      // Obstacles
      for (const o of obstacles) {
        if (o.x < -40 || o.x > W + 40) continue;
        ctx.save();
        if (o.kind === 'drone') {
          ctx.shadowColor = '#e879a0';
          ctx.shadowBlur = 12;
          ctx.fillStyle = '#831843';
          rrect(o.x, o.y, o.w, o.h, 5);
          ctx.fill();
          ctx.strokeStyle = '#e879a0';
          ctx.lineWidth = 1.5;
          rrect(o.x, o.y, o.w, o.h, 5);
          ctx.stroke();
          // Propellers
          ctx.strokeStyle = '#f472b6';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(o.x + 8, o.y - 4); ctx.lineTo(o.x + 8, o.y);
          ctx.moveTo(o.x + o.w - 8, o.y - 4); ctx.lineTo(o.x + o.w - 8, o.y);
          ctx.stroke();
        } else {
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 12;
          ctx.fillStyle = '#7f1d1d';
          rrect(o.x, o.y, o.w, o.h, 4);
          ctx.fill();
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          rrect(o.x, o.y, o.w, o.h, 4);
          ctx.stroke();
          // Spikes along top
          ctx.fillStyle = '#ef4444';
          const spikes = Math.max(2, Math.floor(o.w / 8));
          const sw = o.w / spikes;
          for (let i = 0; i < spikes; i++) {
            const xi = o.x + i * sw;
            ctx.beginPath();
            ctx.moveTo(xi, o.y);
            ctx.lineTo(xi + sw / 2, o.y - 8);
            ctx.lineTo(xi + sw, o.y);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.restore();
      }

      // Player
      ctx.save();
      const px = player.x;
      const py = player.y;

      // Shield aura
      if (shieldCharges > 0) {
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(px + PW / 2, py + PH / 2, PW / 2 + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Body glow
      ctx.shadowColor = rocketLeftMs > 0 ? '#f59e0b' : '#06b6d4';
      ctx.shadowBlur = rocketLeftMs > 0 ? 28 : 16;
      ctx.fillStyle = rocketLeftMs > 0 ? '#f59e0b' : '#0ea5e9';
      rrect(px + 4, py, PW - 8, PH, 8);
      ctx.fill();

      // Head tint
      ctx.fillStyle = rocketLeftMs > 0 ? '#fbbf24' : '#38bdf8';
      rrect(px + 7, py + 4, PW - 14, PH * 0.45, 6);
      ctx.fill();

      // Eye
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(px + PW / 2 + 4, py + 14, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px + PW / 2 + 5, py + 13, 1.3, 0, Math.PI * 2);
      ctx.fill();

      // Legs (hidden while jumping/flying)
      if (player.onGround && rocketLeftMs === 0) {
        const wobble = Math.sin(now * 0.025) * 2;
        ctx.fillStyle = '#0284c7';
        rrect(px + 6, py + PH - 12 + wobble, 9, 12, 3); ctx.fill();
        rrect(px + PW - 15, py + PH - 12 - wobble, 9, 12, 3); ctx.fill();
      }

      // Rocket flame
      if (rocketLeftMs > 0) {
        ctx.fillStyle = '#fde68a';
        ctx.globalAlpha = 0.8 + 0.2 * Math.sin(now * 0.02);
        ctx.beginPath();
        ctx.moveTo(px + 8, py + PH);
        ctx.lineTo(px + PW / 2, py + PH + 16 + Math.random() * 5);
        ctx.lineTo(px + PW - 8, py + PH);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;
      ctx.restore();

      // HUD — score top-right
      const score = Math.floor(distance / 10);
      ctx.fillStyle = 'rgba(5,15,30,0.78)';
      rrect(W - 116, 10, 104, 32, 6);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 9px ui-sans-serif, system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('SCORE', W - 110, 14);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 15px ui-sans-serif, system-ui';
      ctx.fillText(score.toString(), W - 110, 24);

      // HUD — earned $JUMP top-right (below score)
      ctx.fillStyle = 'rgba(245,158,11,0.12)';
      rrect(W - 116, 48, 104, 24, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245,158,11,0.5)';
      ctx.lineWidth = 1;
      rrect(W - 116, 48, 104, 24, 6);
      ctx.stroke();
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px ui-sans-serif, system-ui';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${jumpEarned} $JUMP`, W - 110, 60);

      // HUD — active power-up chips (left)
      let chipY = 12;
      const addChip = (label: string, color: string) => {
        ctx.fillStyle = 'rgba(5,15,30,0.80)';
        rrect(12, chipY, 96, 20, 5);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        rrect(12, chipY, 96, 20, 5);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = 'bold 10px ui-sans-serif, system-ui';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, 20, chipY + 10);
        chipY += 24;
      };
      if (rocketLeftMs > 0) addChip(`ROCKET ${(rocketLeftMs / 1000).toFixed(1)}s`, '#f59e0b');
      if (shieldCharges > 0) addChip(`SHIELD x${shieldCharges}`, '#06b6d4');
      if (djCharges > 0) addChip(`DBL JUMP x${djCharges}`, '#34d399');
      if (autoCharges > 0) addChip(`AUTO x${autoCharges}`, '#a3e635');
      if (magnetActive) addChip('MAGNET', '#e879a0');
      if (slowmoActive) addChip('SLOW-MO', '#38bdf8');

      // Paused overlay
      if (pausedRef.current) {
        ctx.fillStyle = 'rgba(5,10,20,0.70)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 28px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', W / 2, H / 2 - 8);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '12px ui-sans-serif, system-ui';
        ctx.fillText('Tap play or press P to resume', W / 2, H / 2 + 18);
      }

      // Death overlay (shown briefly before React shows GameOver screen)
      if (!alive) {
        ctx.fillStyle = 'rgba(5,10,20,0.75)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 30px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GAME OVER', W / 2, H / 2 - 10);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '14px ui-sans-serif, system-ui';
        ctx.fillText(`Score ${Math.floor(distance / 10)}`, W / 2, H / 2 + 18);
      }

      ctx.restore();
    };

    const cleanup = () => {
      canvas.removeEventListener('mousedown', onPointerDown);
      canvas.removeEventListener('mouseup', onPointerUp);
      canvas.removeEventListener('mouseleave', onPointerUp);
      canvas.removeEventListener('touchstart', onPointerDown);
      canvas.removeEventListener('touchend', onPointerUp);
      canvas.removeEventListener('touchcancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };

    animId = requestAnimationFrame(tick);
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
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/35">
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
          {paused ? (
            <Play className="h-3.5 w-3.5" fill="currentColor" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
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
