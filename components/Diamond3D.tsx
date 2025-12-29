'use client'

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
    Html,
    OrbitControls,
    PerspectiveCamera,
    Environment,
    Float,
    Sparkles,
    Text
} from '@react-three/drei';
import { useActiveWallet } from 'thirdweb/react';
import * as THREE from 'three';
import { readContract, getContract, createThirdwebClient, prepareContractCall, sendAndConfirmTransaction } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { diamondAddress } from './core/Diamond';

type Facet = { facetAddress: string; selectors: string[] };
type MethodNames = { [facetAddress: string]: { readMethods: string[]; writeMethods: string[] } };
type FacetNames = { [facetAddress: string]: string };
type FacetAbis = { [facetAddress: string]: any[] };

type Props = {
    facets: Facet[];
    methodNames: MethodNames;
    facetNames: FacetNames;
    facetAbis?: FacetAbis;
    isMobile?: boolean;
    currentIndex?: number;
    onSelect?: (sel: { facet: string; method: string; type: 'read' | 'write'; color: string }) => void;
};

// Fortune 500 Monochrome Palette
const PORTAL_COLORS = {
    ringBase: '#71717a',   // Zinc-500
    ringFocus: '#fafafa',  // Zinc-50
    nodeRead: '#09090b',   // Zinc-950 (Black)
    nodeWrite: '#18181b',  // Zinc-900 (Black)
    hudBg: 'rgba(9, 9, 11, 0.9)', // Zinc-950
    hudBorder: '#3f3f46',  // Zinc-700
    text: '#fafafa'        // Zinc-50
};

function mixColor(hex: string, ratioToWhite: number) {
    const c = new THREE.Color(hex);
    const white = new THREE.Color('#ffffff');
    return c.clone().lerp(white, ratioToWhite).getStyle();
}

function darken(hex: string, factor: number) {
    const c = new THREE.Color(hex);
    c.multiplyScalar(1 - factor);
    return c.getStyle();
}

function colorWithAlpha(color: string, alpha: number) {
    const c = new THREE.Color(color);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);
    return `rgba(${r},${g},${b},${alpha})`;
}

// Medallion Palette for Shadows
const SHADOW_PALETTE = [
    '#0099BF', // Cyan
    '#1A40A6', // Blue
    '#FFA326', // Amber
    '#D94026', // Red
    '#73198C'  // Purple
];

function Node({ position, color, onClick, size = 0.08, shadowColor = "black" }: { position: [number, number, number]; color: string; onClick: () => void; size?: number, shadowColor?: string }) {
    const ref = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (ref.current) {
            ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.08);
        }
    })
    return (
        <group>
            {/* Glow Halo */}
            <mesh position={position} scale={[1.4, 1.4, 1.4]}>
                <sphereGeometry args={[size, 16, 16]} />
                <meshBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
            {/* Core Node */}
            <mesh ref={ref} position={position} onClick={onClick} castShadow receiveShadow>
                <sphereGeometry args={[size, 32, 32]} />
                <meshStandardMaterial
                    color={color}
                    emissive={new THREE.Color(color)}
                    emissiveIntensity={4.0} // Ultra glow
                    toneMapped={false}
                    metalness={0.6}
                    roughness={0.2}
                />
            </mesh>
            {/* Border Halo (Perspective Correct) */}
            <mesh position={position} scale={[1.2, 1.2, 1.2]}>
                <sphereGeometry args={[size, 32, 32]} />
                <meshBasicMaterial
                    color={shadowColor}
                    transparent
                    opacity={0.9}
                    side={THREE.BackSide}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}

