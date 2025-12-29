'use client';
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { getFacets, diamondAddress } from './core/Diamond';
import { prepareContractCall, sendAndConfirmTransaction, readContract, getContract, createThirdwebClient } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { useActiveWallet } from 'thirdweb/react';
import { useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DndProvider } from 'react-dnd';
import {
  TrashIcon,
  ArrowPathIcon,
  MagnifyingGlassPlusIcon,
  MagnifyingGlassMinusIcon,
  CubeTransparentIcon,
  PlayCircleIcon,
  BoltIcon
} from '@heroicons/react/24/outline';
import Xarrow, { useXarrow, Xwrapper } from 'react-xarrows';

// --- Client & Cache Utilities ---

const client = createThirdwebClient({
  clientId: process.env.THIRDWEB_CLIENT as string,
});

const cacheKey = "directoryDataV3";
const workspaceKey = "directoryWorkspaceState";

function readCache() {
  if (typeof window === 'undefined') return { facets: [], abis: {} };
  const cache = localStorage.getItem(cacheKey);
  return cache ? JSON.parse(cache) : { facets: [], abis: {} };
}

function writeCache(cache: any) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(cacheKey, JSON.stringify(cache));
  }
}

// Optimized Fetching with Concurrency Control
async function batchFetchABIs(addresses: string[], existingCache: any) {
  const resultABIs = { ...existingCache.abis };
  const toFetch = addresses.filter(addr => !resultABIs[addr]);

  const BATCH_SIZE = 1;
  const DELAY_MS = 300;

  const useTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';
  const networkQuery = useTestnet ? '' : '&network=mainnet';

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (address) => {
      let attempts = 0;
      const MAX_ATTEMPTS = 5;
      let success = false;

      while (attempts < MAX_ATTEMPTS && !success) {
        try {
          const response = await fetch(
            `/api/basescan?module=contract&action=getsourcecode&address=${address}${networkQuery}`
          );
          const data = await response.json();

          // Handle Rate Limit
          if (data.result === "Max calls per sec rate limit reached (3/sec)") {
            attempts++;
            const backoff = 1000 * Math.pow(1.5, attempts); // 1.5s, 2.25s, 3.3s...
            // console.log(`[Directory] Rate limit hit for ${address}, retrying in ${backoff}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }

          // BaseScan API shape handling
          if (data.status === "1" && data.result && data.result[0]) {
            const abiStr = data.result[0].ABI;
            const name = data.result[0].ContractName;
            if (abiStr && abiStr !== "Contract source code not verified") {
              resultABIs[address] = {
                abi: JSON.parse(abiStr),
                name: name
              };
            } else {
              resultABIs[address] = null;
            }
          } else {
            resultABIs[address] = null;
          }
          success = true; // Exit loop on valid response (even if "Not Verified")
        } catch (err) {
          console.warn(`Failed to fetch ABI for ${address} (Attempt ${attempts + 1})`, err);
          attempts++;
          await new Promise(r => setTimeout(r, 1000)); // Simple wait on network error
        }
      }
    }));

    if (i + BATCH_SIZE < toFetch.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  return resultABIs;
}

// --- Helper Functions ---

function getMethodDetails(methodName: string, abis: any[]) {
  for (const abi of abis) {
    if (!abi) continue;
    const method = abi.find((item: any) => item.name === methodName && item.type === 'function');
    if (method) {
      return {
        inputs: method.inputs.map((input: any) => ({ name: input.name || "param", type: input.type })),
        outputs: method.outputs.map((output: any) => ({ name: output.name || "", type: output.type })),
        stateMutability: method.stateMutability
      };
    }
  }
  return { inputs: [], outputs: [], stateMutability: 'nonpayable' };
}

// --- Components ---

