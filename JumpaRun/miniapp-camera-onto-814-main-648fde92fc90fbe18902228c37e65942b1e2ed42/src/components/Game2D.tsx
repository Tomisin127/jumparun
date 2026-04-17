'use client';

import { useEffect, useRef, useState } from 'react';

export interface Game2DProps {
  isPlaying: boolean;
  autoJumpActive: boolean;
  autoJumpRemaining: number;
  onGameOver: (score: number) => void;
  onScoreUpdate: (score: number) => void;
  onAutoJumpExpired: () => void;
  onAutoJumpUsed: () => void;
}

interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  color: string;
}

interface Cloud {
  x: number;
  y: number;
  speed: number;
  size: number;
}

export default function Game2D({ isPlaying, autoJumpActive, autoJumpRemaining, onGameOver, onScoreUpdate, onAutoJumpExpired, onAutoJumpUsed }: Game2DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const audioContextRef = useRef<AudioContext | null>(null);
  const baseLogoRef = useRef<HTMLImageElement | null>(null);
  
  // Store callbacks and state in refs to prevent game restarts
  const onGameOverRef = useRef(onGameOver);
  const onScoreUpdateRef = useRef(onScoreUpdate);
  const onAutoJumpExpiredRef = useRef(onAutoJumpExpired);
  const onAutoJumpUsedRef = useRef(onAutoJumpUsed);
  const autoJumpActiveRef = useRef(autoJumpActive);
  const autoJumpRemainingRef = useRef(autoJumpRemaining);
  
  // Update refs when values change (but don't restart game)
  useEffect(() => {
    onGameOverRef.current = onGameOver;
    onScoreUpdateRef.current = onScoreUpdate;
    onAutoJumpExpiredRef.current = onAutoJumpExpired;
    onAutoJumpUsedRef.current = onAutoJumpUsed;
    autoJumpActiveRef.current = autoJumpActive;
    autoJumpRemainingRef.current = autoJumpRemaining;
  }, [onGameOver, onScoreUpdate, onAutoJumpExpired, onAutoJumpUsed, autoJumpActive, autoJumpRemaining]);
  
  // Load Base logo
  useEffect(() => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(`
      <svg width="111" height="111" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H3.9565e-07C2.35281 87.8625 26.0432 110.034 54.921 110.034Z" fill="#0052FF"/>
      </svg>
    `);
    img.onload = () => {
      baseLogoRef.current = img;
    };
  }, []);
  
  useEffect(() => {
    const updateDimensions = () => {
      const width = Math.min(window.innerWidth - 32, 800);
      const height = Math.min(window.innerHeight * 0.6, 400);
      setDimensions({ width, height });
    };
    
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize Audio Context
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const audioCtx = audioContextRef.current;

    // Sound effect functions
    const playJumpSound = () => {
      if (!audioCtx) return;
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.1);
    };

    const playGameOverSound = () => {
      if (!audioCtx) return;
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
      
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.3);
    };

    // Game constants - HIGHER JUMPS!
    const GRAVITY: number = 0.8;
    const JUMP_FORCE: number = -18; // Much higher!
    const GROUND_Y: number = dimensions.height - 80;
    const PLAYER_SIZE: number = 50;
    const OBSTACLE_WIDTH: number = 35;
    const OBSTACLE_HEIGHT: number = 60;
    const INITIAL_SPEED: number = 4;
    const SPEED_INCREMENT: number = 0.001;
    const MIN_OBSTACLE_SPACING: number = 350;
    const MAX_OBSTACLE_SPACING: number = 600;

    let player: GameObject = {
      x: 100,
      y: GROUND_Y - PLAYER_SIZE,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      velocityY: 0
    };

    let obstacles: Obstacle[] = [];
    let particles: Particle[] = [];
    let clouds: Cloud[] = [];
    let score: number = 0;
    let gameSpeed: number = INITIAL_SPEED;
    let isJumping: boolean = false;
    let gameActive: boolean = true;
    let lastObstacleX: number = dimensions.width;
    let animationId: number;
    let cameraShake: number = 0;
    let scorePopup: { value: number; opacity: number; y: number } | null = null;
    let lastAutoJumpTime: number = 0;
    let lastJumpedObstacleX: number = -1000; // Track last obstacle we jumped over

    // Initialize clouds
    for (let i = 0; i < 5; i++) {
      clouds.push({
        x: Math.random() * dimensions.width,
        y: Math.random() * (GROUND_Y - 100),
        speed: 0.2 + Math.random() * 0.3,
        size: 40 + Math.random() * 30
      });
    }

    const createParticles = (x: number, y: number, color: string) => {
      for (let i = 0; i < 8; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8 - 4,
          life: 1,
          size: 3 + Math.random() * 4,
          color
        });
      }
    };

    const jump = (): void => {
      if (!isJumping && player.y >= GROUND_Y - PLAYER_SIZE - 5) {
        player.velocityY = JUMP_FORCE;
        isJumping = true;
        playJumpSound();
        createParticles(player.x + player.width / 2, player.y + player.height, '#0052FF');
      }
    };

    const handleInput = (): void => {
      jump();
    };

    const spawnObstacle = (): void => {
      if (obstacles.length === 0 || 
          lastObstacleX < dimensions.width - MIN_OBSTACLE_SPACING) {
        const spacing: number = MIN_OBSTACLE_SPACING + 
                               Math.random() * (MAX_OBSTACLE_SPACING - MIN_OBSTACLE_SPACING);
        
        obstacles.push({
          x: dimensions.width,
          y: GROUND_Y - OBSTACLE_HEIGHT,
          width: OBSTACLE_WIDTH,
          height: OBSTACLE_HEIGHT
        });
        
        lastObstacleX = dimensions.width;
      }
    };

    const checkCollision = (obj1: GameObject | Obstacle, obj2: Obstacle): boolean => {
      const margin = 5; // Slightly more forgiving hitbox
      return (
        obj1.x + margin < obj2.x + obj2.width &&
        obj1.x + obj1.width - margin > obj2.x &&
        obj1.y + margin < obj2.y + obj2.height &&
        obj1.y + obj1.height - margin > obj2.y
      );
    };

    const update = (): void => {
      if (!gameActive) return;

      // Player physics
      player.velocityY += GRAVITY;
      player.y += player.velocityY;

      if (player.y >= GROUND_Y - PLAYER_SIZE) {
        player.y = GROUND_Y - PLAYER_SIZE;
        player.velocityY = 0;
        isJumping = false;
        
        // Landing particles
        if (Math.random() > 0.8) {
          createParticles(player.x + player.width / 2, player.y + player.height, '#0052FF');
        }
      }

      // Game speed
      gameSpeed += SPEED_INCREMENT;
      score += 1;
      const displayScore = Math.floor(score / 60);
      onScoreUpdateRef.current(displayScore);

      // Update obstacles
      obstacles.forEach((obstacle: Obstacle) => {
        obstacle.x -= gameSpeed;
      });

      obstacles = obstacles.filter((obstacle: Obstacle) => 
        obstacle.x + obstacle.width > -50
      );

      if (obstacles.length > 0) {
        lastObstacleX = obstacles[obstacles.length - 1].x;
      }

      spawnObstacle();

      // Auto-jump logic - ONE jump per obstacle, based on remaining jumps from parent
      if (autoJumpActiveRef.current && autoJumpRemainingRef.current > 0 && obstacles.length > 0) {
        const nearestObstacle: Obstacle = obstacles[0];
        const distanceToObstacle: number = nearestObstacle.x - (player.x + player.width);
        
        // Fixed jump window for optimal jumping
        const optimalJumpDistance: number = 120;
        const jumpTolerance: number = 30;
        const minDistance: number = optimalJumpDistance - jumpTolerance; // 90
        const maxDistance: number = optimalJumpDistance + jumpTolerance; // 150
        
        // Check if this is a NEW obstacle (not the one we already jumped for)
        const isNewObstacle = Math.abs(nearestObstacle.x - lastJumpedObstacleX) > 50;
        
        // Only jump when: new obstacle, in range, player grounded, and cooldown elapsed
        const currentTime = Date.now();
        const timeSinceLastJump = currentTime - lastAutoJumpTime;
        const isGrounded = player.y >= GROUND_Y - PLAYER_SIZE - 5;
        
        if (isNewObstacle &&
            distanceToObstacle > minDistance && 
            distanceToObstacle < maxDistance && 
            !isJumping &&
            isGrounded &&
            timeSinceLastJump > 600) { // 600ms cooldown
          jump();
          lastAutoJumpTime = currentTime;
          lastJumpedObstacleX = nearestObstacle.x; // Remember this obstacle
          onAutoJumpUsedRef.current(); // Notify parent to decrement counter
          
          // Show remaining jumps popup
          const remaining = autoJumpRemainingRef.current - 1;
          scorePopup = {
            value: remaining,
            opacity: 1,
            y: 80
          };
          
          // Check if this was the last jump
          if (remaining <= 0) {
            setTimeout(() => {
              onAutoJumpExpiredRef.current();
            }, 500);
          }
        }
      }

      // Update particles
      particles = particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // gravity
        p.life -= 0.02;
        return p.life > 0;
      });

      // Update clouds
      clouds.forEach(cloud => {
        cloud.x -= cloud.speed;
        if (cloud.x + cloud.size < 0) {
          cloud.x = dimensions.width + cloud.size;
          cloud.y = Math.random() * (GROUND_Y - 100);
        }
      });

      // Camera shake decay
      if (cameraShake > 0) {
        cameraShake *= 0.9;
      }

      // Score popup animation
      if (scorePopup) {
        scorePopup.y -= 2;
        scorePopup.opacity -= 0.02;
        if (scorePopup.opacity <= 0) {
          scorePopup = null;
        }
      }

      // Collision detection
      for (const obstacle of obstacles) {
        if (checkCollision(player, obstacle)) {
          gameActive = false;
          cameraShake = 10;
          playGameOverSound();
          createParticles(player.x + player.width / 2, player.y + player.height / 2, '#FF4444');
          onGameOverRef.current(displayScore);
          break;
        }
      }
    };

    const drawCloud = (x: number, y: number, size: number) => {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
      ctx.arc(x + size * 0.4, y, size * 0.35, 0, Math.PI * 2);
      ctx.arc(x - size * 0.4, y, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (): void => {
      const shakeX = (Math.random() - 0.5) * cameraShake;
      const shakeY = (Math.random() - 0.5) * cameraShake;

      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Sky gradient - more vibrant
      const gradient = ctx.createLinearGradient(0, 0, 0, dimensions.height);
      gradient.addColorStop(0, '#4A90E2');
      gradient.addColorStop(0.7, '#87CEEB');
      gradient.addColorStop(1, '#B0E0E6');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Draw clouds
      clouds.forEach(cloud => {
        drawCloud(cloud.x, cloud.y, cloud.size);
      });

      // Ground with gradient
      const groundGradient = ctx.createLinearGradient(0, GROUND_Y, 0, dimensions.height);
      groundGradient.addColorStop(0, '#2C5F2D');
      groundGradient.addColorStop(0.5, '#228B22');
      groundGradient.addColorStop(1, '#1B5E20');
      ctx.fillStyle = groundGradient;
      ctx.fillRect(0, GROUND_Y, dimensions.width, dimensions.height - GROUND_Y);

      // Ground line
      ctx.strokeStyle = '#1B5E20';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y);
      ctx.lineTo(dimensions.width, GROUND_Y);
      ctx.stroke();

      // Grass details
      ctx.strokeStyle = 'rgba(76, 175, 80, 0.5)';
      ctx.lineWidth = 2;
      for (let i = 0; i < dimensions.width; i += 20) {
        const grassHeight = 8 + Math.sin(i * 0.1) * 3;
        ctx.beginPath();
        ctx.moveTo(i, GROUND_Y);
        ctx.lineTo(i, GROUND_Y - grassHeight);
        ctx.stroke();
      }

      // Draw particles
      particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Draw player with Base logo and glow effect
      if (baseLogoRef.current) {
        // Glow effect
        ctx.shadowColor = '#0052FF';
        ctx.shadowBlur = 20;
        
        // Draw Base logo
        ctx.drawImage(
          baseLogoRef.current,
          player.x,
          player.y,
          player.width,
          player.height
        );
        
        ctx.shadowBlur = 0;

        // Jump trail effect
        if (isJumping) {
          ctx.globalAlpha = 0.3;
          ctx.drawImage(
            baseLogoRef.current,
            player.x - 5,
            player.y + 5,
            player.width,
            player.height
          );
          ctx.globalAlpha = 1;
        }
      } else {
        // Fallback: Blue square with Base colors
        ctx.fillStyle = '#0052FF';
        ctx.shadowColor = '#0052FF';
        ctx.shadowBlur = 20;
        ctx.fillRect(player.x, player.y, player.width, player.height);
        ctx.shadowBlur = 0;
      }

      // Draw obstacles with gradient and depth
      obstacles.forEach((obstacle: Obstacle) => {
        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(obstacle.x + 5, obstacle.y + 5, obstacle.width, obstacle.height);

        // Main obstacle with gradient
        const obstacleGradient = ctx.createLinearGradient(
          obstacle.x, 
          obstacle.y, 
          obstacle.x + obstacle.width, 
          obstacle.y
        );
        obstacleGradient.addColorStop(0, '#FF3B30');
        obstacleGradient.addColorStop(1, '#DC143C');
        ctx.fillStyle = obstacleGradient;
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);

        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width * 0.3, obstacle.height);
      });

      // Auto-jump overlay
      if (autoJumpActiveRef.current && autoJumpRemainingRef.current > 0) {
        ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
        ctx.fillRect(0, 0, dimensions.width, dimensions.height);
        
        // Pulsing border
        const pulseAlpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.3;
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulseAlpha})`;
        ctx.lineWidth = 4;
        ctx.strokeRect(2, 2, dimensions.width - 4, dimensions.height - 4);
        
        // Auto-jump indicator with remaining count
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 18px Arial';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;
        ctx.fillText(`⚡ AUTO-JUMP: ${autoJumpRemainingRef.current} left`, dimensions.width - 220, 30);
        ctx.shadowBlur = 0;
      }

      // Score/Auto-jump popup animation
      if (scorePopup) {
        ctx.globalAlpha = scorePopup.opacity;
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 24px Arial';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;
        const text = autoJumpActiveRef.current ? `${scorePopup.value} jumps left` : `+${scorePopup.value}`;
        ctx.fillText(text, dimensions.width / 2 - 60, scorePopup.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    };

    const gameLoop = (): void => {
      update();
      draw();
      if (gameActive) {
        animationId = requestAnimationFrame(gameLoop);
      }
    };

    canvas.addEventListener('click', handleInput);
    canvas.addEventListener('touchstart', handleInput);

    spawnObstacle();
    gameLoop();

    return () => {
      canvas.removeEventListener('click', handleInput);
      canvas.removeEventListener('touchstart', handleInput);
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying, dimensions]); // Only restart game when isPlaying or dimensions change

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      className="border-4 border-blue-600 rounded-xl shadow-2xl cursor-pointer bg-white"
      style={{ 
        touchAction: 'none',
        maxWidth: '100%',
        height: 'auto',
        boxShadow: '0 0 30px rgba(0, 82, 255, 0.4)'
      }}
    />
  );
}