function Rings({
    rings,
    onSelect,
    focusedIndex,
    yOffset,
    nodeSize,
}: {
    rings: Array<{
        z: number;
        radius: number;
        baseColor: string;
        label: string;
        reads: Array<{ method: string; position: [number, number, number] }>;
        writes: Array<{ method: string; position: [number, number, number] }>;
        facetAddress: string;
    }>;
    onSelect: (sel: { facet: string; method: string; type: 'read' | 'write'; color: string }) => void;
    focusedIndex: number;
    yOffset: number;
    nodeSize: number;
}) {
    return (
        <group>
            {rings.map((ring, idx) => (
                <group key={`${ring.facetAddress}-${ring.z}`} position={[0, yOffset, ring.z]}>
                    <mesh rotation={[0, 0, 0]}>
                        <torusGeometry args={[ring.radius, 0.005, 32, 100]} />
                        <meshBasicMaterial color={ring.baseColor} opacity={idx === focusedIndex ? 0.8 : 0.1} transparent />
                    </mesh>

                    {idx === focusedIndex && (
                        <mesh rotation={[0, 0, 0]}>
                            <torusGeometry args={[ring.radius, 0.02, 16, 100]} />
                            <meshBasicMaterial color={ring.baseColor} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
                        </mesh>
                    )}

                    {/* Ring Nodes */}
                    {ring.reads.map((r, i) => (
                        <Node
                            key={`r-${ring.facetAddress}-${r.method}-${i}`}
                            position={r.position}
                            color={mixColor(PORTAL_COLORS.nodeRead, idx === focusedIndex ? 0.3 : 0.6)}
                            onClick={() => onSelect({ facet: ring.facetAddress, method: r.method, type: 'read', color: PORTAL_COLORS.nodeRead })}
                            size={nodeSize}
                            shadowColor={SHADOW_PALETTE[idx % SHADOW_PALETTE.length]}
                        />
                    ))}
                    {ring.writes.map((w, i) => (
                        <Node
                            key={`w-${ring.facetAddress}-${w.method}-${i}`}
                            position={w.position}
                            color={darken(PORTAL_COLORS.nodeWrite, idx === focusedIndex ? 0.0 : 0.2)}
                            onClick={() => onSelect({ facet: ring.facetAddress, method: w.method, type: 'write', color: PORTAL_COLORS.nodeWrite })}
                            size={nodeSize}
                            shadowColor={SHADOW_PALETTE[idx % SHADOW_PALETTE.length]}
                        />
                    ))}
                </group>
            ))}
        </group>
    );
}

function Spine({ length }: { length: number }) {
    return (
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -3.6, -length / 2]}>
            <cylinderGeometry args={[0.01, 0.01, length, 12]} />
            <meshBasicMaterial color={PORTAL_COLORS.ringBase} opacity={0.15} transparent />
        </mesh>
    );
}

function parseParams(raw: string) {
    if (!raw.trim()) return [] as any[];
    return raw.split(',').map((p) => {
        const v = p.trim();
        if (/^\d+$/.test(v)) return BigInt(v);
        if (/^\d+\.\d+$/.test(v)) return Number(v);
        if (v.toLowerCase() === 'true') return true;
        if (v.toLowerCase() === 'false') return false;
        return v;
    });
}

function safeStringify(value: any): string {
    const seen = new WeakSet();
    return JSON.stringify(
        value,
        (key, val) => {
            if (typeof val === 'bigint') return val.toString();
            if (typeof val === 'object' && val !== null) {
                if (seen.has(val)) return '[Circular]';
                seen.add(val);
            }
            return val;
        },
        2
    );
}

function formatAsPretty(value: any): string {
    try {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
            if (looksJson) return safeStringify(JSON.parse(value));
            return value;
        }
        if (typeof value === 'object' && value !== null) return safeStringify(value);
        return String(value);
    } catch {
        try { return safeStringify(value); } catch { return String(value); }
    }
}

