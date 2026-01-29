export function createVisualizer(canvas) {
  const ctx = canvas.getContext("2d");

  // Detect mobile device for optimizations
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   (window.innerWidth <= 768);

  let audioSource = null;
  let running = false;
  let sensitivity = 7.2;
  let smoothing = 1.4; // 0 = no smoothing (snappy), 3 = max smoothing (very smooth)
  let idleSpeed = 5.0; // Multiplier for idle animation speed (0 = stopped, 5 = 5x speed)
  let radialScatterMultiplier = 1.0; // Multiplier for radial scatter (0 = no scatter, 2 = 2x scatter)
  let tangentialScatterMultiplier = 0.4; // Multiplier for tangential scatter (0 = no angle, 2 = 2x angle)

  // Smooth, persistent state for the scatter ring to avoid frame-to-frame jitter.
  // Reduce segments on mobile for better performance
  const segments = isMobile ? 100 : 140;
  const scatterState = {
    // Fewer segments = more spacing between lines/spokes.
    segments: segments,
    lineAmplitude: new Float32Array(segments),
    // Idle animation state for dots (per line, per dot)
    idleDotOffsets: new Float32Array(segments * 20), // lines * 20 dots
    idleAnimationTime: 0,
    // Smooth transition factor between idle and audio states (0 = fully idle, 1 = fully audio)
    audioPresence: 0,
    // Smoothed glow radius for organic motion
    smoothedGlowRadius: 0,
    // Track last frame time for delta-based animation
    lastFrameTime: performance.now(),
  };

  function setAudioSource(source) {
    audioSource = source;
  }

  function setSensitivity(value) {
    sensitivity = value;
  }

  function setSmoothing(value) {
    smoothing = value;
  }

  function setIdleSpeed(value) {
    idleSpeed = value;
  }

  function setRadialScatter(value) {
    radialScatterMultiplier = value;
  }

  function setTangentialScatter(value) {
    tangentialScatterMultiplier = value;
  }

  function start() {
    running = true;
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    window.removeEventListener("resize", resizeCanvas);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function loop() {
    if (!running) return;
    drawFrame();
    requestAnimationFrame(loop);
  }

  function drawFrame() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Clear the entire canvas (coordinates are in CSS pixels after transform)
    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    // Visualizer diameter: larger on mobile for better visibility
    const longestEdge = Math.max(width, height);
    const visualizerDiameter = isMobile ? longestEdge * 0.4 : longestEdge * 0.25;
    const baseRadius = visualizerDiameter * 0.35;

    const features = audioSource ? audioSource.getFeatures() : null;
    const loudness = features?.loudness || 0;

    // Update idle animation time using delta time for consistent speed across frame rates
    const now = performance.now();
    const deltaTime = (now - scatterState.lastFrameTime) / 1000; // Convert to seconds
    scatterState.lastFrameTime = now;
    // Scale animation speed - faster on mobile for more fluid feel
    const animationSpeed = isMobile ? 1.5 : 1.0;
    scatterState.idleAnimationTime += deltaTime * animationSpeed;

    // Initialize smoothed glow radius on first frame
    if (scatterState.smoothedGlowRadius === 0) {
      scatterState.smoothedGlowRadius = baseRadius;
    }
    
    // Ambient glow
    drawGlow(cx, cy, baseRadius, loudness);

    drawScatterRing(cx, cy, baseRadius * 1.25, features);
  }

  function drawGlow(cx, cy, radius, loudness) {
    const maxGlow = radius * 1.3;
    
    // Calculate target glow radius based on audio
    const targetGlowRadius = radius + loudness * sensitivity * maxGlow;
    
    // Smooth the glow radius with organic easing (slower response for more organic feel)
    // Use a slower easing factor to make it feel more natural and less jittery
    const glowEase = 0.06; // Slower easing for more organic motion
    scatterState.smoothedGlowRadius = lerp(scatterState.smoothedGlowRadius, targetGlowRadius, glowEase);
    
    const glowRadius = scatterState.smoothedGlowRadius;

    // Smoother falloff: start from a much smaller inner radius (closer to center)
    // This creates a more gradual transition and eliminates the noticeable circle
    const innerRadius = radius * 0.1; // Much smaller inner radius for smoother falloff
    const gradient = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, glowRadius);
    
    // White gradient with smooth falloff using multiple color stops
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
    gradient.addColorStop(0.2, "rgba(255, 255, 255, 0.12)");
    gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.08)");
    gradient.addColorStop(0.6, "rgba(255, 255, 255, 0.04)");
    gradient.addColorStop(0.8, "rgba(255, 255, 255, 0.02)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawScatterRing(cx, cy, radius, features) {
    const time = features?.time;
    const loudness = features?.loudness || 0;

    const { segments, lineAmplitude } = scatterState;
    const maxAmplitude = radius * 0.45;
    const timeLength = time ? time.length : 0;

    // Detect if there's meaningful audio input (threshold for "quiet" state)
    // Lower threshold on mobile for better sensitivity
    const audioThreshold = isMobile ? 0.01 : 0.02;
    const timeVariationThreshold = isMobile ? 0.03 : 0.05;
    const hasAudioRaw = loudness > audioThreshold || (time && timeLength > 0 && 
      Array.from(time).some(s => Math.abs(s / 255 - 0.5) > timeVariationThreshold));
    
    // Smoothly transition audio presence factor (organic transition, not instant)
    // Use different speeds for entering vs exiting audio state for more natural feel
    // Faster transitions on mobile for more responsive feel
    const enterSpeed = isMobile ? 0.15 : 0.08; // Faster when audio starts
    const exitSpeed = isMobile ? 0.08 : 0.04; // Slower when audio stops (lingers a bit)
    const targetPresence = hasAudioRaw ? 1.0 : 0.0;
    const transitionSpeed = targetPresence > scatterState.audioPresence ? enterSpeed : exitSpeed;
    scatterState.audioPresence = lerp(scatterState.audioPresence, targetPresence, transitionSpeed);
    
    // Use smooth presence factor instead of binary hasAudio
    const audioPresence = scatterState.audioPresence;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";

    // Temporal smoothing: ease current amplitudes toward target amplitudes.
    // Smoothing slider: 0 = snappy (0.3), 1 = very smooth (0.05), 3 = extremely smooth (0.01)
    // Normalize smoothing value to 0-1 range for lerp
    // Less smoothing on mobile for snappier response
    const mobileSmoothingReduction = isMobile ? 0.7 : 1.0;
    const normalizedSmoothing = clamp(smoothing / 3, 0, 1) * mobileSmoothingReduction;
    const baseEase = lerp(0.3, 0.01, normalizedSmoothing);
    const ease = clamp(baseEase + loudness * 0.15, 0.03, 0.35);

    // Draw separated radial line segments ("spokes") instead of a connected ring.
    const innerRadius = radius * 0.78;
    // Base length is longer, with randomized per-line variation (only when audio detected)
    const segmentBaseLength = radius * 0.55;

    // Lines are now invisible - only dots are drawn
    // ctx.lineCap = "round";
    // ctx.lineWidth = 0.75;
    // ctx.strokeStyle = "rgba(167, 203, 255, 0.22)";

    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2;

      let sample = 0.5;
      if (time && timeLength > 0) {
        const idx = Math.floor(t * timeLength) % timeLength;
        sample = time[idx] / 255;
      }

      const mapped = (sample - 0.5) * 2;
      // Smoothly transition target amplitude based on audio presence
      // Boost sensitivity on mobile for better response
      const mobileSensitivityBoost = isMobile ? 1.3 : 1.0;
      const target = mapped * sensitivity * maxAmplitude * audioPresence * mobileSensitivityBoost;
      lineAmplitude[i] = lerp(lineAmplitude[i], target, ease);

      // Smoothly blend between uniform and varied line lengths
      const uniformVariation = 1.0;
      const variedVariation = hash01(i * 47.13) * 0.4 + 0.8;
      const lineLengthVariation = lerp(uniformVariation, variedVariation, audioPresence);
      
      // Smoothly blend noise texture
      const tex = texturedNoise(angle, loudness) * audioPresence;
      
      // Smoothly blend amplitude-based growth
      const amplitudeGrowth = Math.abs(lineAmplitude[i]) * 0.62 * audioPresence;
      const length = segmentBaseLength * lineLengthVariation + amplitudeGrowth + tex * 0.45;

      // Smoothly blend noise offset from inner radius
      const r0 = innerRadius + tex * 0.25 * audioPresence;
      const r1 = r0 + length;

      const x0 = Math.cos(angle) * r0;
      const y0 = Math.sin(angle) * r0;
      const x1 = Math.cos(angle) * r1;
      const y1 = Math.sin(angle) * r1;

      // Lines are invisible - commented out
      // ctx.beginPath();
      // ctx.moveTo(x0, y0);
      // ctx.lineTo(x1, y1);
      // ctx.stroke();

      // Dots along each line that "scatter" with the line, but remain smooth/deterministic.
      const dotCount = 20; // 20 dots per line
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const tx = -ny;
      const ty = nx;

      // Scatter magnitude grows with signal, but is capped to keep it elegant.
      // Radial scatter: dots move up/down the fixed axis based on audio
      // Tangential scatter: dots angle away from axis when audio is detected
      // Smoothly blend scatter amounts based on audio presence
      // Increase scatter on mobile for better visibility
      const mobileScatterBoost = isMobile ? 1.4 : 1.0;
      const amp01 = clamp(Math.abs(lineAmplitude[i]) / (maxAmplitude || 1), 0, 1);
      const radialScatterBase = clamp(1.5 + amp01 * 8 + loudness * 12, 1.5, 15) * mobileScatterBoost;
      const tangentialScatterBase = clamp(2.0 + amp01 * 10 + loudness * 16, 2, 18) * mobileScatterBoost;
      const radialScatterAmount = radialScatterBase * audioPresence * radialScatterMultiplier;
      const tangentialScatterAmount = tangentialScatterBase * audioPresence * tangentialScatterMultiplier;

      for (let d = 0; d < dotCount; d++) {
        // Stable "random" per-line/per-dot.
        const seed = hash01(i * 97.31 + d * 31.77);
        const seed2 = hash01(i * 11.13 + d * 73.91);
        const dotIndex = i * dotCount + d;

        // Base placement along the segment.
        // Smoothly blend spacing and wobble based on audio presence
        const spacingRangeQuiet = 0.92;
        const spacingRangeAudio = 0.74;
        const spacingStartQuiet = 0.04;
        const spacingStartAudio = 0.18;
        const spacingRange = lerp(spacingRangeQuiet, spacingRangeAudio, audioPresence);
        const spacingStart = lerp(spacingStartQuiet, spacingStartAudio, audioPresence);
        const uBase = spacingStart + spacingRange * (d / Math.max(1, dotCount - 1));
        const uWobble = (seed - 0.5) * 0.08 * audioPresence;
        const u = clamp(uBase + uWobble, 0.01, 0.99);

        // Idle animation: slow random movement up/down the radial axis
        // Always calculate idle animation, but blend it with audio-driven movement
        // Faster base speeds on mobile for more fluid animation
        const phase = hash01(i * 137.5 + d * 23.7) * Math.PI * 2;
        const baseSpeedRange = isMobile ? [0.5, 1.0] : [0.3, 0.7]; // Faster on mobile
        const baseSpeed = baseSpeedRange[0] + hash01(i * 67.3 + d * 41.9) * (baseSpeedRange[1] - baseSpeedRange[0]);
        const speed = baseSpeed * idleSpeed; // Apply idle speed multiplier
        const amplitude = 2.5 + hash01(i * 89.1 + d * 19.3) * 3.5; // 2.5 to 6.0 pixel variation
        const idleRadialOffset = Math.sin(scatterState.idleAnimationTime * speed + phase) * amplitude;

        // Scatter around the line: smoothly blend idle animation with audio-driven movement
        // When quiet: dots slowly animate up/down the radial axis (idle animation)
        // When audio detected: dots move up/down the radial axis AND start to angle away (tangential scatter)
        const audioRadialScatter = (seed2 - 0.5) * radialScatterAmount * 0.55;
        const radialScatter = lerp(idleRadialOffset, audioRadialScatter, audioPresence);
        const tangentialScatter = (seed - 0.5) * tangentialScatterAmount; // Only angle when audio detected

        const px = lerp(x0, x1, u) + nx * radialScatter + tx * tangentialScatter;
        const py = lerp(y0, y1, u) + ny * radialScatter + ty * tangentialScatter;

        // Smoothly blend dot size between idle and audio states
        // Larger dots on mobile for better visibility
        const mobileSizeBoost = isMobile ? 1.3 : 1.0;
        const baseSizeIdle = 1.2 * mobileSizeBoost;
        const baseSizeAudio = 0.8 * mobileSizeBoost;
        const baseSize = lerp(baseSizeIdle, baseSizeAudio, audioPresence);
        const sizeVariation = (amp01 * 2.2 + loudness * 1.8) * audioPresence * mobileSizeBoost;
        const size = baseSize + sizeVariation;

        const grad = ctx.createRadialGradient(px, py, 0, px, py, size * 2.8);
        grad.addColorStop(0, "rgba(255, 255, 255, 0.78)");
        grad.addColorStop(0.35, "rgba(184, 214, 255, 0.55)");
        grad.addColorStop(1, "rgba(77, 123, 255, 0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }


    ctx.restore();
  }

  return {
    start,
    stop,
    setAudioSource,
    setSensitivity,
    setSmoothing,
    setIdleSpeed,
    setRadialScatter,
    setTangentialScatter,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function texturedNoise(angle, loudness) {
  // Deterministic "organic" wobble based on angle (and a little on loudness),
  // stable across frames to avoid jitter.
  const wobble = Math.sin(angle * 7.0) * 0.9 + Math.sin(angle * 13.0 + 0.7) * 0.55;
  return wobble * (1.5 + loudness * 6);
}

function hash01(x) {
  // Deterministic pseudo-random [0,1) from a number input (no state, no jitter).
  const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
