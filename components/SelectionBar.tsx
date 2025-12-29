import React, { useState, useEffect } from 'react';
import { ArrowRightIcon } from '@heroicons/react/24/solid'; // Import Heroicons
import { useActiveAccount } from 'thirdweb/react'; // Import thirdweb's active account hook
import dynamic from 'next/dynamic'
const Wallet = dynamic(() => import('./Connect'), { ssr: false })

// MONO_FONT_FAMILY should be defined, e.g., at the top or imported if global
const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

interface SelectionBarProps {
  onPanelChange: (panel: string | null) => void;
  currentPanel: string | null;
}

// Define default panel names, try to read from environment variables
const CHAT_PANEL_NAME = process.env.PANEL_NAME_CHAT || "CNVRS";
const LEARN_PANEL_NAME = process.env.PANEL_NAME_LEARN || "LRN";
const BUY_PANEL_NAME = process.env.PANEL_NAME_BUY || "RSRV";
const MYSPOT_PANEL_NAME = process.env.PANEL_NAME_MYSPOT || "DAO";

const panelsLeft = [CHAT_PANEL_NAME, LEARN_PANEL_NAME];
const panelsRight = [BUY_PANEL_NAME, MYSPOT_PANEL_NAME];
const navigationDots = [
  { name: 'Contact Us', href: 'https://discord.gg/q4tFymyAnx', color: 'bg-neutral-700' }, // Darker dot
  { name: 'Whitepaper', href: 'https://theutilitycompany.notion.site/Welcome-to-MKVLI-7b8033b9652544f4b361cb80230bd544', color: 'bg-neutral-600' }, // Darker dot
  { name: 'About Us', href: 'https://rensnce.com', color: 'bg-neutral-500' }, // Darker dot
  // { name: 'Loyalty Program', href: 'https://lab.alpineiq.com/wallet/3612', color: 'bg-neutral-400' }, // Darker dot
];

