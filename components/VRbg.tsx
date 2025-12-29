// @ts-nocheck
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import { ThirdwebProvider, useActiveAccount } from 'thirdweb/react';
import dynamic from 'next/dynamic';
const VRScene = dynamic(() => import('./VRScene'), { ssr: false });
import Chatbot from './Chatbot';
import FloatingDock from './FloatingDock';
import Form from './MintForm';
import LearnPanel from './Learn';
import SanctumPanel, { readCache } from "./Sanctum";
import DutchieEmbed from './DutchieEmbed';
import LiquidGlassBackground from './LiquidGlassBackground';
import { ShoppingBagIcon, XMarkIcon, SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline';

// Constants
const CHAT_PANEL_NAME = process.env.PANEL_NAME_CHAT || "CNVRS";
const LEARN_PANEL_NAME = process.env.PANEL_NAME_LEARN || "LRN";
const BUY_PANEL_NAME = process.env.PANEL_NAME_BUY || "RSRV";
const MYSPOT_PANEL_NAME = process.env.PANEL_NAME_MYSPOT || "DAO";
const DIAMOND_PANEL_NAME = "Diamond Viewer";
const CONFIG = {
  directoryFacetAddress: process.env.NEXT_PUBLIC_DIRECTORY_FACET_ADDRESS || "0x0000000000000000000000000000000000000000",
  p0: "0x0000000000000000000000000000000000000000"
};

const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

let slideSoundEffect: HTMLAudioElement | null = null;
let tapSoundEffect: HTMLAudioElement | null = null;
let backgroundMusic: HTMLAudioElement | null = null;

function VRBackground() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [vrSetupComplete, setVrSetupComplete] = useState(true); // Load immediately
  const [isVrSceneOnTop, setIsVrSceneOnTop] = useState(true);
  const [showWelcomeModal, setShowWelcomeModal] = useState(true); // Show welcome on load

  // VIEW STATE - replacing old separate panel booleans with a single source of truth
  const [currentView, setCurrentView] = useState<string>('');

  const activeAccount = useActiveAccount();
  const [hasDefaultPanelBeenSet, setHasDefaultPanelBeenSet] = useState(false);

  // Audio states.
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);

  // Chatbot state.
  const [messages, setMessages] = useState<{ sender: 'user' | 'assistant'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [optionsVisible, setOptionsVisible] = useState(true);

  // Modal and shop panel states.
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [showPortalChoiceModal, setShowPortalChoiceModal] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);
  const [ageVerified, setAgeVerified] = useState(false);

  // New state: vrEnabled controls whether VR effects are active.
  const [vrEnabled, setVrEnabled] = useState(true);
  const [testnetMode, setTestnetMode] = useState<boolean>(false);
  const [isClient, setIsClient] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [rememberPreferences, setRememberPreferences] = useState(false);
  const [showWalletGuide, setShowWalletGuide] = useState(true);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Sync state with localStorage (testnet and welcome modal preference)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const flag = localStorage.getItem('useTestnet') === 'true';
      setTestnetMode(flag);

      // Check if user previously chose to skip welcome modal
      const skipWelcome = localStorage.getItem('skipWelcomeModal') === 'true';
      if (skipWelcome) {
        setShowWelcomeModal(false);
      }

      // Sync Wallet Guide state
      const guideEnabled = localStorage.getItem('showWalletGuide_v3') !== 'false'; // Default to true if null
      setShowWalletGuide(guideEnabled);
    }
  }, []);

  const toggleWalletGuide = () => {
    const newState = !showWalletGuide;
    setShowWalletGuide(newState);
    localStorage.setItem('showWalletGuide_v3', String(newState));
    // Dispatch event for Connect.tsx to pick up
    window.dispatchEvent(new Event('wallet-guide-toggled'));
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  const initializeAudio = () => {
    if (!isAudioLoaded) {
      slideSoundEffect = new Audio('/static/sounds/slide.mp3');
      tapSoundEffect = new Audio('/static/sounds/tap.mp3');
      backgroundMusic = new Audio('/RENSNCE.mp3');
      backgroundMusic.loop = true;
      setIsAudioLoaded(true);
    }
  };

  useEffect(() => {
    const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobileDevice) {
      setTimeout(() => setIsVrSceneOnTop(false), 5000);
    } else {
      setIsVrSceneOnTop(false);
    }
  }, []);

  const handleVRLoad = () => {
    setIsLoaded(true);
  };

  const finishVRSetup = () => {
    setVrSetupComplete(true);
  };

  // Logic to preserve: Age verification check
  useEffect(() => {
    if (vrSetupComplete && !ageVerified) {
      // console.log("Age verification modal step reached, but modals are currently disabled in code.");
    }
  }, [vrSetupComplete, ageVerified]);

  // Logic to preserve: Default panel behavior on connect/disconnect
  // Note: No longer auto-defaulting to Diamond - user will choose from welcome modal
  useEffect(() => {
    if (!activeAccount && currentView !== '') {
      console.log("VRbg: Wallet disconnected, clearing currentView.");
      setCurrentView('');
    }
  }, [activeAccount, currentView]);

  const toggleMusic = () => {
    initializeAudio();
    if (isMusicPlaying) {
      backgroundMusic?.pause();
    } else {
      backgroundMusic?.play();
    }
    setIsMusicPlaying(!isMusicPlaying);
  };

  const handleViewChange = (view: string) => {
    console.log(`VRbg: Switching to view: ${view}`);
    slideSoundEffect?.play().catch(e => { }); // Play sound on switch
    setCurrentView(view);
  };

  const handleAgeYes = () => {
    tapSoundEffect?.play();
    setAgeVerified(true);
    setShowAgeModal(false);
  };

  const handleAgeNo = () => {
    tapSoundEffect?.play();
    window.location.href = 'https://www.thelochnessbotanicalsociety.com';
  };

  const handlePortalChoice = (choice: 'shop' | 'portal') => {
    tapSoundEffect?.play();
    setShowPortalChoiceModal(false);
    if (choice === 'shop') {
      setIsShopOpen(true);
    }
  };

  const toggleVREffect = () => {
    setVrEnabled((prev) => !prev);
  };

  const toggleTestnet = () => {
    const newVal = !testnetMode;
    setTestnetMode(newVal);

    if (typeof window !== 'undefined') {
      const overlay = document.createElement('div');
      overlay.id = 'network-switch-loader';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.75); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); opacity:0; transition:opacity .2s;
      `;
      overlay.innerHTML = `<div style="width:40px;height:40px;border:4px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => (overlay.style.opacity = '1'));

      setTimeout(() => {
        localStorage.setItem('useTestnet', newVal ? 'true' : 'false');
        window.location.reload();
      }, 200);
    }
  };

  // Render Content based on currentView
  const renderContent = () => {
    if (!activeAccount && !testnetMode) return null;

    switch (currentView) {
      case DIAMOND_PANEL_NAME:
        return (
          <div className="absolute inset-x-0 h-full flex justify-center z-10 animate-fade-in pointer-events-auto">
            <SanctumPanel
              directoryFacetAddress={CONFIG.directoryFacetAddress}
              p0={CONFIG.p0}
              cache={readCache()}
              vrEnabled={vrEnabled}
              toggleVR={toggleVREffect}
              isTestnet={testnetMode}
              toggleTestnet={toggleTestnet}
              viewMode="standalone"
            />
          </div>
        );
      case CHAT_PANEL_NAME:
        return (
          <div className="absolute inset-0 z-20 pointer-events-auto animate-slide-up flex flex-col pt-24 md:pt-16 pb-12 md:pb-32 px-2 md:px-12">
            {/* Full Page Container for CNVRS - High-end immersive AI interface */}
            <div className="w-full max-w-[1920px] mx-auto h-full flex flex-col">
              <Chatbot
                messages={messages}
                setMessages={setMessages}
                input={input}
                setInput={setInput}
                optionsVisible={optionsVisible}
                setOptionsVisible={setOptionsVisible}
              />
            </div>
          </div>
        );
      case BUY_PANEL_NAME:
        return (
          <div className="absolute inset-0 z-20 pointer-events-auto animate-slide-up flex flex-col pt-24 md:pt-16 pb-12 md:pb-32 px-2 md:px-12">
            {/* Full Page Container for RSRV Dashboard */}
            <div className="w-full max-w-[1920px] mx-auto h-full flex flex-col">
              <Form />
            </div>
          </div>
        );
      case LEARN_PANEL_NAME:
        return (
          <div className="absolute inset-0 z-20 pointer-events-auto animate-slide-up flex flex-col pt-24 md:pt-16 pb-12 md:pb-32 px-2 md:px-12">
            {/* Full Page Container for LRN - High-end immersive layout */}
            <div className="w-full max-w-[1920px] mx-auto h-full flex flex-col">
              <LearnPanel />
            </div>
          </div>
        );
      case MYSPOT_PANEL_NAME:
        return (
          <div className="absolute inset-0 z-20 pointer-events-auto animate-slide-up flex flex-col">
            {/* Full Page Container for Sanctum - Immersive DAO Interface */}
            <div className="w-full h-full flex flex-col">
              <SanctumPanel
                directoryFacetAddress={CONFIG.directoryFacetAddress}
                p0={CONFIG.p0}
                cache={readCache()}
                vrEnabled={vrEnabled}
                toggleVR={toggleVREffect}
                isTestnet={testnetMode}
                toggleTestnet={toggleTestnet}
              />
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <meta name="color-scheme" content="dark" />
      </Head>
      <div className="relative w-full h-screen flex flex-col justify-between overflow-hidden bg-black text-zinc-50 selection:bg-zinc-700 selection:text-white">

        {/* Global Styles for Animations & Scrollbars */}
        <style jsx global>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          .animate-fade-in { animation: fadeIn 0.8s ease-out forwards; }
          .animate-slide-up { animation: slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          
          /* Premium Scrollbar */
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 99px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3); }
          
          /* Glassmorphism Utility Classes - Optimized for Performance & Persistence */
          .glass-card {
            background: rgba(20, 20, 22, 0.65) !important;
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
            transform: translateZ(0);
          }
          
          .glass-card-light {
            background: rgba(30, 30, 35, 0.55) !important;
            backdrop-filter: blur(12px) saturate(160%);
            -webkit-backdrop-filter: blur(12px) saturate(160%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
            transform: translateZ(0);
          }
          
          .ultra-glass {
            background: rgba(10, 10, 12, 0.8) !important;
            backdrop-filter: blur(40px) saturate(220%);
            -webkit-backdrop-filter: blur(40px) saturate(220%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05);
            transform: translateZ(0);
          }
        `}</style>

        {/* HUD Styles */}
        <style jsx>{`
          .hud-button {
             padding: 0.75rem;
             border-radius: 9999px;
             background: rgba(0, 0, 0, 0.4);
             backdrop-filter: blur(12px);
             border: 1px solid rgba(255, 255, 255, 0.1);
             transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
             color: #a1a1aa;
             pointer-events: auto;
          }
          .hud-button:hover {
             background: rgba(255, 255, 255, 0.1);
             color: #ffffff;
             transform: translateY(-1px);
             box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          }
          .status-tag {
             display: flex;
             flex-direction: column;
             margin-right: 1.5rem;
          }
        `}</style>

        {/* Background Layer */}
        <div className={`fixed inset-0 h-full w-full transition-all duration-1000 ${isVrSceneOnTop ? 'z-10' : 'z-0'}`}>
          <VRScene onLoad={handleVRLoad} vrEnabled={vrEnabled} />
          {/* Overlay Gradient for better text legibility everywhere */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 pointer-events-none" />
        </div>

        {/* Stained Glass Background - DISABLED for now */}
        {/* {currentView !== DIAMOND_PANEL_NAME && currentView !== '' && (
          <div className="fixed inset-0 z-[5]">
            <LiquidGlassBackground />
          </div>
        )} */}

        {/* Welcome Modal - Shown on initial load */}
        {showWelcomeModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div style={{
              width: 420,
              maxWidth: '90vw',
              background: 'linear-gradient(180deg, rgba(24,24,27,0.98) 0%, rgba(9,9,11,0.98) 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              boxShadow: '0 25px 60px -12px rgba(0,0,0,0.9)',
              overflow: 'hidden'
            }}>
              {/* Header */}
              <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #27272a', textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#52525b', letterSpacing: '0.25em', marginBottom: 8 }}>RENAISSANCE RESERVE</div>
                <h2 style={{ fontFamily: 'system-ui', fontSize: 24, fontWeight: 600, color: '#fafafa', margin: 0, letterSpacing: '-0.02em' }}>Decentralized Banking</h2>
                <p style={{ fontFamily: 'system-ui', fontSize: 13, color: '#71717a', marginTop: 8, lineHeight: 1.5 }}>
                  Enterprise-grade DeFi interface for the Renaissance Protocol
                </p>
              </div>

              {/* Content */}
              <div style={{ padding: '20px 28px' }}>
                {/* VR Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(24,24,27,0.6)', borderRadius: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 14, color: '#fafafa', fontWeight: 500 }}>Immersive Mode</div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 11, color: '#71717a', marginTop: 4 }}>Enable 3D VR background effects</div>
                  </div>
                  <button
                    onClick={toggleVREffect}
                    style={{
                      width: 52, height: 28,
                      borderRadius: 14,
                      background: vrEnabled ? 'linear-gradient(135deg, #3f3f46, #52525b)' : '#27272a',
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      width: 22, height: 22,
                      borderRadius: '50%',
                      background: vrEnabled ? '#fafafa' : '#52525b',
                      top: 3,
                      left: vrEnabled ? 27 : 3,
                      transition: 'all 0.3s ease',
                      boxShadow: vrEnabled ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
                    }} />
                  </button>
                </div>

                {/* Network Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'rgba(24,24,27,0.6)', borderRadius: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 14, color: '#fafafa', fontWeight: 500 }}>Network</div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 11, color: '#71717a', marginTop: 4 }}>{testnetMode ? 'Base Sepolia (Testnet)' : 'Base (Mainnet)'}</div>
                  </div>
                  <button
                    onClick={toggleTestnet}
                    style={{
                      width: 52, height: 28,
                      borderRadius: 14,
                      background: testnetMode ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #3f3f46, #52525b)',
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      width: 22, height: 22,
                      borderRadius: '50%',
                      background: '#fafafa',
                      top: 3,
                      left: testnetMode ? 27 : 3,
                      transition: 'all 0.3s ease',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                    }} />
                  </button>
                </div>

                {/* Features */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
                  <div style={{ textAlign: 'center', padding: '12px 8px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, color: '#fafafa' }}>🔐</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#71717a', marginTop: 6, letterSpacing: '0.1em' }}>SECURE</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 8px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, color: '#fafafa' }}>💎</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#71717a', marginTop: 6, letterSpacing: '0.1em' }}>DIAMOND</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 8px' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, color: '#fafafa' }}>⚡</div>
                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#71717a', marginTop: 6, letterSpacing: '0.1em' }}>INSTANT</div>
                  </div>
                </div>

                {/* Remember Preferences Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(24,24,27,0.6)', borderRadius: 10, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 14, color: '#fafafa', fontWeight: 500 }}>Remember Preferences</div>
                    <div style={{ fontFamily: 'system-ui', fontSize: 11, color: '#71717a', marginTop: 4 }}>Skip this modal next time</div>
                  </div>
                  <button
                    onClick={() => setRememberPreferences(!rememberPreferences)}
                    style={{
                      width: 52, height: 28,
                      borderRadius: 14,
                      background: rememberPreferences ? 'linear-gradient(135deg, #3f3f46, #52525b)' : '#27272a',
                      border: 'none',
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <span style={{
                      position: 'absolute',
                      width: 22, height: 22,
                      borderRadius: '50%',
                      background: rememberPreferences ? '#fafafa' : '#52525b',
                      top: 3,
                      left: rememberPreferences ? 27 : 3,
                      transition: 'all 0.3s ease',
                      boxShadow: rememberPreferences ? '0 2px 8px rgba(0,0,0,0.3)' : 'none'
                    }} />
                  </button>
                </div>

                {/* Enter Button */}
                <button
                  onClick={() => {
                    if (rememberPreferences) {
                      localStorage.setItem('skipWelcomeModal', 'true');
                    }
                    setShowWelcomeModal(false);
                  }}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #27272a, #3f3f46)',
                    border: '1px solid #52525b',
                    color: '#fafafa',
                    fontFamily: 'monospace',
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: '0.15em',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #3f3f46, #52525b)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #27272a, #3f3f46)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  ENTER PROTOCOL
                </button>
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 28px 16px', borderTop: '1px solid #1a1a1a', textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#3f3f46', letterSpacing: '0.1em' }}>POWERED BY THE UTILITY NETWORK</div>
              </div>
            </div>
          </div>
        )}
        {/* TOP STATUS BAR - Consolidated HUD */}
        <div className="fixed top-0 left-0 w-full z-[2000] px-3 md:px-6 py-4 flex justify-between items-center pointer-events-none">
          {/* Left: System Status & Identity */}
          <div className="flex items-center space-x-3 md:space-x-4 pointer-events-auto">
            {/* RENSNCE Medallion */}
            <img src="/Medallions/RENSNCESTNDGLSS.png" alt="RENSNCE" className="h-8 w-8 md:h-10 md:w-10 object-contain" />
            <div className="flex flex-col">
              <span className="hidden md:block text-[10px] font-mono text-zinc-500 tracking-[0.3em] opacity-80 uppercase leading-none mb-1">SYS.ONLINE</span>
              <span className="text-sm md:text-md font-bold text-white tracking-[0.2em] font-mono uppercase leading-none">RENSNCE//PRTL</span>
            </div>

            <div className="hidden lg:flex flex-col border-l border-white/10 pl-6 h-8 justify-center">
              <span className="text-[10px] font-mono text-zinc-500 tracking-widest opacity-80 uppercase leading-none mb-1">ENV</span>
              <span className="text-[10px] font-mono text-emerald-500/80 tracking-widest uppercase leading-none font-bold">BASE_{testnetMode ? 'TESTNET' : 'MAINNET'}</span>
            </div>
          </div>

          {/* Right: Consolidated Controls */}
          <div className="flex items-center space-x-2 md:space-x-4 pointer-events-auto">
            {/* Audio Toggle */}
            {activeAccount && (
              <button onClick={toggleMusic} className="hud-button group">
                {isMusicPlaying ? (
                  <SpeakerWaveIcon className="h-4 w-4 text-white" />
                ) : (
                  <SpeakerXMarkIcon className="h-4 w-4 text-zinc-500 group-hover:text-zinc-300" />
                )}
              </button>
            )}

            {/* Settings Gear */}
            <div className="relative">
              <button
                onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                className="hud-button group"
              >
                <svg className="h-4 w-4 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
              </button>

              {/* Settings Dropdown Panel - Properly Positioned */}
              {showSettingsPanel && (
                <div
                  style={{
                    position: 'absolute',
                    top: 52,
                    right: 0,
                    width: 280,
                    background: 'rgba(9,9,11,0.95)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 12,
                    boxShadow: '0 20px 40px -12px rgba(0,0,0,0.8)',
                    overflow: 'hidden',
                    zIndex: 2001,
                    pointerEvents: 'auto'
                  }}
                >
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#52525b', letterSpacing: '0.15em' }}>SYSTEM SETTINGS</div>
                  </div>

                  {/* VR Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                    <div>
                      <div style={{ fontFamily: 'system-ui', fontSize: 13, color: '#fafafa' }}>Immersive Mode</div>
                      <div style={{ fontFamily: 'system-ui', fontSize: 10, color: '#52525b', marginTop: 2 }}>Enabled 3D effects</div>
                    </div>
                    <button
                      onClick={toggleVREffect}
                      style={{
                        width: 44, height: 24,
                        borderRadius: 12,
                        background: vrEnabled ? '#3f3f46' : '#18181b',
                        border: '1px solid rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                    >
                      <span style={{
                        position: 'absolute',
                        width: 18, height: 18,
                        borderRadius: '50%',
                        background: vrEnabled ? '#fafafa' : '#52525b',
                        top: 2,
                        left: vrEnabled ? 22 : 2,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }} />
                    </button>
                  </div>

                  {/* Network Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #1a1a1a' }}>
                    <div>
                      <div style={{ fontFamily: 'system-ui', fontSize: 13, color: '#fafafa' }}>Network Mode</div>
                      <div style={{ fontFamily: 'system-ui', fontSize: 10, color: '#52525b', marginTop: 2 }}>{testnetMode ? 'Base Sepolia' : 'Base Mainnet'}</div>
                    </div>
                    <button
                      onClick={toggleTestnet}
                      style={{
                        width: 44, height: 24,
                        borderRadius: 12,
                        background: testnetMode ? '#f59e0b' : '#3f3f46',
                        border: '1px solid rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                    >
                      <span style={{
                        position: 'absolute',
                        width: 18, height: 18,
                        borderRadius: '50%',
                        background: '#fafafa',
                        top: 2,
                        left: testnetMode ? 22 : 2,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }} />
                    </button>
                  </div>

                  {/* Wallet Guide Toggle */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #1a1a1a' }}>
                    <div>
                      <div style={{ fontFamily: 'system-ui', fontSize: 13, color: '#fafafa' }}>Wallet Guide</div>
                      <div style={{ fontFamily: 'system-ui', fontSize: 10, color: '#52525b', marginTop: 2 }}>{showWalletGuide ? 'Guide Enabled' : 'Guide Disabled'}</div>
                    </div>
                    <button
                      onClick={toggleWalletGuide}
                      style={{
                        width: 44, height: 24,
                        borderRadius: 12,
                        background: showWalletGuide ? '#059669' : '#3f3f46',
                        border: '1px solid rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        position: 'relative'
                      }}
                    >
                      <span style={{
                        position: 'absolute',
                        width: 18, height: 18,
                        borderRadius: '50%',
                        background: '#fafafa',
                        top: 2,
                        left: showWalletGuide ? 22 : 2,
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                      }} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Global UI Layer */}
        {vrSetupComplete && (
          <>
            {/* Dynamic Content Area */}
            <div className="flex-grow z-20 flex flex-col relative pointer-events-none">
              {renderContent()}
            </div>

            {/* Dock */}
            <FloatingDock currentView={currentView} onViewChange={handleViewChange} />
          </>
        )}

        {/* Shop Panel (Dutchie) */}
        <div
          className={`fixed top-0 left-0 h-full z-[60] transition-transform duration-700 cubic-bezier(0.16, 1, 0.3, 1) ${isShopOpen ? 'translate-x-0' : '-translate-x-full'
            } w-full`}
        >
          <div className="w-full h-full bg-black/95 backdrop-blur-2xl relative">
            <button
              onClick={() => setIsShopOpen(false)}
              className="absolute top-6 right-6 z-50 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <XMarkIcon className="w-8 h-8 text-zinc-400 hover:text-white" />
            </button>
            <DutchieEmbed />
          </div>
        </div>

        {/* Access Shop Button (if not open) */}
        {ageVerified && !isShopOpen && (
          <div className="fixed top-1/2 left-0 z-50 transform -translate-y-1/2 transition-transform duration-300 hover:translate-x-1">
            <button
              onClick={() => {
                tapSoundEffect?.play();
                setIsShopOpen(true);
              }}
              className="flex items-center gap-3 pl-4 pr-5 py-4 bg-black/40 backdrop-blur-xl border-y border-r border-white/10 rounded-r-2xl group shadow-[0_0_30px_rgba(0,0,0,0.5)] transition-all hover:bg-black/60"
            >
              <ShoppingBagIcon className="h-5 w-5 text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-[10px] font-sans tracking-[0.2em] font-medium text-zinc-400 group-hover:text-white hidden sm:block uppercase">Concierge</span>
            </button>
          </div>
        )}

        {/* Modals */}
        {showAgeModal && (
          <div className="modal-overlay">
            <div className="glass-modal">
              <div className="video-container"><video className="video-content" src="uma3.mp4" autoPlay loop muted playsInline></video></div>
              <h2 className="modal-title">VERIFY IDENTITY</h2>
              <div className="modal-button-group">
                <button onClick={handleAgeYes} className="modal-button modal-yes">CONFIRM 21+</button>
                <button onClick={handleAgeNo} className="modal-button modal-no">EXIT</button>
              </div>
            </div>
          </div>
        )}

        {showPortalChoiceModal && (
          <div className="modal-overlay">
            <div className="glass-modal">
              <div className="video-container"><video className="video-content" src="uma4.mp4" autoPlay loop muted playsInline></video></div>
              <h2 className="modal-title">SYSTEM INITIALIZED</h2>
              <div className="modal-button-group">
                <button onClick={() => handlePortalChoice('shop')} className="modal-button modal-shop">CONCIERGE</button>
                <button onClick={() => handlePortalChoice('portal')} className="modal-button modal-portal-choice">ENTER PORTAL</button>
                <button onClick={() => { tapSoundEffect?.play(); window.location.href = 'https://lab.alpineiq.com/wallet/3612'; }} className="modal-button modal-loyalty">LOYALTY</button>
              </div>
            </div>
          </div>
        )}

        <style jsx>{`
          .finish-vr-overlay {
            position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
            background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(20px);
          }
          .finish-setup-button {
            padding: 1rem 2.5rem;
            background: rgba(255, 255, 255, 0.05);
            color: #fff;
            font-size: 0.9rem;
            font-family: ${MONO_FONT_FAMILY};
            letter-spacing: 0.2em;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 99px;
            cursor: pointer;
            box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
            transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
          }
          .finish-setup-button:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.3);
            transform: scale(1.02);
            box-shadow: 0 0 50px rgba(255, 255, 255, 0.1);
          }
          .modal-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(24px); }
          .glass-modal { 
            background: rgba(20, 20, 20, 0.6);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px; padding: 2rem; width: 90%; max-width: 400px; text-align: center; 
            box-shadow: 0 40px 80px -20px rgba(0,0,0,0.8), inset 0 1px 1px rgba(255,255,255,0.05);
          }
          .video-container { width: 100%; height: 0; padding-bottom: 75%; position: relative; margin-bottom: 1.5rem; overflow: hidden; border-radius: 16px; border: 1px solid rgba(255,255,255,0.05); }
          .video-content { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
          .modal-title { font-size: 0.9rem; color: #e4e4e7; margin-bottom: 2rem; font-family: ${MONO_FONT_FAMILY}; letter-spacing: 0.15em; font-weight: 500; }
          .modal-button-group { display: flex; gap: 0.75rem; flex-direction: column; }
          .modal-button { 
            width: 100%; padding: 1rem; font-size: 0.85rem; border: none; border-radius: 12px; cursor: pointer; 
            font-family: sans-serif; font-weight: 600; letter-spacing: 0.05em;
            transition: all 0.2s ease;
          }
          .modal-button:hover { transform: translateY(-1px); }
          .modal-yes { background-color: #fff; color: #000; box-shadow: 0 4px 20px rgba(255,255,255,0.2); }
          .modal-yes:hover { background-color: #f4f4f5; }
          .modal-no { background-color: transparent; border: 1px solid rgba(255,255,255,0.1); color: #a1a1aa; }
          .modal-no:hover { border-color: rgba(255,255,255,0.3); color: #fff; }
          
          .modal-shop { background-color: #27272a; color: white; border: 1px solid rgba(255,255,255,0.1); }
          .modal-portal-choice { background-color: #fff; color: black; }
          .modal-loyalty { background-color: transparent; border: 1px solid rgba(255,255,255,0.1); color: #d4d4d8; }
          @keyframes spin {to{transform:rotate(360deg)}}
        `}</style>
      </div >
    </>
  );
}

export default function App() {
  return (
    <ThirdwebProvider>
      <VRBackground />
    </ThirdwebProvider>
  );
}
