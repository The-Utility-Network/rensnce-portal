'use client';


import {
  ConnectButton,
  darkTheme,
} from 'thirdweb/react';
import { inAppWallet, createWallet } from 'thirdweb/wallets';
import { base } from 'thirdweb/chains';
import { createThirdwebClient } from 'thirdweb';
import { useState, useEffect, useRef } from 'react';
import { Cog6ToothIcon, XMarkIcon } from '@heroicons/react/24/outline';

// Suppress React hydration warnings for Thirdweb's internal nested button issue
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('cannot be a descendant of') ||
        args[0].includes('Hydration failed') ||
        args[0].includes('hydration error'))
    ) {
      return; // Suppress these specific warnings
    }
    originalError.apply(console, args);
  };
}

// Create client once - matched TUC Home pattern
const client = createThirdwebClient({
  clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT as string,
});

const wallets = [
  inAppWallet({
    smartAccount: {
      chain: base,
      sponsorGas: true,
    },
    auth: {
      options: [
        "google", "discord", "telegram", "farcaster", "email", "x",
        "passkey", "phone", "github", "twitch", "steam", "line",
        "facebook", "apple", "coinbase",
      ],
    },
  }),
  createWallet("io.rabby"),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("me.rainbow"),
  createWallet("io.zerion.wallet"),
];

// Define MONO_FONT_FAMILY if not globally available
const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

interface WalletProps {
  className?: string;
  tooltipDirection?: 'top' | 'bottom';
}

export default function Wallet({ className, tooltipDirection = 'bottom' }: WalletProps) {
  const [mounted, setMounted] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setMounted(true);

    const checkGuideStatus = () => {
      const savedShowGuide = localStorage.getItem('showWalletGuide_v3');
      // Default to true if null (first visit)
      setShowGuide(savedShowGuide !== 'false');
    };

    checkGuideStatus();

    // Listen for toggle events from settings panel
    window.addEventListener('wallet-guide-toggled', checkGuideStatus);

    return () => {
      window.removeEventListener('wallet-guide-toggled', checkGuideStatus);
    };
  }, []);

  const closeGuide = () => {
    setShowGuide(false);
    localStorage.setItem('showWalletGuide_v3', 'false');
  };

  if (!mounted) return null;

  return (
    <div
      suppressHydrationWarning
      className={`relative inline-flex items-center justify-center lg:justify-end gap-2 pointer-events-auto ${className || ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <ConnectButton
        client={client}
        wallets={wallets}
        chain={base}
        detailsButton={{
          displayBalanceToken: {
            [base.id]: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // token address to display balance for
          },
        }}
        accountAbstraction={{
          chain: base,
          sponsorGas: true,
          // @ts-ignore
          mode: "EIP7702",
        }}
        theme={darkTheme({
          colors: {
            modalBg: 'rgba(248, 248, 248, 0.66)',      // Very light grey/off-white, semi-transparent
            borderColor: 'rgba(200, 200, 200, 0.5)',   // Light grey border
            separatorLine: 'rgba(200, 200, 200, 0.4)',

            primaryText: '#212529',          // Dark grey / near black for main text
            secondaryText: '#495057',        // Medium dark grey for secondary text
            accentText: '#007bff',            // Example accent (blue), can be changed
            secondaryIconColor: '#495057',

            primaryButtonBg: 'rgba(222, 226, 230, 0.7)',
            primaryButtonText: '#212529',
            secondaryButtonBg: 'rgba(233, 236, 239, 0.6)',
            secondaryButtonText: '#343a40',
            accentButtonBg: 'rgba(0, 123, 255, 0.6)',
            accentButtonText: '#ffffff',

            connectedButtonBg: 'rgba(229, 231, 235, 0.4)',
            connectedButtonBgHover: 'rgba(209, 213, 219, 0.8)',

            selectedTextColor: '#007bff',
          },
          fontFamily: MONO_FONT_FAMILY,
        })}
        connectButton={{
          label: "ENTER PORTAL",
          style: {
            fontFamily: MONO_FONT_FAMILY,
            fontSize: '0.65rem',
            padding: '5px 8px',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            backgroundColor: 'rgba(67, 65, 65, 0.5)', // Whiter, more transparent glass for the button itself
            border: '1px solid rgba(255, 255, 255, 0.5)',
            color: 'rgba(255, 255, 255, 0.5)', // Darker text for readability
            backdropFilter: 'blur(5px)',
            WebkitBackdropFilter: 'blur(5px)',
            boxShadow: '0 1px 5px rgba(0,0,0,0.1)', // Softer shadow for light glass
          }
        }}
        connectModal={{
          size: 'wide',
          title: "RENSNCE DAO",
          titleIcon: '/Medallions/RENSNCESTNDGLSS.png', // Ensure this icon has good contrast on light bg
          showThirdwebBranding: false,
          welcomeScreen: () => (
            <div style={{
              fontFamily: MONO_FONT_FAMILY,
              textAlign: 'center',
              padding: '20px 10px',
              height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center'
            }}>
              <img src={'/Medallions/RENSNCESTNDGLSS.png'} width={200} height={200} alt="RENSNCE DAO" style={{ margin: '0 auto 10px', borderRadius: '50%' }} />
              <h2 style={{ fontSize: '0.9rem', color: '#212529', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}> {/* Darker text */}
                Welcome to RENSNCE
              </h2>
              <p style={{ fontSize: '0.7rem', color: '#495057', letterSpacing: '0.03em', lineHeight: '1.4' }}> {/* Darker text */}
                CONNECT WALLET TO ENTER THE PORTAL.
              </p>
            </div>
          ),
        }}
      />
      {/* Tooltip for switching wallets - Managed by React State */}
      {showGuide && (
        <div
          className={`absolute ${tooltipDirection === 'top' ? 'top-full mt-2' : 'bottom-full mb-2'} right-0 w-64 p-4 z-[9999] transition-all duration-300 transform ${isHovered ? `opacity-100 ${tooltipDirection === 'top' ? 'translate-y-0' : 'translate-y-0'} visible` : `opacity-0 ${tooltipDirection === 'top' ? 'translate-y-2' : '-translate-y-2'} invisible`
            }`}
          style={{ pointerEvents: isHovered ? 'auto' : 'none' }}
        >
          <div className="relative bg-black/80 backdrop-blur-md border border-white/20 rounded-lg shadow-xl p-3 overflow-hidden">
            <button
              onClick={closeGuide}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-white rounded-full bg-black/20 hover:bg-black/50 transition-colors z-10"
              aria-label="Close Guide"
            >
              <XMarkIcon className="w-3 h-3" />
            </button>
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
            <h4 className="text-white text-xs font-bold mb-2 uppercase tracking-wider text-center" style={{ fontFamily: MONO_FONT_FAMILY }}>Prefer your EOA?</h4>
            <div className="relative w-full h-32 rounded-md overflow-hidden mb-2 border border-white/10">
              {/* Using the generated image */}
              <img src="/wallet-switch-guide.png" alt="Switch Wallet Guide" className="object-cover w-full h-full" />
            </div>
            <ol className="text-[0.6rem] text-gray-300 space-y-1 list-decimal pl-4" style={{ fontFamily: MONO_FONT_FAMILY }}>
              <li>Click your wallet profile.</li>
              <li>Select your main wallet.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}