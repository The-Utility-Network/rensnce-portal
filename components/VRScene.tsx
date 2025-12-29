'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Head from 'next/head';
import { Entity, Scene } from 'aframe-react';

// Define MONO_FONT_FAMILY for use in styled-jsx
const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

// Define your image playlist here
const IMAGE_PLAYLIST = [
  '/1.jpg', // Your existing image
  // '/2.jpg',
  // '/3.jpg',
  // '/4.jpg',
  // '/5.jpg',
  // Add more image paths from your /public directory
  // e.g., '/images/vr-skybox-2.png',
  //       '/textures/another-scene.jpg' 
];
const TOTAL_MUSIC_DURATION_MS = 378000; // 6 minutes 18 seconds
const FADE_ANIMATION_DURATION_MS = 1500; // Total time for fade out + fade in

interface InteractionStateSystem {
  userInteracting: boolean;
  lastInteractionTime: number;
}

interface VRSceneProps {
  onLoad: () => void;
  vrEnabled: boolean;
}

const CustomVRButton: React.FC = () => {
  const handleEnterVR = () => {
    const sceneEl = document.querySelector('a-scene');
    if (sceneEl && sceneEl.enterVR) {
      sceneEl.enterVR();
    }
  };

  return (
    <button onClick={handleEnterVR} className="custom-vr-button">
      Enter VR
    </button>
  );
};