// Solidity syntax highlighting with premium colors
function highlightSolidity(code: string): React.ReactNode[] {
    const lines = code.split('\n');

    const highlight = (line: string, lineIdx: number): React.ReactNode => {
        // Simple tokenization - order matters!
        const patterns: Array<{ regex: RegExp; color: string; name: string }> = [
            // Multi-line comments (simplified - single line portion)
            { regex: /\/\*[\s\S]*?\*\//g, color: '#6b7280', name: 'block-comment' },
            // Single line comments
            { regex: /\/\/.*/g, color: '#6b7280', name: 'comment' },
            // Strings
            { regex: /"[^"]*"|'[^']*'/g, color: '#22c55e', name: 'string' },
            // Keywords (control flow, visibility, etc.)
            { regex: /\b(pragma|solidity|import|contract|interface|library|struct|enum|event|modifier|function|constructor|fallback|receive|if|else|for|while|do|break|continue|return|try|catch|revert|require|assert|emit|new|delete|this|super|is|using|override|virtual|abstract|external|internal|private|public|pure|view|payable|memory|storage|calldata|constant|immutable|indexed|anonymous)\b/g, color: '#c084fc', name: 'keyword' },
            // Types
            { regex: /\b(address|bool|string|bytes|bytes\d+|int\d*|uint\d*|fixed|ufixed|mapping)\b/g, color: '#60a5fa', name: 'type' },
            // Built-ins
            { regex: /\b(msg|block|tx|abi|type|keccak256|sha256|sha3|ripemd160|ecrecover|addmod|mulmod|selfdestruct|blockhash|gasleft)\b/g, color: '#f472b6', name: 'builtin' },
            // Numbers (including hex)
            { regex: /\b(0x[a-fA-F0-9]+|\d+(\.\d+)?)\b/g, color: '#fb923c', name: 'number' },
            // Function calls (word followed by parenthesis)
            { regex: /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g, color: '#fbbf24', name: 'function' },
        ];

        // Split line into tokens while preserving non-matching parts
        let tokens: Array<{ text: string; color?: string }> = [{ text: line }];

        for (const { regex, color } of patterns) {
            const newTokens: typeof tokens = [];
            for (const token of tokens) {
                if (token.color) {
                    // Already colored, don't re-process
                    newTokens.push(token);
                    continue;
                }

                let lastIndex = 0;
                const text = token.text;
                let match;
                regex.lastIndex = 0;

                while ((match = regex.exec(text)) !== null) {
                    // Add text before match
                    if (match.index > lastIndex) {
                        newTokens.push({ text: text.slice(lastIndex, match.index) });
                    }
                    // Add colored match
                    newTokens.push({ text: match[0], color });
                    lastIndex = match.index + match[0].length;
                }

                // Add remaining text
                if (lastIndex < text.length) {
                    newTokens.push({ text: text.slice(lastIndex) });
                }
            }
            tokens = newTokens;
        }

        return (
            <span key={lineIdx}>
                {tokens.map((t, i) =>
                    t.color ? <span key={i} style={{ color: t.color }}>{t.text}</span> : t.text
                )}
            </span>
        );
    };

    return lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', minHeight: '1.7em' }}>
            <span style={{ width: 50, flexShrink: 0, color: '#3f3f46', textAlign: 'right', paddingRight: 16, userSelect: 'none', borderRight: '1px solid #27272a', marginRight: 16 }}>
                {i + 1}
            </span>
            <span style={{ flex: 1 }}>{highlight(line, i)}</span>
        </div>
    ));
}