interface MethodPanelProps {
  id: string;
  methodName: string;
  inputs: { name: string; type: string; value: string }[];
  outputs: { name: string; type: string; value: string }[];
  isRead: boolean;
  onExecute: () => Promise<void>;
  onDelete: () => void;
  position: { left: number; top: number };
  handleConnectorMouseDown: (id: string, type: 'input' | 'output', index: number) => void;
  handleConnectorMouseUp: (id: string, type: 'input' | 'output', index: number) => void;
  onInputChange: (index: number, value: string) => void;
  outputContent: string;
  setOutputContent: (content: string) => void;
  scale: number;
  onDragStart: (e: React.MouseEvent) => void;
  isDragging: boolean;
}

const MethodPanel: React.FC<MethodPanelProps> = memo(({
  id,
  methodName,
  inputs,
  outputs,
  isRead,
  onExecute,
  onDelete,
  position,
  handleConnectorMouseDown,
  handleConnectorMouseUp,
  onInputChange,
  outputContent,
  scale,
  onDragStart,
  isDragging
}) => {
  const updateXarrow = useXarrow();
  const [outputModalOpen, setOutputModalOpen] = useState(false);
  const [executing, setExecuting] = useState(false);

  // Hook into execution to show state
  const handleExecute = async () => {
    setExecuting(true);
    await onExecute();
    setExecuting(false);
  }

  useEffect(() => {
    updateXarrow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position.left, position.top, scale]);

  return (
    <div
      className={`absolute w-72 rounded-xl border shadow-2xl overflow-hidden ${isDragging ? '' : 'transition-all duration-300'} panel-glow select-none ${executing ? 'z-[60]' : 'z-[50]'} ultra-glass`}
      style={{
        left: position.left,
        top: position.top,
        boxShadow: executing ? `0 0 30px ${isRead ? '#ffffff' : '#e4e4e7'}` : '0 10px 30px rgba(0,0,0,0.8)',
        transform: 'translateZ(0)', // Force GPU
      }}
    >
      {/* Glossy Header */}
      <div
        className="px-4 py-3 flex justify-between items-center bg-zinc-950/50 border-b border-white/5"
      >
        <div
          className="flex items-center gap-3 flex-1 cursor-grab active:cursor-grabbing"
          onMouseDown={onDragStart}
        >
          {isRead ? <PlayCircleIcon className="w-5 h-5 text-zinc-400" /> : <BoltIcon className="w-5 h-5 text-zinc-400" />}
          <span className="font-mono text-xs font-bold text-zinc-200 uppercase tracking-wider truncate max-w-[150px]" title={methodName}>
            {methodName}
          </span>
        </div>
        <button onClick={onDelete} className="text-zinc-600 hover:text-white transition-colors">
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 relative">
        {/* Connectors */}
        <div className="absolute -left-1.5 top-16 flex flex-col gap-8 pointer-events-auto z-50">
          {inputs.map((_, i) => (
            <div
              key={i}
              id={`input-${id}-input-${i}`}
              onMouseDown={(e) => { e.stopPropagation(); handleConnectorMouseDown(id, 'input', i); }}
              onMouseUp={(e) => { e.stopPropagation(); handleConnectorMouseUp(id, 'input', i); }}
              className="w-3 h-3 rounded-full border border-black cursor-pointer hover:scale-150 transition-transform shadow-[0_0_10px_rgba(255,255,255,0.2)]"
              style={{ background: '#71717a' }}
              title={`Input ${i + 1}`}
            />
          ))}
        </div>
        <div className="absolute -right-1.5 top-16 flex flex-col gap-8 pointer-events-auto z-50">
          {outputs.map((_, i) => (
            <div
              key={i}
              id={`output-${id}-output-${i}`}
              onMouseDown={(e) => { e.stopPropagation(); handleConnectorMouseDown(id, 'output', i); }}
              onMouseUp={(e) => { e.stopPropagation(); handleConnectorMouseUp(id, 'output', i); }}
              className="w-3 h-3 rounded-full border border-black cursor-pointer hover:scale-150 transition-transform shadow-[0_0_10px_rgba(255,255,255,0.2)]"
              style={{ background: '#a1a1aa' }}
              title={`Output ${i + 1}`}
            />
          ))}
        </div>

        {/* Inputs */}
        {inputs.length > 0 ? (
          <div className="space-y-3">
            {inputs.map((input, idx) => (
              <div key={idx} className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase text-zinc-500 font-mono pl-1">{input.name} <span className="text-zinc-700">({input.type})</span></label>
                <input
                  type="text"
                  className="w-full bg-black/40 border border-white/5 rounded px-3 py-1.5 text-xs text-zinc-300 font-mono focus:outline-none transition-colors focus:border-white/20"
                  placeholder="Value..."
                  value={input.value}
                  onChange={(e) => onInputChange(idx, e.target.value)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-2 text-zinc-700 text-[10px] uppercase font-mono tracking-widest border border-dashed border-zinc-800 rounded">No Args</div>
        )}

        {/* Controls */}
        <div className="pt-2 flex gap-2">
          <button
            onClick={handleExecute}
            className={`flex-1 py-2 rounded text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg hover:shadow-xl active:scale-95 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700`}
          >
            {executing ? 'PROCESSING...' : (isRead ? 'RUN QUERY' : 'EXECUTE TX')}
          </button>
          {outputContent && (
            <button
              onClick={() => setOutputModalOpen(true)}
              className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-xs"
              title="View Result"
            >
              <CubeTransparentIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* OUTPUT MODAL */}
      {outputModalOpen && (
        <div className="absolute inset-0 bg-black/95 z-[60] flex flex-col p-4 animate-in fade-in zoom-in duration-200">
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/10">
            <span className="text-xs font-mono text-[#F54029] uppercase tracking-widest">Execution Result</span>
            <button onClick={() => setOutputModalOpen(false)} className="text-white hover:text-red-500">×</button>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar">
            <pre className="text-[10px] font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
              {outputContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
});

MethodPanel.displayName = 'MethodPanel';

// --- Workspace & Logic ---

interface WorkspaceProps {
  allABIs: any[];
  diamondAddress: string;
}

const Workspace: React.FC<WorkspaceProps> = ({ allABIs, diamondAddress }) => {
  // State
  const [panels, setPanels] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);

  // Transform State
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const workspaceRef = useRef<HTMLDivElement>(null);

  // Load State from LocalStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(workspaceKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.panels) setPanels(parsed.panels);
          if (parsed.connections) setConnections(parsed.connections);
        }
      } catch (e) { console.error("Failed to load workspace", e); }
    }
  }, []);

  // Save State on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const data = { panels, connections };
      localStorage.setItem(workspaceKey, JSON.stringify(data));
    }
  }, [panels, connections]);

  // Drop Handler
  const [, drop] = useDrop({
    accept: 'method',
    drop: (item: any, monitor) => {
      const offset = monitor.getClientOffset();
      const rect = workspaceRef.current?.getBoundingClientRect();

      if (offset && rect) {
        // Calculate position based on zoom/pan
        const x = (offset.x - rect.left - position.x) / scale;
        const y = (offset.y - rect.top - position.y) / scale;

        setPanels(prev => [...prev, {
          id: `panel-${Date.now()}`,
          ...item,
          position: { x, y },
          inputs: item.inputs.map((i: any) => ({ ...i, value: '' })),
          outputs: item.outputs.map((o: any) => ({ ...o, value: '' })),
          outputContent: ''
        }]);
      }
    }
  });

  const [draggingConnector, setDraggingConnector] = useState<{ id: string, type: 'input' | 'output', index: number } | null>(null);
  const [tempLine, setTempLine] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const wallet = useActiveWallet()?.getAccount() as any;

  useEffect(() => {
    if (workspaceRef.current) drop(workspaceRef.current);
  }, [drop]);

  // Connection Handler
  const handleConnectorMouseDown = (id: string, type: 'input' | 'output', index: number) => {
    if (type === 'output') {
      setDraggingConnector({ id, type, index });
    }
  };

  const handleConnectorMouseUp = (id: string, type: 'input' | 'output', index: number) => {
    if (draggingConnector) {
      if (draggingConnector.id !== id && draggingConnector.type !== type && type === 'input') {
        const newConn = { start: draggingConnector, end: { id, type, index } };
        // Avoid duplicates
        if (!connections.find(c => JSON.stringify(c) === JSON.stringify(newConn))) {
          setConnections(prev => [...prev, newConn]);
        }
      }
      // We don't clear draggingConnector here immediately if we want to support chaining, 
      // but standard is one wire per drag. handleUp (global) will clear it anyway?
      // Actually, if we successfully connected, we should probably clear it.
      setDraggingConnector(null);
      setTempLine(null);
    }
  };

  // Global Mouse Events for Temp Line & Panning
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      // Temp Line Logic
      if (draggingConnector && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        // The start element is transformed by CSS. getBoundingClientRect returns actual screen pos.
        const startEl = document.getElementById(`${draggingConnector.type}-${draggingConnector.id}-${draggingConnector.type}-${draggingConnector.index}`);
        if (startEl) {
          const startRect = startEl.getBoundingClientRect();
          setTempLine({
            x1: startRect.left + startRect.width / 2 - rect.left,
            y1: startRect.top + startRect.height / 2 - rect.top,
            x2: e.clientX - rect.left,
            y2: e.clientY - rect.top
          });
        }
      }

      // Panel Dragging Logic
      if (draggingPanelId) {
        const dx = (e.clientX - lastMousePos.current.x) / scale;
        const dy = (e.clientY - lastMousePos.current.y) / scale;

        setPanels(prev => prev.map(p => {
          if (p.id === draggingPanelId) {
            return { ...p, position: { x: p.position.x + dx, y: p.position.y + dy } };
          }
          return p;
        }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }

      // Panning Logic
      if (isPanning) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleUp = () => {
      setDraggingConnector(null);
      setTempLine(null);
      setIsPanning(false);
      setDraggingPanelId(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingConnector, isPanning, draggingPanelId, scale]);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only pan if clicking background (target is the container or the grid)
    if (e.target === workspaceRef.current || (e.target as HTMLElement).classList.contains('workspace-bg')) {
      setIsPanning(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      e.preventDefault();
      const s = Math.exp(-e.deltaY * 0.001);
      setScale(prev => Math.min(Math.max(prev * s, 0.2), 3));
    } else {
      // Pan with wheel
      setPosition(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const executeMethod = async (panelId: string) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;

    try {
      const fullABI = allABIs.flat().filter(Boolean);
      const contract = getContract({ client, chain: base, address: diamondAddress, abi: fullABI });
      const formattedInputs = panel.inputs.map((inp: any) => inp.value);

      if (panel.isRead) {
        const result = await readContract({ contract, method: panel.methodName, params: formattedInputs });
        const resultString = JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2);

        setPanels(prev => prev.map(p => p.id === panelId ? { ...p, outputContent: resultString } : p));

        // Propagate
        const relevantConns = connections.filter(c => c.start.id === panelId);
        relevantConns.forEach(conn => {
          setPanels(currentPanels => currentPanels.map(targetPanel => {
            if (targetPanel.id === conn.end.id) {
              const newInputs = [...targetPanel.inputs];
              // Safe index check
              if (newInputs[conn.end.index]) {
                newInputs[conn.end.index].value = String(result);
              }
              return { ...targetPanel, inputs: newInputs };
            }
            return targetPanel;
          }));
        });

      } else {
        const tx = prepareContractCall({ contract, method: panel.methodName, params: formattedInputs });
        const receipt = await sendAndConfirmTransaction({ transaction: tx, account: wallet });
        setPanels(prev => prev.map(p => p.id === panelId ? { ...p, outputContent: JSON.stringify(receipt, null, 2) } : p));
      }

    } catch (e: any) {
      setPanels(prev => prev.map(p => p.id === panelId ? { ...p, outputContent: `Error: ${e.message}` } : p));
    }
  };

  return (
    <div
      ref={workspaceRef}
      className="w-full h-full relative overflow-hidden bg-transparent workspace-list"
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
    >
      {/* Tech Grid Background (Moving) */}
      <div
        className="absolute inset-0 pointer-events-none workspace-bg"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          backgroundImage: `
              linear-gradient(rgba(245, 64, 41, 0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(245, 64, 41, 0.05) 1px, transparent 1px)
            `,
          backgroundSize: '40px 40px',
          width: '400%', height: '400%', top: '-150%', left: '-150%'
        }}
      />

      {/* Toolbar - Ultra Glass */}
      <div className="absolute top-4 right-4 z-[100] flex gap-2">
        <div className="flex bg-black/20 backdrop-blur-md border border-white/10 rounded-full p-1 shadow-lg">
          <button onClick={() => setScale(s => Math.min(s * 1.2, 3))} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-[#F54029] transition-colors"><MagnifyingGlassPlusIcon className="w-5 h-5" /></button>
          <button onClick={() => setScale(s => Math.max(s / 1.2, 0.2))} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-[#F54029] transition-colors"><MagnifyingGlassMinusIcon className="w-5 h-5" /></button>
          <div className="w-[1px] bg-white/10 mx-1 my-1" />
          <button onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-[#F54029] transition-colors"><ArrowPathIcon className="w-5 h-5" /></button>
          <button onClick={() => setClearModalOpen(true)} className="p-2 hover:bg-white/10 rounded-full text-white/70 hover:text-red-500 transition-colors"><TrashIcon className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Content Container with Transform */}
      <div
        className="w-full h-full absolute inset-0 transform-gpu"
        style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`, transformOrigin: '0 0' }}
      >
        <Xwrapper>
          {panels.map((panel) => (
            <MethodPanel
              key={panel.id}
              {...panel}
              scale={scale}
              isDragging={draggingPanelId === panel.id}
              position={{ left: panel.position.x, top: panel.position.y }}
              onDragStart={(e) => {
                e.stopPropagation();
                setDraggingPanelId(panel.id);
                lastMousePos.current = { x: e.clientX, y: e.clientY };
              }}
              onExecute={() => executeMethod(panel.id)}
              onDelete={() => {
                setPanels(p => p.filter(x => x.id !== panel.id));
                setConnections(c => c.filter(x => x.start.id !== panel.id && x.end.id !== panel.id));
              }}
              handleConnectorMouseDown={handleConnectorMouseDown}
              handleConnectorMouseUp={handleConnectorMouseUp}
              onInputChange={(i, val) => {
                setPanels(prev => prev.map(p => p.id === panel.id ? {
                  ...p,
                  inputs: p.inputs.map((inp: any, index: number) => index === i ? { ...inp, value: val } : inp)
                } : p));
              }}
              setOutputContent={(content: string) => setPanels(prev => prev.map(p => p.id === panel.id ? { ...p, outputContent: content } : p))}
            />
          ))}

          {connections.map((conn, i) => (
            <Xarrow
              key={i}
              start={`output-${conn.start.id}-output-${conn.start.index}`}
              end={`input-${conn.end.id}-input-${conn.end.index}`}
              color="#71717a"
              strokeWidth={2}
              path="smooth"
              startAnchor="right"
              endAnchor="left"
              showHead={true}
              headSize={4}
              curveness={0.4}
              passProps={{ pointerEvents: 'none' }}
              animateDrawing={false} // Disable animation for performance during drag
              zIndex={0}
            />
          ))}
        </Xwrapper>
      </div>

      {/* Prompt when empty */}
      {panels.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
          <div className="flex flex-col items-center">
            <CubeTransparentIcon className="w-24 h-24 text-[#F54029] mb-4" />
            <div className="text-2xl font-mono text-white tracking-widest">WORKSPACE EMPTY</div>
          </div>
        </div>
      )}

      {tempLine && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-[200]">
          <path
            d={`M ${tempLine.x1} ${tempLine.y1} C ${tempLine.x1 + 50} ${tempLine.y1}, ${tempLine.x2 - 50} ${tempLine.y2}, ${tempLine.x2} ${tempLine.y2}`}
            stroke="#F54029"
            strokeWidth="2"
            fill="none"
            strokeDasharray="5,5"
          />
        </svg>
      )}

      {/* Clear Confirmation Modal */}
      {clearModalOpen && (
        <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#050a14] border border-[#F54029]/30 rounded-lg p-6 max-w-sm w-full shadow-[0_0_30px_rgba(245,64,41,0.2)]">
            <h3 className="text-[#F54029] font-mono font-bold text-lg mb-2 tracking-widest">CLEAR WORKSPACE</h3>
            <p className="text-white/70 text-xs mb-6 font-mono leading-relaxed">
              CONFIRM DELETION OF ALL ACTIVE NODES AND CONNECTIONS? THIS ACTION IS IRREVERSIBLE.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setClearModalOpen(false)}
                className="px-4 py-2 rounded text-[10px] font-bold tracking-wider text-white/60 hover:text-white transition-colors border border-transparent hover:border-white/10"
              >
                CANCEL
              </button>
              <button
                onClick={() => {
                  setPanels([]);
                  setConnections([]);
                  setClearModalOpen(false);
                }}
                className="px-4 py-2 rounded bg-[#F54029]/10 border border-[#F54029]/50 text-[#F54029] hover:bg-[#F54029]/20 text-[10px] font-bold tracking-wider transition-all shadow-[0_0_20px_rgba(245,64,41,0.1)] hover:shadow-[0_0_30px_rgba(245,64,41,0.3)]"
              >
                CONFIRM_CLEAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sidebar Item ---

const MethodItem = ({ methodName, isRead, inputs, outputs }: any) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'method',
    item: { methodName, isRead, inputs, outputs },
    collect: (m) => ({ isDragging: m.isDragging() })
  });

  return (
    <div ref={drag as unknown as React.LegacyRef<HTMLDivElement>} className={`group p-3 rounded-md border cursor-grab transition-all duration-200 relative overflow-hidden ${isDragging ? 'opacity-50' : 'opacity-100 hover:scale-[1.02]'
      } ${isRead
        ? 'bg-zinc-900/40 border-zinc-700/50 hover:border-zinc-500/80'
        : 'bg-zinc-900/40 border-zinc-700/50 hover:border-zinc-500/80'
      }`}>
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${isRead ? 'bg-zinc-500' : 'bg-zinc-600'} opacity-50`} />
      <div className="flex justify-between items-center pl-2">
        <span className="font-mono text-[11px] font-bold truncate text-zinc-300">
          {methodName}
        </span>
        <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">
          {isRead ? 'READ' : 'WRITE'}
        </span>
      </div>
    </div>
  );
};

// --- Main Directory Component ---

export default function Directory() {
  const [methods, setMethods] = useState<{ read: string[], write: string[] }>({ read: [], write: [] });
  const [allABIs, setAllABIs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    const init = async () => {
      try {
        const cache = readCache();
        const facets = await getFacets();
        const facetAddresses = facets.map(f => f.target);

        // Fast UI update
        setLoadingProgress(20);

        const abis = await batchFetchABIs(facetAddresses, cache);
        writeCache({ facets, abis });
        setLoadingProgress(80);

        const combinedParams: Set<string> = new Set();
        const readM: string[] = [];
        const writeM: string[] = [];
        const validABIs: any[] = [];

        facetAddresses.forEach(addr => {
          const fetched = abis[addr];
          if (fetched) {
            // Strict matching for Directory Facet
            if (fetched.name && (fetched.name.toLowerCase().includes('directory') || fetched.name.includes('RENSNCEDRCTRY'))) {
              const abi = fetched.abi;
              validABIs.push(abi);
              abi.forEach((item: any) => {
                if (item.type === 'function') {
                  if (!combinedParams.has(item.name)) {
                    combinedParams.add(item.name);
                    if (item.stateMutability === 'view' || item.stateMutability === 'pure') {
                      readM.push(item.name);
                    } else {
                      writeM.push(item.name);
                    }
                  }
                }
              });
            }
          }
        });

        setAllABIs(validABIs);
        setMethods({ read: readM.sort(), write: writeM.sort() });
        setLoadingProgress(100);
        setLoading(false);

      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };
    init();
  }, []);

  return (
    <DndProvider backend={HTML5Backend}>
      <div
        className="flex flex-col md:flex-row h-full w-full rounded-3xl overflow-hidden shadow-2xl transition-all ultra-glass"
      >
        {/* Workspace - Takes FULL height on mobile minus the bottom bar, full width on right on desktop */}
        <div className="flex-1 relative bg-transparent order-1 md:order-2">
          <Workspace allABIs={allABIs} diamondAddress={diamondAddress} />
        </div>

        {/* Sidebar / Bottom Bar */}
        <div className="w-full md:w-72 h-32 md:h-full flex-shrink-0 flex flex-col border-t md:border-t-0 md:border-r border-white/5 bg-black/40 backdrop-blur-xl z-20 order-2 md:order-1">
          <div className="p-3 md:p-5 border-b border-white/5 bg-black/20 flex justify-between md:block items-center">
            <div>
              <h2 className="font-bold text-sm md:text-lg text-white tracking-[0.2em] mb-1">DIRECTORY</h2>
              <div className="text-[9px] md:text-[10px] text-zinc-500 font-mono tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
                SYSTEM.ACTIVE
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-x-auto md:overflow-y-auto overflow-y-hidden md:overflow-x-hidden p-2 md:p-3 space-x-4 md:space-x-0 md:space-y-6 custom-scrollbar flex flex-row md:flex-col items-center md:items-stretch">
            {loading ? (
              <div className="text-center py-4 md:py-20 space-x-4 md:space-x-0 md:space-y-4 flex md:block items-center justify-center w-full">
                <div className="w-6 h-6 md:w-10 md:h-10 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <div className="text-[10px] font-mono text-zinc-500 animate-pulse tracking-widest whitespace-nowrap">
                  LOADING... {loadingProgress}%
                </div>
              </div>
            ) : (
              <>
                <div className="flex-shrink-0 flex flex-row md:flex-col gap-2 md:gap-0 items-center md:items-stretch h-full md:h-auto">
                  <h3 className="hidden md:block text-[10px] font-bold text-white/40 mb-3 uppercase tracking-[0.15em] pl-1 border-b border-white/5 pb-1">Read / Queries</h3>
                  <div className="flex md:flex-col gap-2">
                    {methods.read.map((m) => {
                      const details = getMethodDetails(m, allABIs);
                      return (
                        <div key={m} className="w-40 md:w-auto flex-shrink-0">
                          <MethodItem methodName={m} isRead={true} {...details} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex-shrink-0 flex flex-row md:flex-col gap-2 md:gap-0 items-center md:items-stretch h-full md:h-auto">
                  <h3 className="hidden md:block text-[10px] font-bold text-white/40 mb-3 uppercase tracking-[0.15em] pl-1 border-b border-white/5 pb-1">Write / Actions</h3>
                  <div className="flex md:flex-col gap-2">
                    {methods.write.map((m) => {
                      const details = getMethodDetails(m, allABIs);
                      return (
                        <div key={m} className="w-40 md:w-auto flex-shrink-0">
                          <MethodItem methodName={m} isRead={false} {...details} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
            <div className="w-4 md:h-8 flex-shrink-0" /> {/* Spacer */}
          </div>
        </div>
      </div>
    </DndProvider>
  );
}