const VRScene: React.FC<VRSceneProps> = ({ onLoad: parentOnLoad, vrEnabled }) => {
  const [isAframeLoaded, setIsAframeLoaded] = useState(false);
  // Countdown state removed
  const onLoadCalledRef = useRef(false);
  const isMountedRef = useRef(true);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [sphereSrc, setSphereSrc] = useState(IMAGE_PLAYLIST[0]);
  const [sphereOpacity, setSphereOpacity] = useState(1);
  const [transitionPhase, setTransitionPhase] = useState<'visible' | 'fadingOut' | 'fadingIn'>('visible');

  const imageDisplayDurationMs = useMemo(() => {
    const numImages = IMAGE_PLAYLIST.length;
    if (numImages <= 0) return 5000; // Default if no images or for single image after fade
    // Time each image is fully visible = (Total time / num images) - total fade duration for one cycle
    const interval = (TOTAL_MUSIC_DURATION_MS / numImages) - FADE_ANIMATION_DURATION_MS;
    return Math.max(interval, FADE_ANIMATION_DURATION_MS); // Ensure display time is at least as long as fade
  }, [IMAGE_PLAYLIST.length]);

  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sphereElRef = useRef<any>(null); // Ref for the single sphere

  const handleLoadingComplete = useCallback(() => {
    if (!onLoadCalledRef.current) {
      onLoadCalledRef.current = true;
      // setShowCountdown(false); // Removed
      if (parentOnLoad) {
        parentOnLoad();
      }
    }
  }, [parentOnLoad]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const loadAframe = async () => {
      try {
        const globalAFRAME = (window as any).AFRAME;
        const aframeModule = globalAFRAME ? null : await import('aframe');
        const AFRAME = (globalAFRAME || aframeModule?.default) as any;

        if (AFRAME) {
          if (AFRAME.options && typeof AFRAME.options === 'object') {
            AFRAME.options.disableWebVRPolyfill = true;
          } else {
            AFRAME.options = { disableWebVRPolyfill: true };
          }

          if (!AFRAME.systems['interactionState']) {
            AFRAME.registerSystem('interactionState', {
              init: function () { this.userInteracting = false; this.lastInteractionTime = Date.now(); },
              userInteracting: false,
              lastInteractionTime: 0,
            });
          }
          if (!AFRAME.components['detect-camera-movement']) {
            AFRAME.registerComponent('detect-camera-movement', {
              init: function () { (this as any).startTime = Date.now(); (this as any).initialRotationY = this.el.object3D.rotation.y; (this as any).detected = false; },
              tick: function () { const self = this as any; const elapsed = Date.now() - self.startTime; if (!self.detected && elapsed > 5000) { const currentRotationY = this.el.object3D.rotation.y; const diff = Math.abs(currentRotationY - self.initialRotationY); if (diff > 0.001) { self.detected = true; handleLoadingComplete(); } } }
            });
          }
          if (!AFRAME.components['auto-rotate']) {
            AFRAME.registerComponent('auto-rotate', {
              init: function () { this.el.object3D.rotation.y = 0; },
              tick: function () {
                const sceneEl = this.el.sceneEl;
                if (sceneEl && sceneEl.systems.interactionState) {
                  const interactionState = sceneEl.systems.interactionState as InteractionStateSystem;
                  if (interactionState && vrEnabled) {
                    const timeSinceLastInteraction = Date.now() - interactionState.lastInteractionTime;
                    if (!interactionState.userInteracting || timeSinceLastInteraction > 30000) { this.el.object3D.rotation.y -= 0.001; }
                  }
                }
              },
            });
          }
          if (!AFRAME.components['detect-user-interaction']) {
            AFRAME.registerComponent('detect-user-interaction', {
              init: function () { this.fn = this.onUserInteraction.bind(this); this.el.sceneEl?.addEventListener('mousedown', this.fn); this.el.sceneEl?.addEventListener('touchstart', this.fn); this.el.sceneEl?.addEventListener('camera-set-active', (e: any) => { if (e?.detail?.cameraEl) e.detail.cameraEl.addEventListener('trackpaddown', this.fn); }); },
              onUserInteraction: function () { const s = this.el.sceneEl; if (s && s.systems.interactionState) { const iS = s.systems.interactionState as InteractionStateSystem; if (iS) { iS.userInteracting = true; iS.lastInteractionTime = Date.now(); setTimeout(() => { if (isMountedRef.current && iS) iS.userInteracting = false; }, 30000); } } }
            });
          }
          if (isMountedRef.current) setIsAframeLoaded(true);
        } else {
          console.error("A-Frame failed to load or is not available on window.");
        }
      } catch (error) { console.error('Error loading A-Frame or registering components:', error); }
    };
    if (typeof window !== 'undefined') loadAframe();
  }, [vrEnabled, handleLoadingComplete]);

  useEffect(() => {
    // Legacy countdown effect removed. 
    // Ensuring handleLoadingComplete is called when necessary logic dictates (e.g. valid interaction or camera check).
  }, []);

  // Effect to schedule and execute transitions
  useEffect(() => {
    if (!isAframeLoaded || !vrEnabled || IMAGE_PLAYLIST.length <= 1) return;

    let animationStartTime: number;

    const animate = () => {
      if (!isMountedRef.current) return;
      const elapsedTime = Date.now() - animationStartTime;
      const halfFade = FADE_ANIMATION_DURATION_MS / 2;
      let progress = Math.min(elapsedTime / halfFade, 1);

      if (transitionPhase === 'fadingOut') {
        setSphereOpacity(1 - progress);
        if (progress >= 1) {
          const nextIndex = (currentImageIndex + 1) % IMAGE_PLAYLIST.length;
          console.log(`[FadingOut Complete] Next image index: ${nextIndex}`);
          if (isMountedRef.current) {
            setCurrentImageIndex(nextIndex);
            setSphereSrc(IMAGE_PLAYLIST[nextIndex]);
            setTransitionPhase('fadingIn');
          }
        }
      } else if (transitionPhase === 'fadingIn') {
        setSphereOpacity(progress);
        if (progress >= 1) {
          console.log(`[FadingIn Complete] Image ${currentImageIndex} fully visible.`);
          if (isMountedRef.current) setTransitionPhase('visible');
        }
      }

      if (progress < 1 && (transitionPhase === 'fadingOut' || transitionPhase === 'fadingIn')) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    if (transitionPhase === 'fadingOut' || transitionPhase === 'fadingIn') {
      animationStartTime = Date.now();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); // Clear previous frame
      animationFrameRef.current = requestAnimationFrame(animate);
    } else if (transitionPhase === 'visible') {
      // Current image is visible, schedule the next fade out
      console.log(`[Scheduler] Image ${currentImageIndex} visible. Scheduling fadeOut in ${imageDisplayDurationMs}ms`);
      transitionTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          console.log(`[Scheduler Timeout] Time to start fadingOut image ${currentImageIndex}`);
          setTransitionPhase('fadingOut');
        }
      }, imageDisplayDurationMs);
    }

    return () => {
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isAframeLoaded, vrEnabled, currentImageIndex, transitionPhase, imageDisplayDurationMs, IMAGE_PLAYLIST.length]);

  if (!isAframeLoaded) {
    return (
      <div className="loading-modal">
        {/* <p>Loading VR Environment...</p> */}
      </div>
    );
  }

  return (
    <>
      <Head>
        {/* Force light mode for system UI so that A-Frame's permission modal uses light colors */}
        <meta name="color-scheme" content="light" />
      </Head>
      <Scene
        embedded
        detect-user-interaction
        vr-mode-ui="enabled: false"
        device-orientation-permission-ui="allowButtonText: 'Enable Motion'; denyButtonText: 'No Thanks'; cancelButtonText: 'Cancel'; deviceMotionMessage: 'Please allow access to device motion for a full VR experience.'; httpsMessage: 'This experience requires HTTPS for full functionality.'"
        background="color: #1a1a1a" // Darker background if images don't cover fully
        style={{ width: '100%', height: '100vh' }}
      >
        <Entity
          key={sphereSrc} // Force re-mount on src change for reliable texture update
          ref={sphereElRef}
          primitive="a-sphere"
          src={sphereSrc}
          radius="1000" segments-width="64" segments-height="64" position="0 0 0" scale="-1 1 1"
          material={{ shader: 'flat', src: `url(${sphereSrc})`, side: 'double', opacity: sphereOpacity, transparent: true }}
          {...(vrEnabled ? { "auto-rotate": "" } : {})}
        />
        <Entity primitive="a-camera" position="0 0 0" detect-camera-movement="" look-controls={vrEnabled ? "enabled: true; touchEnabled: true" : "enabled: false"} wasd-controls-enabled="false" />
      </Scene>
      <CustomVRButton />
      {/* Countdown overlay removed */}
      <style jsx>{`
        .custom-vr-button {
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 0.75rem 1.5rem;
          background-color: #333333;
          color: #FFFFFF;
          border: 1px solid #555555;
          border-radius: 4px;
          cursor: pointer;
          z-index: 9999;
          font-family: ${MONO_FONT_FAMILY};
          font-size: 0.8rem;
        }
        .custom-vr-button:hover {
          background-color: #444444;
        }
        .loading-modal {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #1a1a1a;
          color: #FFFFFF;
          font-family: ${MONO_FONT_FAMILY};
          font-size: 1rem;
          z-index: 9999;
        }
        .countdown-overlay {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: linear-gradient(45deg, #222222, #383838);
          padding: 1rem 1.5rem;
          border-radius: 8px;
          text-align: center;
          z-index: 10000;
          font-family: ${MONO_FONT_FAMILY};
          color: #E0E0E0;
          border: 1px solid #555555;
          box-shadow: 0 0 15px rgba(0,0,0,0.5);
        }
        .countdown-text {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
        }
        .skip-button {
          padding: 0.4rem 0.8rem;
          border: 1px solid #666666;
          background-color: #333333;
          color: #DDDDDD;
          border-radius: 4px;
          cursor: pointer;
          font-family: ${MONO_FONT_FAMILY};
          font-size: 0.75rem;
          transition: background-color 0.2s, color 0.2s;
        }
        .skip-button:hover {
          background-color: #444444;
          color: #FFFFFF;
        }
        .a-dialog-allow-button, .a-dialog-deny-button, .a-dialog-ok-button {
          background-color: #555555 !important;
          color: #FFFFFF !important;
          border: 1px solid #777777 !important;
          font-family: ${MONO_FONT_FAMILY} !important;
          font-size: 0.8rem !important;
          padding: 8px 12px !important;
          margin: 5px !important;
          text-transform: uppercase !important;
          letter-spacing: 0.05em !important;
        }
        .a-dialog-allow-button:hover, .a-dialog-deny-button:hover, .a-dialog-ok-button:hover {
          background-color: #666666 !important;
        }
        .a-dialog {
          background-color: rgba(30, 30, 30, 0.95) !important;
          border: 1px solid #666666 !important;
          display: block !important;
          min-width: 280px;
          min-height: 50px;
          height: auto !important;
          padding: 15px !important;
          border-radius: 6px !important;
          box-shadow: 0 2px 15px rgba(0,0,0,0.4);
        }
        .a-dialog-content,
        .a-dialog-message {
          color: #E0E0E0 !important;
          font-family: ${MONO_FONT_FAMILY} !important;
          font-size: 0.85rem !important;
          display: block !important;
          line-height: 1.5 !important;
          padding: 8px !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
      `}</style>
    </>
  );
};

export default VRScene;
