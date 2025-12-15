
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { COLORS, PHYSICS, HAND, CAMERA, CUBE_PALETTE, TRAIL } from '../constants';
import { HandResult, HandLandmark } from '../types';
import { AudioSystem } from '../utils/audio';

interface GameCanvasProps {
  onStatsUpdate: (stats: { 
    fps: number; 
    cubes: number; 
    hands: { left: boolean; right: boolean; leftGrabbing: boolean; rightGrabbing: boolean } 
  }) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ onStatsUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Systems Refs
  const engineRef = useRef<any>(null);
  const runnerRef = useRef<any>(null);
  const handLandmarkerRef = useRef<any>(null);
  const handConnectionsRef = useRef<any[]>([]); 
  const animationFrameRef = useRef<number>(0);
  const audioSystemRef = useRef<AudioSystem | null>(null);
  
  // Interaction Refs - Mapped by Handedness ("Left" | "Right")
  const handConstraintsRef = useRef<Map<string, any>>(new Map());
  const activePinchMap = useRef<Map<string, boolean>>(new Map());
  
  // Visual Effects Refs
  const bodyTrailsRef = useRef<Map<number, { x: number, y: number }[]>>(new Map());
  const throwGlowsRef = useRef<Map<number, { time: number, color: string }>>(new Map());
  
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("INITIALIZING CORE SYSTEMS...");
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  
  // Mutable game state for stats
  const gameState = useRef({
    lastTime: 0,
    fps: 0,
    cubeCount: 0,
    hands: { left: false, right: false, leftGrabbing: false, rightGrabbing: false }
  });