export default function Diamond3D({ facets, methodNames, facetNames, facetAbis = {}, isMobile = false }: Props) {
    const [isMounted, setIsMounted] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [sourceCode, setSourceCode] = useState('');
    const [sourceLoading, setSourceLoading] = useState(false);

    // Function execution state
    const [selection, setSelection] = useState<{ facet: string; method: string; type: 'read' | 'write'; color: string } | null>(null);
    const [params, setParams] = useState('');
    const [output, setOutput] = useState('');
    const [busy, setBusy] = useState(false);
    const [formInputs, setFormInputs] = useState<Array<{ name: string; type: string; value: string }>>([]);
    const [abiResolved, setAbiResolved] = useState(false);
    const [walletAccount, setWalletAccount] = useState<any>(null);

    // Get wallet account
    const activeWallet = useActiveWallet();
    useEffect(() => { setWalletAccount(activeWallet?.getAccount() || null); }, [activeWallet]);


    useEffect(() => { setIsMounted(true); }, []);

    // Navigation handlers
    useEffect(() => {
        const onPrev = () => setCurrentIndex((i) => Math.max(0, i - 1));
        const onNext = () => setCurrentIndex((i) => Math.min(facets.length - 1, i + 1));
        window.addEventListener('nav-prev', onPrev);
        window.addEventListener('nav-next', onNext);
        return () => { window.removeEventListener('nav-prev', onPrev); window.removeEventListener('nav-next', onNext); };
    }, [facets.length]);

    const currentFacet = facets[currentIndex];
    const currentLabel = currentFacet ? (facetNames[currentFacet.facetAddress] || currentFacet.facetAddress?.slice(0, 10)) : 'LOADING...';
    const currentAddress = currentFacet?.facetAddress || '';

    const handleViewSource = async () => {
        setShowSourceModal(true);
        setSourceLoading(true);
        try {
            if (currentAddress) {
                const useTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';
                const networkParam = useTestnet ? '' : '&network=mainnet';
                const res = await fetch(`/api/basescan?module=contract&action=getsourcecode&address=${currentAddress}${networkParam}`);
                const data = await res.json();
                if (data.status === '1' && data.result?.[0]?.SourceCode) {
                    const rawSource = data.result[0].SourceCode;
                    const contractName = data.result[0].ContractName || '';

                    // Parse source code - Etherscan returns different formats:
                    // 1. Plain Solidity code
                    // 2. JSON with multiple files (starts with {{ or {)
                    let mainCode = '';

                    try {
                        // Check if it's a JSON format (multi-file)
                        if (rawSource.startsWith('{{') || rawSource.startsWith('{')) {
                            // Remove extra braces if wrapped in {{...}}
                            const jsonStr = rawSource.startsWith('{{')
                                ? rawSource.slice(1, -1)
                                : rawSource;
                            const parsed = JSON.parse(jsonStr);

                            // Look for sources object
                            if (parsed.sources) {
                                // Find the main contract file (matches contract name)
                                const files = Object.keys(parsed.sources);
                                const mainFile = files.find(f =>
                                    f.toLowerCase().includes(contractName.toLowerCase()) ||
                                    f.endsWith(`${contractName}.sol`)
                                ) || files.find(f => !f.includes('@') && !f.includes('node_modules'));

                                if (mainFile && parsed.sources[mainFile]?.content) {
                                    mainCode = parsed.sources[mainFile].content;
                                } else {
                                    // Fallback to first non-dependency file
                                    const nonDep = files.find(f => !f.startsWith('@'));
                                    if (nonDep && parsed.sources[nonDep]?.content) {
                                        mainCode = parsed.sources[nonDep].content;
                                    }
                                }
                            } else if (parsed.content) {
                                mainCode = parsed.content;
                            }
                        }
                    } catch {
                        // Not JSON, use raw source
                    }

                    // If no parsed code, use raw source
                    if (!mainCode) {
                        mainCode = rawSource;
                    }

                    // Clean up escaped newlines and format
                    const formatted = mainCode
                        .replace(/\\r\\n/g, '\n')
                        .replace(/\\n/g, '\n')
                        .replace(/\\t/g, '    ')
                        .replace(/\\\"/g, '"');

                    setSourceCode(formatted);
                } else {
                    setSourceCode('// Source code not available (contract may not be verified)');
                }
            }
        } catch { setSourceCode('// Error fetching source code'); }
        setSourceLoading(false);
    };

    // Build ABI-driven inputs when selection changes
    useEffect(() => {
        setOutput('');
        setParams('');
        if (!selection) {
            setFormInputs([]);
            setAbiResolved(false);
            return;
        }
        const abi = facetAbis[selection.facet];
        if (!abi) {
            setFormInputs([]);
            setAbiResolved(false);
            return;
        }
        const fn = (abi as any[]).find((item) => item?.type === 'function' && item?.name === selection.method);
        if (!fn || !Array.isArray(fn.inputs)) {
            setFormInputs([]);
            setAbiResolved(false);
            return;
        }
        const inputs = fn.inputs.map((inp: any, idx: number) => ({
            name: inp?.name || `arg${idx}`,
            type: inp?.type || 'string',
            value: '',
        }));
        setFormInputs(inputs);
        setAbiResolved(true);
    }, [selection, facetAbis]);

    // Input formatting helper
    const formatInput = (input: { name: string; type: string; value: string }): any => {
        const val = input.value;
        try {
            switch (input.type) {
                case 'address':
                    return (val || '').trim();
                case 'uint256':
                case 'uint8':
                case 'int256':
                    return BigInt(val || '0');
                case 'bool':
                    return val.toLowerCase() === 'true';
                case 'bytes':
                case 'bytes32':
                    return val;
                default:
                    if (input.type.endsWith('[]')) {
                        try { return JSON.parse(val); } catch { return val.split(',').map(s => s.trim()); }
                    }
                    return val;
            }
        } catch { return val; }
    };

    const runRead = async () => {
        if (!selection) return;
        setBusy(true);
        setOutput('');
        try {
            const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT as string });
            const address = diamondAddress;
            const contractDyn = getContract({ client, chain: base, address, abi: facetAbis[selection.facet] as any });
            const res = await readContract({
                contract: contractDyn,
                method: selection.method as any,
                params: (formInputs.length > 0 ? formInputs.map((fi) => formatInput(fi)) : parseParams(params)) as any,
            } as any);
            setOutput(formatAsPretty(res));
        } catch (e: any) {
            setOutput(e?.message || 'Read failed');
        } finally {
            setBusy(false);
        }
    };

    const runWrite = async () => {
        if (!selection) return;
        setBusy(true);
        setOutput('');
        try {
            const client = createThirdwebClient({ clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT as string });
            const address = diamondAddress;
            const contractDyn = getContract({ client, chain: base, address, abi: facetAbis[selection.facet] as any });
            const tx = prepareContractCall({
                contract: contractDyn,
                method: selection.method as any,
                params: (formInputs.length > 0 ? formInputs.map((fi) => formatInput(fi)) : parseParams(params)) as any,
                value: 0n,
            } as any);
            const receipt = await sendAndConfirmTransaction({ transaction: tx, account: walletAccount });
            setOutput(formatAsPretty(receipt));
        } catch (e: any) {
            setOutput(e?.message || 'Write failed');
        } finally {
            setBusy(false);
        }
    };

    if (!isMounted) {
        return <div className="w-full h-full bg-transparent flex items-center justify-center"><div className="animate-pulse text-[10px] text-zinc-600 font-mono tracking-widest">INITIALIZING_ENGINE...</div></div>;
    }

    return (
        <div className="w-full h-full absolute inset-0 bg-transparent">
            {/* Three.js Canvas */}
            <Canvas
                gl={{ alpha: true, antialias: true, toneMapping: THREE.NoToneMapping }}
                camera={{ position: [0, isMobile ? -0.06 : 0.0, isMobile ? 6.5 : 5.5], fov: isMobile ? 60 : 50 }}
                shadows
            >
                <Scene facets={facets} methodNames={methodNames} facetNames={facetNames} facetAbis={facetAbis} isMobile={isMobile} currentIndex={currentIndex} onSelect={setSelection} />
            </Canvas>

            {/* Navigation HUD and Modal - Rendered via Portal to bypass pointer-events inheritance */}
            {typeof document !== 'undefined' && createPortal(
                <>
                    {/* Navigation */}
                    <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, zIndex: 10000 }}>
                        <button onClick={() => window.dispatchEvent(new Event('nav-prev'))} style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid #3f3f46', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#a1a1aa" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
                        </button>
                        <div style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid #3f3f46', padding: '10px 20px', borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: '#e4e4e7', minWidth: 140, textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                            {currentLabel}
                        </div>
                        <button onClick={() => window.dispatchEvent(new Event('nav-next'))} style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid #3f3f46', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#a1a1aa" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
                        </button>
                        <button onClick={handleViewSource} style={{ background: 'rgba(24,24,27,0.95)', border: '1px solid #3f3f46', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }} title="View Source Code">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#a1a1aa" strokeWidth={2}><path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                        </button>
                    </div>

                    {/* Source Code Modal */}
                    {showSourceModal && (
                        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', zIndex: 10001, display: 'flex', flexDirection: 'column' }} onClick={() => setShowSourceModal(false)}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #27272a', background: '#0a0a0b' }} onClick={e => e.stopPropagation()}>
                                <div>
                                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#52525b', letterSpacing: '0.15em', marginBottom: 2 }}>SOURCE</div>
                                    <div style={{ fontFamily: 'system-ui', fontSize: 16, color: '#fafafa', fontWeight: 600 }}>{currentLabel}</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#3f3f46', marginTop: 2 }}>{currentAddress}</div>
                                </div>
                                <button onClick={() => setShowSourceModal(false)} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #27272a', background: 'transparent', color: '#71717a', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                            </div>
                            <div style={{ flex: 1, overflow: 'auto', background: '#09090b', padding: 0 }} onClick={e => e.stopPropagation()}>
                                {sourceLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#52525b', fontFamily: 'monospace', fontSize: 11 }}>Loading...</div>
                                ) : (
                                    <div style={{ margin: 0, padding: '20px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 13, lineHeight: 1.6, color: '#d4d4d8' }}>
                                        {highlightSolidity(sourceCode)}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Function Execution Modal */}
                    {selection && (
                        <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: 420, maxWidth: '95vw', maxHeight: '80vh', zIndex: 10002, background: 'rgba(9,9,11,0.4)', backdropFilter: 'blur(22px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #27272a' }}>
                                <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.1em', color: selection.type === 'read' ? '#a1a1aa' : '#f472b6', fontWeight: 600 }}>
                                    {selection.type.toUpperCase()}.METHOD
                                </div>
                                <button onClick={() => { setSelection(null); setParams(''); setOutput(''); }} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #27272a', background: 'transparent', color: '#71717a', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                            </div>

                            {/* Content */}
                            <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#52525b', letterSpacing: '0.15em', marginBottom: 4 }}>FACET</div>
                                    <div style={{ fontFamily: 'system-ui', fontSize: 14, color: '#fafafa', fontWeight: 500 }}>{facetNames[selection.facet] || selection.facet.slice(0, 12)}</div>
                                </div>
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#52525b', letterSpacing: '0.15em', marginBottom: 4 }}>METHOD</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#e4e4e7' }}>{selection.method}</div>
                                </div>

                                {/* Form Inputs */}
                                {formInputs.length > 0 && (
                                    <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                                        {formInputs.map((inp, idx) => (
                                            <div key={`${inp.name}-${idx}`}>
                                                <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#71717a', marginBottom: 4 }}>{inp.name} <span style={{ color: '#52525b' }}>({inp.type})</span></div>
                                                <input
                                                    value={inp.value}
                                                    onChange={(e) => setFormInputs((prev) => prev.map((p, i) => i === idx ? { ...p, value: e.target.value } : p))}
                                                    placeholder={inp.type}
                                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 6, background: '#18181b', border: '1px solid #27272a', color: '#fafafa', fontFamily: 'monospace', fontSize: 12, outline: 'none' }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Fallback CSV params */}
                                {!abiResolved && formInputs.length === 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#71717a', marginBottom: 4 }}>PARAMS (CSV)</div>
                                        <input
                                            value={params}
                                            onChange={(e) => setParams(e.target.value)}
                                            placeholder="e.g. 1, 0xabc..., true"
                                            style={{ width: '100%', padding: '10px 12px', borderRadius: 6, background: '#18181b', border: '1px solid #27272a', color: '#fafafa', fontFamily: 'monospace', fontSize: 12, outline: 'none' }}
                                        />
                                    </div>
                                )}

                                {/* Action Button */}
                                {selection.type === 'read' ? (
                                    <button
                                        disabled={busy}
                                        onClick={runRead}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: 8, background: busy ? '#27272a' : 'transparent', border: '1px solid #71717a', color: '#fafafa', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', cursor: busy ? 'wait' : 'pointer', transition: 'all 0.2s' }}
                                    >
                                        {busy ? 'READING...' : '▶ RUN_READ'}
                                    </button>
                                ) : (
                                    <button
                                        disabled={!walletAccount || busy}
                                        onClick={runWrite}
                                        style={{ width: '100%', padding: '12px 16px', borderRadius: 8, background: walletAccount ? (busy ? '#27272a' : 'transparent') : 'rgba(244,114,182,0.1)', border: `1px solid ${walletAccount ? '#f472b6' : '#3f3f46'}`, color: walletAccount ? '#f472b6' : '#52525b', fontFamily: 'monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.1em', cursor: walletAccount && !busy ? 'pointer' : 'not-allowed', transition: 'all 0.2s' }}
                                    >
                                        {busy ? 'WRITING...' : walletAccount ? '▶ RUN_WRITE' : 'CONNECT WALLET'}
                                    </button>
                                )}

                                {/* Output */}
                                {output && (
                                    <div style={{ marginTop: 16, padding: 12, borderRadius: 6, background: '#18181b', border: '1px dashed #27272a', maxHeight: '30vh', overflowY: 'auto' }}>
                                        <pre style={{ margin: 0, fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#d4d4d8', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{output}</pre>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>,
                document.body
            )}
        </div>
    );
}

function Scene({ facets, methodNames, facetNames, facetAbis = {}, isMobile, currentIndex = 0, onSelect }: Props) {

    const rings = useMemo(() => {
        const radius = isMobile ? 0.78 : 1.6;
        const spacing = isMobile ? 0.92 : 1.6;

        return facets.map((f, i) => {
            let reads = methodNames[f.facetAddress]?.readMethods || [];
            let writes = methodNames[f.facetAddress]?.writeMethods || [];
            if ((reads.length + writes.length) === 0 && Array.isArray((f as any).selectors)) {
                const count = (f as any).selectors.length;
                reads = Array.from({ length: count }, (_, idx) => `fn_${idx}`);
                writes = [];
            }
            const total = Math.max(1, reads.length + writes.length);
            const angleStep = (Math.PI * 2) / total;

            // Combine items with their global index for continuous distribution
            const items = [
                ...reads.map((m) => ({ method: m, type: 'read' as const })),
                ...writes.map((m) => ({ method: m, type: 'write' as const })),
            ];

            // Calculate positions using continuous global index
            const readsWithPositions = items
                .map((item, globalIndex) => ({ ...item, globalIndex }))
                .filter(x => x.type === 'read')
                .map(x => ({
                    method: x.method,
                    position: [
                        Math.cos((-Math.PI / 2) + x.globalIndex * angleStep) * radius,
                        Math.sin((-Math.PI / 2) + x.globalIndex * angleStep) * radius,
                        0
                    ] as [number, number, number]
                }));

            const writesWithPositions = items
                .map((item, globalIndex) => ({ ...item, globalIndex }))
                .filter(x => x.type === 'write')
                .map(x => ({
                    method: x.method,
                    position: [
                        Math.cos((-Math.PI / 2) + x.globalIndex * angleStep) * radius,
                        Math.sin((-Math.PI / 2) + x.globalIndex * angleStep) * radius,
                        0
                    ] as [number, number, number]
                }));

            return {
                z: i * -spacing,
                radius,
                baseColor: PORTAL_COLORS.ringBase,
                label: facetNames[f.facetAddress] || f.facetAddress.slice(0, 10),
                reads: readsWithPositions,
                writes: writesWithPositions,
                facetAddress: f.facetAddress,
            };
        });
    }, [facets, methodNames, isMobile, facetNames]);

    const ringZ = useMemo(() => rings.map((r) => r.z), [rings]);

    // Camera Lerp
    useFrame((state) => {
        const targetZ = ringZ[currentIndex] ?? 0;
        const ringR = rings[currentIndex]?.radius ?? 1.6;
        const dist = (ringR / Math.tan(THREE.MathUtils.degToRad(50 / 2))) * (isMobile ? 2.5 : 1.6);
        const cam = state.camera;
        cam.position.z += (targetZ + dist - cam.position.z) * 0.1;
        cam.position.x += (0 - cam.position.x) * 0.1;
        cam.position.y += ((isMobile ? -0.06 : 0) - cam.position.y) * 0.1;
        cam.lookAt(0, 0, targetZ);
    });

    return (
        <>
            <fog attach="fog" args={['#000000', 8, 30]} />
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />

            <Spine length={Math.max(1, facets.length) * 2 + 4} />
            <Rings rings={rings} onSelect={(sel) => onSelect?.(sel)} focusedIndex={currentIndex} yOffset={isMobile ? 0.1 : 0.2} nodeSize={isMobile ? 0.055 : 0.08} />
        </>
    );
}
