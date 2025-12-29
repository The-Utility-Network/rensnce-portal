'use client';

import React, { useState, useEffect } from 'react';
import { useActiveAccount } from 'thirdweb/react';
import dynamic from 'next/dynamic'
const Wallet = dynamic(() => import('./Connect'), { ssr: false })
import {
    ChatBubbleBottomCenterTextIcon,
    AcademicCapIcon,
    BanknotesIcon,
    UserGroupIcon,
    CubeTransparentIcon
} from '@heroicons/react/24/outline';

interface FloatingDockProps {
    currentView: string;
    onViewChange: (view: string) => void;
}

const DOCK_ITEMS = [
    { id: 'Diamond Viewer', display: 'ANLYZ', label: 'ANALYZE' },
    { id: 'CNVRS', display: 'CNVRS', label: 'COMMUNICATE' },
    { id: 'LRN', display: 'LRN', label: 'INTELLIGENCE' },
    { id: 'RSRV', display: 'RSRV', label: 'ACQUIRE' },
    { id: 'DAO', display: 'DAO', label: 'GOVERN' },
];

export default function FloatingDock({ currentView, onViewChange }: FloatingDockProps) {
    const activeAccount = useActiveAccount();
    const [hoveredItem, setHoveredItem] = useState<string | null>(null);

    if (!activeAccount) {
        return (
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50">
                <div className="glass-capsule px-6 py-3 flex items-center justify-center space-x-4 animate-float">
                    <span className="text-zinc-400 font-sans text-xs tracking-widest font-medium">AUTHENTICATION REQUIRED</span>
                    <div className="h-4 w-px bg-zinc-700/50"></div>
                    <Wallet />
                </div>
                <style jsx>{`
                    .glass-capsule {
                        background: rgba(10, 10, 10, 0.75);
                        backdrop-filter: blur(24px);
                        -webkit-backdrop-filter: blur(24px);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-radius: 9999px;
                        box-shadow: 0 4px 40px rgba(0, 0, 0, 0.6), 
                                    inset 0 1px 1px rgba(255, 255, 255, 0.05);
                    }
                    @keyframes float {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-3px); }
                    }
                    .animate-float { animation: float 6s ease-in-out infinite; }
                 `}</style>
            </div>
        );
    }

    return (
        <div className="fixed bottom-0 md:bottom-8 left-0 md:left-1/2 md:transform md:-translate-x-1/2 w-full md:w-auto z-50 flex flex-col items-center pointer-events-none">
            {/* Nav Menu */}
            <div className="glass-dock flex items-center justify-between md:justify-start px-2 md:px-6 py-2 md:py-3 gap-1 md:gap-2 w-full md:w-auto transition-all duration-500 ease-out hover:shadow-[0_20px_60px_-10px_rgba(255,255,255,0.1)] rounded-none md:rounded-full border-t border-white/10 md:border pointer-events-auto overflow-x-auto md:overflow-visible no-scrollbar">

                {/* Medallion Section - Links to Homepage */}
                <div className="relative mr-1 md:mr-2 flex-shrink-0">
                    <a
                        href="https://www.rensnce.com"
                        className="pr-2 md:pr-4 border-r border-white/10 flex items-center transition-opacity hover:opacity-80 outline-none"
                    >
                        <img
                            src="/Medallions/RENSNCESTNDGLSS.png"
                            alt="RENSNCE Medallion"
                            className="w-10 h-10 object-contain drop-shadow-[0_0_12px_rgba(255,255,255,0.2)] animate-pulse-slow"
                            style={{ width: '40px', height: '40px' }}
                        />
                    </a>
                </div>

                {DOCK_ITEMS.map((item) => {
                    const isActive = currentView === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onViewChange(isActive ? '' : item.id)}
                            onMouseEnter={() => setHoveredItem(item.id)}
                            onMouseLeave={() => setHoveredItem(null)}
                            className={`
                                relative group flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl
                                transition-all duration-300 ease-out
                                focus:outline-none flex-1 md:flex-none
                                ${isActive ? 'bg-white/10 border border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.15)]' : 'hover:bg-white/5 border border-transparent'}
                            `}
                        >
                            {/* Floating Label Tooltip */}
                            {hoveredItem === item.id && (
                                <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/90 border border-white/10 rounded text-[9px] font-mono text-white whitespace-nowrap z-50 shadow-lg">
                                    {item.label}
                                </div>
                            )}

                            {/* Text Label */}
                            <span
                                className={`
                                    font-mono text-[8px] md:text-[9px] font-bold tracking-[0.2em] transition-all duration-300
                                    ${isActive ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-200'}
                                `}
                            >
                                {item.display}
                            </span>

                            {/* Subtle Active Indicator */}
                            {isActive && (
                                <div className="absolute -bottom-1 w-1/2 h-[2px] bg-white shadow-[0_0_10px_white]" />
                            )}
                        </button>
                    );
                })}

                {/* Separator - Hidden on mobile */}
                <div className="hidden md:block w-px h-6 bg-zinc-800 mx-2" />

                {/* Wallet */}
                <Wallet className="flex-none scale-90 md:scale-100 pr-4 md:pr-0" tooltipDirection="bottom" />
            </div>

            <style jsx>{`
                .glass-dock {
                    background: rgba(10, 10, 10, 0.9);
                    backdrop-filter: blur(40px);
                    -webkit-backdrop-filter: blur(40px);
                }
                @media (min-width: 768px) {
                    .glass-dock {
                        background: rgba(10, 10, 10, 0.75);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.9),
                                    inset 0 1px 1px rgba(255, 255, 255, 0.05);
                    }
                }
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
                @keyframes pulse-slow {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.05); opacity: 0.8; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 5s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