  // --- Physics & Hand Logic ---
  const initPhysics = useCallback(() => {
    if (!window.Matter) return null;
    const Matter = window.Matter;

    const engine = Matter.Engine.create();
    engine.gravity.y = PHYSICS.gravity;

    Matter.Events.on(engine, 'collisionStart', (event: any) => {
        const pairs = event.pairs;
        let maxImpact = 0;
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            const vA = pair.bodyA.velocity;
            const vB = pair.bodyB.velocity;
            const impact = Math.abs(vA.x - vB.x) + Math.abs(vA.y - vB.y);
            if (impact > maxImpact) maxImpact = impact;
        }
        
        if (maxImpact > 2 && audioSystemRef.current) {
            audioSystemRef.current.playCollision(maxImpact);
        }
    });

    const runner = Matter.Runner.create();

    // Initial walls - will be resized in loop
    const walls: any[] = [];
    Matter.World.add(engine.world, walls);

    return { engine, runner, walls };
  }, []);

  const initMediaPipe = useCallback(async () => {
    try {
      setStatus("LOADING NEURAL NETWORK...");
      // @ts-ignore
      const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm");
      const { FilesetResolver, HandLandmarker } = vision;

      const wasm = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      
      const handLandmarker = await HandLandmarker.createFromOptions(wasm, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2 
      });
      
      return { 
        landmarker: handLandmarker, 
        connections: HandLandmarker.HAND_CONNECTIONS 
      };
    } catch (error) {
      console.error("MediaPipe Init Error:", error);
      setStatus("VISION API FAILED");
      return null;
    }
  }, []);

  const unlockAudio = useCallback(() => {
    if (audioSystemRef.current) {
        audioSystemRef.current.resume();
        audioSystemRef.current.startDrone();
    }
  }, []);

  const addObject = useCallback(() => {
    unlockAudio();
    if (audioSystemRef.current) audioSystemRef.current.playSpawn();

    if (!engineRef.current || !canvasRef.current) return;
    const Matter = window.Matter;
    const width = canvasRef.current.width;
    
    const size = 40 + Math.random() * 40;
    // Spawn within the visible area
    const x = Math.random() * (width - 200) + 100;
    const y = -100;
    
    const color = CUBE_PALETTE[Math.floor(Math.random() * CUBE_PALETTE.length)];
    const isCircle = Math.random() > 0.5;

    const commonOptions = {
      restitution: PHYSICS.restitution,
      friction: PHYSICS.friction,
      density: PHYSICS.density,
      render: {
        fillStyle: color,
        strokeStyle: 'rgba(255,255,255,0.5)',
        lineWidth: 1
      }
    };

    let body;
    if (isCircle) {
      body = Matter.Bodies.circle(x, y, size / 2, commonOptions);
    } else {
      body = Matter.Bodies.rectangle(x, y, size, size, {
        ...commonOptions,
        chamfer: { radius: 8 }
      });
    }

    Matter.Body.setAngle(body, Math.random() * Math.PI);
    Matter.World.add(engineRef.current.world, body);
    gameState.current.cubeCount++;
  }, [unlockAudio]);

  const resetWorld = useCallback(() => {
    unlockAudio();
    if (!engineRef.current || !canvasRef.current) return;
    const Matter = window.Matter;
    const width = canvasRef.current.width;
    const height = canvasRef.current.height;

    Matter.Composite.clear(engineRef.current.world, false);
    handConstraintsRef.current.clear();
    activePinchMap.current.clear();
    bodyTrailsRef.current.clear();
    throwGlowsRef.current.clear();
    
    const walls = [
      Matter.Bodies.rectangle(width / 2, height + 50, width, 100, { isStatic: true }),
      Matter.Bodies.rectangle(-50, height / 2, 100, height, { isStatic: true }),
      Matter.Bodies.rectangle(width + 50, height / 2, 100, height, { isStatic: true })
    ];
    Matter.World.add(engineRef.current.world, walls);
    gameState.current.cubeCount = 0;
    
    for(let i=0; i<5; i++) setTimeout(addObject, i * 150);

  }, [addObject, unlockAudio]);

  const toggleCamera = useCallback(() => {
    unlockAudio();
    setIsCameraOn(prev => !prev);
  }, [unlockAudio]);

  const toggleMute = useCallback(() => {
    unlockAudio();
    setIsMuted(prev => {
        const next = !prev;
        if (audioSystemRef.current) audioSystemRef.current.setMuted(next);
        return next;
    });
  }, [unlockAudio]);

  // --- Camera & Loop Effect ---
  useEffect(() => {
    let currentStream: MediaStream | null = null;
    let isCancelled = false;
    let retryTimeout: any = null;

    const cleanup = () => {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };

    const setupCamera = async (attempt = 1) => {
      if (!isCameraOn || !videoRef.current) return;
      
      try {
        cleanup();
        setStatus("ACCESSING CAMERA...");
        
        // Anti-flake delay
        await new Promise(r => setTimeout(r, 300));
        if (isCancelled) return;

        let stream: MediaStream;
        
        try {
            // Try preferred settings first
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: CAMERA.width },
                height: { ideal: CAMERA.height },
                facingMode: "user"
              }
            });
        } catch (e) {
            // Fallback to any available video
            console.warn("Preferred camera settings failed, falling back to default.", e);
            stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
        }

        if (isCancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        currentStream = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Wait for video to be ready
          await new Promise<void>((resolve) => {
              const vid = videoRef.current;
              if (!vid || vid.readyState >= 1) return resolve();
              
              const handler = () => {
                  vid.removeEventListener('loadedmetadata', handler);
                  resolve();
              };
              vid.addEventListener('loadedmetadata', handler);
              setTimeout(() => {
                  vid.removeEventListener('loadedmetadata', handler);
                  resolve(); // timeout, try playing anyway
              }, 2000);
          });

          if (isCancelled) return;
          
          await videoRef.current.play();
          // If we got here, camera is likely working
          setStatus(""); 
        }
      } catch (err: any) {
        if (isCancelled) return;
        console.error("Camera error:", err);
        
        if (attempt <= 3) {
             const delay = attempt * 1000;
             setStatus(`CAMERA ERROR. RETRYING IN ${delay/1000}s...`);
             retryTimeout = setTimeout(() => setupCamera(attempt + 1), delay);
        } else {
             setStatus("CAMERA FAILED: " + (err.message || "Unknown Error"));
        }
      }
    };

    if (isCameraOn) {
      setupCamera();
    } else {
      cleanup();
    }

    return () => {
      isCancelled = true;
      clearTimeout(retryTimeout);
      cleanup();
    };
  }, [isCameraOn]);


  const drawHand = useCallback((ctx: CanvasRenderingContext2D, landmarks: HandLandmark[], width: number, height: number, isPinching: boolean, handedness: string, isGrabbing: boolean) => {
    const connections = handConnectionsRef.current;
    if (!connections) return;
    
    const boneColor = isGrabbing ? COLORS.accent : 'rgba(255, 255, 255, 0.2)';
    const jointColor = isGrabbing ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';

    // Connections
    ctx.beginPath();
    for (const connection of connections) {
      const startIdx = (connection as any).start ?? connection[0];
      const endIdx = (connection as any).end ?? connection[1];
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      if (!start || !end) continue;
      // Map normalized coordinates (0-1) to full canvas dimensions
      ctx.moveTo((1 - start.x) * width, start.y * height);
      ctx.lineTo((1 - end.x) * width, end.y * height);
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = boneColor;
    ctx.stroke();

    // Joints
    for (const lm of landmarks) {
      if (!lm) continue;
      const x = (1 - lm.x) * width;
      const y = lm.y * height;
      
      ctx.beginPath();
      ctx.arc(x, y, isGrabbing ? 4 : 2, 0, 2 * Math.PI);
      ctx.fillStyle = jointColor;
      ctx.fill();
    }

    // Label
    const wrist = landmarks[0];
    if (wrist) {
        const x = (1 - wrist.x) * width;
        const y = wrist.y * height + 20;
        
        ctx.fillStyle = isGrabbing ? COLORS.accent : 'rgba(255,255,255,0.5)';
        ctx.font = '10px "Space Grotesk"';
        ctx.textAlign = 'center';
        ctx.fillText(handedness.toUpperCase(), x, y);
    }
  }, []);

  // Main Loop
  useEffect(() => {
    let isMounted = true; 
    
    const startSystem = async () => {
      audioSystemRef.current = new AudioSystem();
      setStatus("STARTING PHYSICS ENGINE...");
      const physics = initPhysics();
      if (!physics) return;
      engineRef.current = physics.engine;
      runnerRef.current = physics.runner;

      if (!isMounted) return;
      const mpResult = await initMediaPipe();
      
      if (!isMounted) return;
      if (mpResult) {
          handLandmarkerRef.current = mpResult.landmarker;
          handConnectionsRef.current = mpResult.connections;
      }

      setIsLoading(false);
      
      const Matter = window.Matter;
      Matter.Runner.run(runnerRef.current, engineRef.current);
      
      // Delay first spawn to ensure canvas size is set
      setTimeout(() => {
        if(isMounted) {
            for(let i=0; i<3; i++) setTimeout(addObject, i * 500);
        }
      }, 500);

      const renderLoop = (time: number) => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const handLandmarker = handLandmarkerRef.current;
        const engine = engineRef.current;

        if (!canvas || !engine) {
            animationFrameRef.current = requestAnimationFrame(renderLoop);
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // --- Canvas Sizing to Window (Fix for Desktop) ---
        // Use client dimensions to fill the container/screen
        const displayWidth = canvas.clientWidth || window.innerWidth;
        const displayHeight = canvas.clientHeight || window.innerHeight;

        if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
          canvas.width = displayWidth;
          canvas.height = displayHeight;
          
          // Re-create walls to match new screen dimensions
          const bodies = Matter.Composite.allBodies(engine.world);
          const walls = bodies.filter((b: any) => b.isStatic);
          Matter.Composite.remove(engine.world, walls);
          
          const newWalls = [
            Matter.Bodies.rectangle(canvas.width / 2, canvas.height + 50, canvas.width, 100, { isStatic: true }), // Ground
            Matter.Bodies.rectangle(-50, canvas.height / 2, 100, canvas.height, { isStatic: true }), // Left
            Matter.Bodies.rectangle(canvas.width + 50, canvas.height / 2, 100, canvas.height, { isStatic: true }) // Right
          ];
          Matter.World.add(engine.world, newWalls);
        }

        // 1. Draw Background (Video)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (isCameraOn && video && video.readyState >= 2) {
            ctx.save();
            // Mirror logic
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            // Stretch video to fill entire canvas
            // This ensures hand tracking (0-1 coords) maps perfectly to the screen
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            
            // Dark Overlay
            ctx.fillStyle = 'rgba(5, 5, 5, 0.5)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // 2. Hand Detection
        let handResult: HandResult | null = null;
        try {
            // Strict check to ensure video is ready for MediaPipe
            if (handLandmarker && video && video.readyState >= 2 && isCameraOn) {
              handResult = handLandmarker.detectForVideo(video, time);
            }
        } catch (e) {
            // ignore
        }

        const presentHands = new Set<string>();
        gameState.current.hands.left = false;
        gameState.current.hands.right = false;

        if (handResult && handResult.landmarks.length > 0) {
          handResult.landmarks.forEach((landmarks, index) => {
            const handedness = handResult?.handedness?.[index]?.[0]?.categoryName || (index === 0 ? "Left" : "Right");
            presentHands.add(handedness);
            
            if (handedness === "Left") gameState.current.hands.left = true;
            if (handedness === "Right") gameState.current.hands.right = true;

            // Map 0-1 coordinates to canvas size
            const indexTip = { x: (1 - landmarks[8].x) * canvas.width, y: landmarks[8].y * canvas.height };
            const thumbTip = { x: (1 - landmarks[4].x) * canvas.width, y: landmarks[4].y * canvas.height };
            
            const dx = indexTip.x - thumbTip.x;
            const dy = indexTip.y - thumbTip.y;
            const distance = Math.sqrt(dx*dx + dy*dy);
            const pinchPoint = { x: (indexTip.x + thumbTip.x)/2, y: (indexTip.y + thumbTip.y)/2 };
            
            // Adjust threshold based on screen size (responsive)
            const threshold = Math.min(canvas.width, canvas.height) * HAND.pinchThreshold; 
            const isPinching = distance < threshold;
            const isGrabbing = handConstraintsRef.current.has(handedness);

            if (isPinching) {
              if (!activePinchMap.current.get(handedness)) {
                activePinchMap.current.set(handedness, true);
                if (audioSystemRef.current) audioSystemRef.current.playGrab();
                
                const bodies = Matter.Composite.allBodies(engine.world).filter((b:any) => !b.isStatic);
                const found = Matter.Query.point(bodies, pinchPoint);
                
                if (found.length > 0) {
                  const body = found[0];
                  const currentAngle = body.angle;
                  const offset = { x: pinchPoint.x - body.position.x, y: pinchPoint.y - body.position.y };
                  const cos = Math.cos(-currentAngle);
                  const sin = Math.sin(-currentAngle);
                  const localPointB = { x: offset.x * cos - offset.y * sin, y: offset.x * sin + offset.y * cos };

                  const constraint = Matter.Constraint.create({
                    pointA: pinchPoint,
                    bodyB: body,
                    pointB: localPointB,
                    stiffness: 0.2,
                    damping: 0.1,
                    render: { visible: false }
                  });
                  Matter.World.add(engine.world, constraint);
                  handConstraintsRef.current.set(handedness, constraint);
                }
              } else {
                const constraint = handConstraintsRef.current.get(handedness);
                if (constraint) {
                  constraint.pointA = pinchPoint;
                  Matter.Sleeping.set(constraint.bodyB, false);
                }
              }
            } else {
              if (activePinchMap.current.get(handedness)) {
                activePinchMap.current.set(handedness, false);
                if (audioSystemRef.current) audioSystemRef.current.playRelease();
                
                const constraint = handConstraintsRef.current.get(handedness);
                if (constraint) {
                  // CHECK THROW
                  const body = constraint.bodyB;
                  if (body) {
                      const speed = Math.sqrt(body.velocity.x**2 + body.velocity.y**2);
                      if (speed > 8) { // Throw threshold
                          throwGlowsRef.current.set(body.id, { 
                              time: time, 
                              color: body.render.fillStyle || COLORS.accent 
                          });
                      }
                  }
                  Matter.World.remove(engine.world, constraint);
                  handConstraintsRef.current.delete(handedness);
                }
              }
            }

            drawHand(ctx, landmarks, canvas.width, canvas.height, isPinching, handedness, isGrabbing);
            
            if (isPinching) {
                ctx.beginPath();
                ctx.arc(pinchPoint.x, pinchPoint.y, 15, 0, Math.PI*2);
                ctx.strokeStyle = isGrabbing ? COLORS.accent : 'rgba(255,255,255,0.3)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
          });
        }

        gameState.current.hands.leftGrabbing = handConstraintsRef.current.has("Left");
        gameState.current.hands.rightGrabbing = handConstraintsRef.current.has("Right");

        handConstraintsRef.current.forEach((constraint, handedness) => {
            if (!presentHands.has(handedness)) {
                Matter.World.remove(engine.world, constraint);
                handConstraintsRef.current.delete(handedness);
                activePinchMap.current.delete(handedness);
            }
        });

        // 3. Render Objects
        const bodies = Matter.Composite.allBodies(engine.world);
        bodies.forEach((body: any) => {
          if (body.isStatic) return;

          // Check if circle or polygon
          const isCircle = body.circleRadius && body.circleRadius > 0;

          // Trail
          const speed = body.speed;
          let trail = bodyTrailsRef.current.get(body.id);
          if (!trail) {
             trail = [];
             bodyTrailsRef.current.set(body.id, trail);
          }
          if (speed > TRAIL.minSpeed) {
              trail.push({ x: body.position.x, y: body.position.y });
              if (trail.length > TRAIL.length) trail.shift();
          } else {
              if (trail.length > 0) trail.shift();
          }

          if (trail.length > 1) {
              ctx.beginPath();
              ctx.moveTo(trail[0].x, trail[0].y);
              for (let i = 1; i < trail.length; i++) {
                  const xc = (trail[i].x + trail[i - 1].x) / 2;
                  const yc = (trail[i].y + trail[i - 1].y) / 2;
                  ctx.quadraticCurveTo(trail[i - 1].x, trail[i - 1].y, xc, yc);
              }
              ctx.lineTo(trail[trail.length-1].x, trail[trail.length-1].y);
              
              const baseColor = body.render.fillStyle;
              ctx.strokeStyle = baseColor;
              ctx.lineWidth = 4;
              ctx.globalAlpha = 0.5;
              ctx.stroke();
              ctx.globalAlpha = 1.0;
          }

          // THROW GLOW RENDER
          const throwData = throwGlowsRef.current.get(body.id);
          const vertices = body.vertices;
          if (vertices && vertices.length > 0) {
            
            // Draw Glow if active
            if (throwData) {
                const age = time - throwData.time;
                if (age > 2000) {
                    throwGlowsRef.current.delete(body.id);
                } else {
                    const life = 1 - (age / 2000); // 1.0 -> 0.0
                    const easeLife = Math.pow(life, 2); // Ease out
        
                    ctx.save();
                    ctx.shadowBlur = 30 * easeLife;
                    ctx.shadowColor = throwData.color;
                    ctx.globalAlpha = easeLife;
                    
                    ctx.lineWidth = 4 + (1-easeLife) * 10;
                    ctx.strokeStyle = throwData.color;
                    
                    ctx.beginPath();
                    if (isCircle) {
                        ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, 2 * Math.PI);
                    } else {
                        ctx.moveTo(vertices[0].x, vertices[0].y);
                        for (let j = 1; j < vertices.length; j++) {
                            ctx.lineTo(vertices[j].x, vertices[j].y);
                        }
                        ctx.lineTo(vertices[0].x, vertices[0].y);
                    }
                    ctx.stroke();
                    
                    ctx.restore();
                }
            }

            // Draw Body
            ctx.beginPath();
            if (isCircle) {
                ctx.arc(body.position.x, body.position.y, body.circleRadius, 0, 2 * Math.PI);
            } else {
                ctx.moveTo(vertices[0].x, vertices[0].y);
                for (let j = 1; j < vertices.length; j += 1) {
                    ctx.lineTo(vertices[j].x, vertices[j].y);
                }
                ctx.lineTo(vertices[0].x, vertices[0].y);
            }
            
            ctx.fillStyle = body.render.fillStyle;
            ctx.fill();
            
            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Orientation line for circles (to see rolling)
            if (isCircle) {
               ctx.beginPath();
               ctx.moveTo(body.position.x, body.position.y);
               ctx.lineTo(
                   body.position.x + Math.cos(body.angle) * body.circleRadius,
                   body.position.y + Math.sin(body.angle) * body.circleRadius
               );
               ctx.strokeStyle = 'rgba(0,0,0,0.2)';
               ctx.stroke();
            }
          }
        });

        // 4. Constraints (Neon effect)
        handConstraintsRef.current.forEach((c) => {
            if (c.pointA && c.bodyB) {
                const b = c.bodyB;
                const angle = b.angle;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const pb = c.pointB || {x: 0, y: 0};
                
                const anchorX = b.position.x + (pb.x * cos - pb.y * sin);
                const anchorY = b.position.y + (pb.x * sin + pb.y * cos);

                // Calculate intensity based on velocity (for throwing effect)
                const velocity = Math.sqrt(b.velocity.x ** 2 + b.velocity.y ** 2);
                const intensity = Math.min(velocity / 15, 1); 
                const pulse = (Math.sin(time * 0.01) + 1) / 2; 
                const dynamicWidth = 2 + (intensity * 4) + (pulse * 1);
                const alpha = 0.6 + (intensity * 0.4) + (pulse * 0.2);

                ctx.beginPath();
                ctx.moveTo(c.pointA.x, c.pointA.y);
                ctx.lineTo(anchorX, anchorY);
                ctx.lineWidth = dynamicWidth;
                ctx.strokeStyle = `rgba(204, 255, 0, ${alpha})`;
                ctx.lineCap = "round";
                ctx.shadowColor = COLORS.accent;
                ctx.shadowBlur = 10 + (intensity * 20); 
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(c.pointA.x, c.pointA.y);
                ctx.lineTo(anchorX, anchorY);
                ctx.lineWidth = 1;
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 + intensity * 0.2})`;
                ctx.shadowBlur = 0;
                ctx.stroke();
            }
        });

        if (time - gameState.current.lastTime > 200) {
            gameState.current.lastTime = time;
            gameState.current.fps = Math.round(1000 / (time - gameState.current.lastTime + 0.01));
            onStatsUpdate({
                fps: 60, 
                cubes: gameState.current.cubeCount,
                hands: gameState.current.hands
            });
        }
        animationFrameRef.current = requestAnimationFrame(renderLoop);
      };
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    startSystem();

    return () => {
      isMounted = false;
      cancelAnimationFrame(animationFrameRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
         (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
      if (engineRef.current) {
        window.Matter.World.clear(engineRef.current.world, false);
        window.Matter.Engine.clear(engineRef.current);
      }
      if (runnerRef.current) window.Matter.Runner.stop(runnerRef.current);
      if (handLandmarkerRef.current) handLandmarkerRef.current.close();
      if (audioSystemRef.current) audioSystemRef.current.setMuted(true);
    };
  }, [initPhysics, initMediaPipe, addObject, onStatsUpdate, drawHand, unlockAudio]);

  // Styles for control buttons
  const btnClass = "w-12 h-12 rounded-full glass-panel flex items-center justify-center text-white hover:bg-white/10 hover:border-white/40 transition-all duration-200 active:scale-95";
  const activeBtnClass = "w-12 h-12 rounded-full bg-[#ccff00] text-black border border-[#ccff00] flex items-center justify-center transition-all duration-200 shadow-[0_0_15px_rgba(204,255,0,0.5)]";

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-[#0a0a0a] overflow-hidden">
      <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted />
      {/* Remove object-cover to allow custom drawing in canvas */}
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Loading Screen */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50 backdrop-blur-md">
           <div className="relative mb-8">
              <div className="w-16 h-16 border-2 border-gray-800 rounded-full animate-spin"></div>
              <div className="absolute inset-0 border-t-2 border-[#ccff00] rounded-full animate-spin"></div>
           </div>
           <div className="text-[#ccff00] text-2xl font-bold tracking-[0.2em] font-display animate-pulse">
            SYSTEM BOOT
           </div>
           <div className="font-mono text-xs text-gray-500 mt-2 tracking-wider">{status}</div>
        </div>
      )}

      {/* Control Dock (Floating Bottom) */}
      {!isLoading && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
           <div className="glass-panel px-6 py-3 rounded-full flex items-center gap-4 shadow-2xl">
             
             {/* Camera Toggle */}
             <button onClick={toggleCamera} className={isCameraOn ? activeBtnClass : btnClass} title="Toggle Vision">
               {isCameraOn ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
               ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M21 21l-3.5-3.5m-2-2l-2-2m-2-2l-2-2m-2-2l-2-2m-2-2l-3.5-3.5"></path></svg>
               )}
             </button>

             {/* Audio Toggle */}
             <button onClick={toggleMute} className={!isMuted ? activeBtnClass : btnClass} title="Toggle Audio">
               {!isMuted ? (
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
               ) : (
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
               )}
             </button>
             
             <div className="w-px h-8 bg-white/20 mx-1"></div>

             {/* Spawn Object */}
             <button onClick={addObject} className={btnClass} title="Spawn Object">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
             </button>

             {/* Reset */}
             <button onClick={resetWorld} className={`${btnClass} text-red-400 hover:text-red-300 hover:border-red-500/50`} title="Reset Simulation">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
             </button>

           </div>
        </div>
      )}
    </div>
  );
};