export default function SelectionBar({ onPanelChange, currentPanel }: SelectionBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [tapSoundEffect, setTapSoundEffect] = useState<HTMLAudioElement | null>(null);
  const activeAccount = useActiveAccount(); // Hook to check if wallet is connected

  useEffect(() => {
    const audio = new Audio('/static/sounds/tap.mp3');
    setTapSoundEffect(audio);
    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  const handleSelection = (panel: string) => {
    if (panel === currentPanel) {
      // If the same panel is clicked, hide it by setting currentPanel to null
      onPanelChange(null);
    } else {
      // Otherwise, show the clicked panel
      onPanelChange(panel);
    }
    setMenuOpen(false); // Close menu if it's open
  };

  const handleMedallionClick = () => {
    if (tapSoundEffect) {
      tapSoundEffect.play().catch(console.error);
    }
    setMenuOpen(!menuOpen);
  };

  return (
    <div className="relative w-full z-50 font-mono">
      <div
        className={`relative flex justify-center items-center px-6 w-full shadow-lg rounded-t-lg h-14 glass-card-light`}
        style={{
          boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.2)',
          borderTop: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        {activeAccount ? (
          <div className="flex justify-center items-center w-full h-full">
            {/* Left Panel Selection Buttons */}
            <div className="flex space-x-1 md:space-x-2">
              {panelsLeft.map((panel) => (
                <button
                  key={panel}
                  onClick={() => handleSelection(panel)}
                  className={`transition-all duration-300 font-mono py-0.5 px-1.5 md:px-2 rounded-md text-[10px] md:text-xs ${panel === currentPanel
                    ? 'text-white bg-emerald-700 shadow-md'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'
                    }`}
                  style={
                    panel === currentPanel
                      ? { transform: 'scale(1.05)' }
                      : {}
                  }
                >
                  {panel}
                </button>
              ))}
            </div>

            {/* Medallion Button */}
            <div className="relative flex-shrink-0 justify-center items-center mx-2 md:mx-3" style={{ zIndex: 30 }}>
              <button
                onClick={handleMedallionClick}
                className="relative p-0 hover:ring-2 md:hover:ring-4 hover:ring-emerald-500/70 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95"
                style={{ top: '-8px', zIndex: 30 }}
              >
                <img src="/Medallions/RENSNCESTNDGLSS.png" alt="Medallion" className="h-12 w-12 md:h-14 md:w-14 rounded-full" />
              </button>
            </div>

            {/* Right Panel Selection Buttons */}
            <div className="flex space-x-1 md:space-x-2">
              {panelsRight.map((panel) => (
                <button
                  key={panel}
                  onClick={() => handleSelection(panel)}
                  className={`transition-all duration-300 font-mono py-0.5 px-1.5 md:px-2 rounded-md text-[10px] md:text-xs ${panel === currentPanel
                    ? 'text-white bg-emerald-700 shadow-md'
                    : 'text-emerald-100 hover:text-white hover:bg-emerald-800/50'
                    }`}
                  style={
                    panel === currentPanel
                      ? { transform: 'scale(1.05)' }
                      : {}
                  }
                >
                  {panel}
                </button>
              ))}
            </div>
          </div>
        ) : (
          // Fallback for when wallet is not connected
          <div className="flex justify-center items-center w-full h-full">
            <div className="relative flex justify-center items-center" style={{ zIndex: 20, height: '48px' }}>
              {/* Text and Arrow to the UP and LEFT of the Medallion */}
              <div
                className="absolute flex items-center text-emerald-200 animate-side-bounce select-none pointer-events-none"
                style={{
                  right: 'calc(50% + 72px)', // (Half medallion width ~28px + ~7px gap)
                  top: '9px', // Position it higher, relative to the parent of the medallion button.
                  // Medallion button is top: -8px. So -18px should be 10px above medallion's top edge.
                  // transform: 'translateY(-50%)', // Removed for simpler top positioning
                  whiteSpace: 'nowrap',
                  zIndex: 31 // Above parent, potentially above medallion image if needed, but button is zIndex 30 for interaction
                }}
              >
                <span className="text-[9px] md:text-[10px] font-medium mr-1">Click Here to Begin</span>
                <ArrowRightIcon className="h-3 w-3 md:h-3.5 md:w-3.5" />
              </div>

              {/* Medallion Button remains centered */}
              <button
                onClick={handleMedallionClick}
                className="relative p-0 hover:ring-2 md:hover:ring-4 hover:ring-emerald-500/70 rounded-full transition-all duration-300 transform hover:scale-105 active:scale-95"
                style={{ top: '-8px', zIndex: 30 }}
              >
                <img src="/Medallions/RENSNCESTNDGLSS.png" alt="Medallion" className="h-12 w-12 md:h-14 md:w-14 rounded-full" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pop-up menu for navigation dots - Styling remains as per your preference (B&W, microtext, centered) */}
      {menuOpen && (
        <div
          className={`absolute left-1/2 transform -translate-x-1/2 bottom-20 z-10 transition-all duration-500 ease-in-out opacity-100 flex flex-col items-start space-y-2 p-3 rounded-lg shadow-xl ultra-glass`}
          style={{
            boxShadow: '0px 6px 15px rgba(0, 0, 0, 0.4)',
            minWidth: '180px',
          }}
        >
          <div className="flex flex-col items-start space-y-1 w-full">
            {navigationDots.map((dot, index) => (
              <a
                key={index}
                href={dot.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center space-x-2 group w-full p-1.5 hover:bg-neutral-700/60 rounded transition-colors duration-150"
                title={dot.name}
              >
                <div className={`h-5 w-5 rounded-full ${dot.color} transition-all group-hover:ring-1 group-hover:ring-neutral-300 flex-shrink-0`}></div>
                <span className="text-neutral-300 group-hover:text-white font-mono text-[10px] leading-tight truncate">{dot.name}</span>
              </a>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-neutral-700 w-full flex justify-center pb-1">
            <Wallet />
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes sideBounce {
          0%, 100% {
            transform: translateX(25px);
          }
          50% {
            transform: translateX(35px);
          }
        }
        .animate-side-bounce { /* If you have a "connect wallet" message that uses this */
          animation: sideBounce 1s infinite;
        }
      `}</style>
    </div>
  );
}
