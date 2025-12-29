import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { generateDAOMesh } from './utils/generativeDesign';
import { useActiveWallet } from 'thirdweb/react';
import { getContract, readContract, prepareContractCall, sendAndConfirmTransaction } from "thirdweb";
import { baseSepolia, base } from 'thirdweb/chains';
import { client, diamondAddress, default as diamondAbi } from './core/TSPABI';
import { ethers } from 'ethers';

// ----------------------------------------------------------------------
// Types & Interfaces
// ----------------------------------------------------------------------
const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

interface CommitteeUIData {
  id: string;
  name: string;
  foundingStatement: string;
  principles: string;
  founder: string;
  memberCount: number;
  isMember: boolean;
  isLoadingAction: boolean;
  aestheticHash?: string; // For visual continuity
}

interface Proposal {
  proposalId: bigint;
  submitter?: string;
  documentLink?: string;
  assignedCommittees?: string[];
  title?: string;
  isPhaseApprovalTask?: boolean;
  vrdiId?: bigint;
  phaseIndexToApprove?: number;
  evidenceLink?: string;
  debtor?: string;
  vrdiData?: any;
  phaseData?: any;
}

// ----------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------

const CommunitiesPanel: React.FC = () => {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const wallet = useActiveWallet();
  const account = wallet?.getAccount();
  const isTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';

  const diamondContract = useMemo(() => getContract({
    client,
    chain: isTestnet ? baseSepolia : base,
    address: diamondAddress,
    abi: diamondAbi,
  }), [isTestnet, diamondAddress]);

  const [committees, setCommittees] = useState<CommitteeUIData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCommittee, setSelectedCommittee] = useState<CommitteeUIData | null>(null);

  // Create/Edit State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStatement, setNewStatement] = useState('');
  const [newPrinciples, setNewPrinciples] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Modal Tabs & Vetting State
  const [modalTab, setModalTab] = useState<'overview' | 'vetting'>('overview');
  const [tasks, setTasks] = useState<Proposal[]>([]);
  const [approvedTasks, setApprovedTasks] = useState<Proposal[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Approval Dialog State
  const [approvalTask, setApprovalTask] = useState<Proposal | null>(null);
  const [isApprovalDialogOpen, setIsApprovalDialogOpen] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // ------------------------------------------------------------------
  // Data Fetching
  // ------------------------------------------------------------------
  const fetchCommittees = useCallback(async () => {
    if (!account || !diamondContract) return;
    setLoading(true);
    try {
      // Get all committee IDs
      const [ids, _names] = await readContract({
        contract: diamondContract,
        method: 'getAllCommittees',
        params: [],
      }) as unknown as [bigint[], string[]];

      const loaded: CommitteeUIData[] = [];

      for (const id of ids) {
        const details = await readContract({
          contract: diamondContract,
          method: 'getCommitteeDetails',
          params: [id],
        }) as unknown as [bigint, string, string, string, string, bigint];

        const [cId, cName, stmt, principles, founder, count] = details;

        const isMember = await readContract({
          contract: diamondContract,
          method: 'isCommitteeMember',
          params: [cName, account.address],
        }) as boolean;

        loaded.push({
          id: cId.toString(),
          name: cName,
          foundingStatement: stmt,
          principles: principles,
          founder: founder,
          memberCount: Number(count),
          isMember,
          isLoadingAction: false,
          aestheticHash: cName + founder
        });
      }
      setCommittees(loaded);
    } catch (e) {
      console.error("Error fetching committees:", e);
    } finally {
      setLoading(false);
    }
  }, [account, diamondContract]);

  useEffect(() => {
    fetchCommittees();
    const interval = setInterval(fetchCommittees, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [fetchCommittees]);

  // Fetch Tasks when a committee is selected and tab is vetting
  useEffect(() => {
    if (!selectedCommittee || !diamondContract || modalTab !== 'vetting') return;

    const loadTasks = async () => {
      setLoadingTasks(true);
      try {
        const nextId = Number(await readContract({ contract: diamondContract, method: 'getNextProposalId', params: [] }));
        const foundTasks: Proposal[] = [];
        const foundApproved: Proposal[] = [];

        // Look back 50 proposals
        for (let i = 0; i < Math.min(nextId, 50); i++) {
          const pid = BigInt(nextId - 1 - i);
          if (pid < 0n) break;

          try {
            const d = await readContract({ contract: diamondContract, method: 'getProposalDetails', params: [pid] }) as any;
            const assigned = Array.from(d[2]) as string[];

            if (assigned.includes(selectedCommittee.name)) {
              const isApproved = await readContract({
                contract: diamondContract,
                method: 'getCommitteeApproval',
                params: [pid, selectedCommittee.name]
              }) as boolean;

              const item = {
                proposalId: pid,
                title: `Proposal #${pid}`,
                submitter: d[0],
                documentLink: d[1],
                assignedCommittees: assigned,
                isPhaseApprovalTask: false
              };

              if (isApproved) {
                foundApproved.push(item);
              } else if (!d[4] && !d[3]) { // Not vetoed, not fully approved
                foundTasks.push(item);
              }
            }
          } catch (err) { console.warn("Error fetching proposal", pid, err); }
        }

        // Fetch VRDI Tasks
        const nextVRDI = Number(await readContract({ contract: diamondContract, method: 'getNextVRDIId', params: [] }));

        for (let i = 0; i < Math.min(nextVRDI, 20); i++) {
          const vid = BigInt(nextVRDI - 1 - i);
          if (vid < 0n) break;
          try {
            const vDetails: any = await readContract({ contract: diamondContract, method: 'getVRDIDetails', params: [vid] });
            if (vDetails.isClosed) continue;

            // Check if committee was on original DIO
            const originalDioId = vDetails.dioId;
            const d = await readContract({ contract: diamondContract, method: 'getProposalDetails', params: [originalDioId] }) as any;
            const assigned = Array.from(d[2]) as string[];

            if (assigned.includes(selectedCommittee.name)) {
              const phases: any = await readContract({ contract: diamondContract, method: 'getVRDIPhases', params: [vid] });
              const activeIdx = Number(vDetails.activePhaseIndex);

              if (activeIdx >= 0 && activeIdx < phases[0].length) {
                const evidence = phases[3][activeIdx];
                const isComplete = phases[2][activeIdx];

                const task = {
                  proposalId: originalDioId,
                  vrdiId: vid,
                  isPhaseApprovalTask: true,
                  phaseIndexToApprove: activeIdx,
                  title: `VRDI #${vid} - Phase ${activeIdx + 1}`,
                  evidenceLink: evidence,
                  submitter: vDetails.debtor,
                  assignedCommittees: assigned
                };

                if (evidence && evidence.trim() !== '' && !isComplete) {
                  foundTasks.push(task);
                } else if (isComplete) {
                  foundApproved.push(task);
                }
              }
            }
          } catch (err) { console.warn("Err fetching VRDI", vid, err); }
        }

        setTasks(foundTasks);
        setApprovedTasks(foundApproved);
      } catch (e) {
        console.error("Error loading tasks", e);
      } finally {
        setLoadingTasks(false);
      }
    };

    loadTasks();
  }, [selectedCommittee, diamondContract, modalTab]);


  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  const handleCreate = async () => {
    if (!newName || !newStatement || !newPrinciples) return;
    setIsCreating(true);
    try {
      const tx = await prepareContractCall({
        contract: diamondContract,
        method: 'createCommittee',
        params: [newName, newStatement, newPrinciples],
      });
      await sendAndConfirmTransaction({ transaction: tx, account: account! });
      setIsCreateModalOpen(false);
      setNewName(''); setNewStatement(''); setNewPrinciples('');
      fetchCommittees();
    } catch (e) {
      console.error("Create failed", e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinLeave = async (committee: CommitteeUIData) => {
    try {
      const method = committee.isMember ? 'removeCommitteeMember' : 'joinCommittee';
      const params = committee.isMember ? [BigInt(committee.id), account!.address] : [BigInt(committee.id)];

      const tx = await prepareContractCall({
        contract: diamondContract,
        method: method,
        params: params as any
      });
      await sendAndConfirmTransaction({ transaction: tx, account: account! });
      fetchCommittees();
    } catch (e) {
      console.error("Join/Leave failed", e);
    }
  };

  const handleExamine = (task: Proposal) => {
    setApprovalTask(task);
    setIsApprovalDialogOpen(true);
  };

  const handleConfirmApproval = async () => {
    if (!approvalTask || !selectedCommittee) return;
    setIsApproving(true);
    try {
      let tx;
      if (approvalTask.isPhaseApprovalTask && approvalTask.vrdiId !== undefined) {
        tx = await prepareContractCall({
          contract: diamondContract,
          method: 'approvePhaseCompletion',
          params: [approvalTask.vrdiId, BigInt(approvalTask.phaseIndexToApprove!), selectedCommittee.name],
        });
      } else {
        tx = await prepareContractCall({
          contract: diamondContract,
          method: 'approveProposal',
          params: [approvalTask.proposalId, selectedCommittee.name],
        });
      }
      await sendAndConfirmTransaction({ transaction: tx, account: account! });
      setIsApprovalDialogOpen(false);
      setApprovalTask(null);
      // Refresh tasks logic would ideally happen here, currently relying on re-mount or manual refresh
    } catch (e) {
      console.error("Approval failed", e);
    } finally {
      setIsApproving(false);
    }
  };


  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (loading && committees.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center space-y-4">
        <div className="w-16 h-16 relative">
          <div className="absolute inset-0 border-t-2 border-cyan-500 rounded-full animate-spin"></div>
          <div className="absolute inset-2 border-t-2 border-fuchsia-500 rounded-full animate-spin-reverse"></div>
        </div>
        <div className="text-xs font-mono tracking-[0.2em] text-cyan-500 animate-pulse">
          LOADING_DATA...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-zinc-200 to-zinc-500 tracking-tight mb-4 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
            COMMITTEE NEXUS
          </h1>
          <p className="text-zinc-400 font-mono text-xs tracking-widest uppercase mb-8">
            Decentralized Governance Modules
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* Create New Card */}
          <div
            onClick={() => setIsCreateModalOpen(true)}
            className="group relative h-[320px] rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 hover:bg-white/5 border border-dashed border-white/10 flex flex-col items-center justify-center gap-4 hover:border-cyan-500/30"
          >
            <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center group-hover:scale-110 group-hover:border-cyan-500 transition-all duration-300 shadow-xl">
              <span className="text-3xl text-zinc-500 group-hover:text-cyan-400 transition-colors">+</span>
            </div>
            <span className="text-xs font-mono tracking-[0.2em] text-zinc-500 group-hover:text-cyan-300 uppercase transition-colors">
              Initialize Committee
            </span>
          </div>

          {/* Committee Cards */}
          {committees.map((committee) => (
            <div
              key={committee.id}
              onClick={() => { setSelectedCommittee(committee); setModalTab('overview'); }}
              className="group relative h-[320px] rounded-3xl overflow-hidden cursor-pointer transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-white/5 bg-black/40"
            >
              {/* Generative Cover */}
              <div
                className="absolute inset-0 transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-80"
                style={{ background: generateDAOMesh(committee.name + committee.id) }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
              <div className="absolute inset-0 p-8 flex flex-col justify-end">
                <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500 flex flex-col gap-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-[10px] font-mono text-white tracking-wider">
                      ID: {committee.id.padStart(3, '0')}
                    </span>
                    {committee.isMember && (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 text-[10px] font-mono text-emerald-400 tracking-wider">
                        MEMBER
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight group-hover:text-cyan-200 transition-colors">
                    {committee.name}
                  </h2>
                  <p className="text-zinc-400 text-xs leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">
                    {committee.foundingStatement}
                  </p>
                  <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-100">
                    <div>
                      <span className="block text-[9px] uppercase tracking-widest text-zinc-500 mb-1">Members</span>
                      <span className="text-lg font-mono text-white">{committee.memberCount}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 border border-white/0 group-hover:border-white/20 rounded-3xl transition-colors duration-500 pointer-events-none" />
            </div>
          ))}
        </div>
      </div>

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsCreateModalOpen(false)}>
          <div className="w-full max-w-lg bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl p-8" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold text-white mb-6 tracking-tight">Initialize Committee</h2>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-mono uppercase text-zinc-500 mb-2 block">Name</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500 transition-colors"
                  value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. High Table"
                />
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-zinc-500 mb-2 block">Mission Statement</label>
                <textarea
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500 transition-colors h-24 resize-none"
                  value={newStatement} onChange={e => setNewStatement(e.target.value)}
                  placeholder="Define the purpose..."
                />
              </div>
              <div>
                <label className="text-xs font-mono uppercase text-zinc-500 mb-2 block">Core Principles</label>
                <textarea
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-cyan-500 transition-colors h-24 resize-none"
                  value={newPrinciples} onChange={e => setNewPrinciples(e.target.value)}
                  placeholder="List key operational tenets..."
                />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button className="px-6 py-3 rounded-xl hover:bg-white/5 text-zinc-400 text-xs font-bold uppercase transition-colors" onClick={() => setIsCreateModalOpen(false)}>Cancel</button>
                <button
                  className="px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold uppercase transition-colors flex items-center gap-2"
                  onClick={handleCreate}
                  disabled={isCreating}
                >
                  {isCreating && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {isCreating ? 'Deploying...' : 'Initialize'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL with TABS */}
      {selectedCommittee && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200" onClick={() => setSelectedCommittee(null)}>
          <div className="relative w-full max-w-4xl bg-zinc-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

            {/* Generative Header */}
            <div
              className="h-44 w-full flex-shrink-0 relative"
              style={{ background: generateDAOMesh(selectedCommittee.name + selectedCommittee.id) }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-zinc-900" />
              <div className="absolute bottom-6 left-8">
                <span className="inline-block px-3 py-1 rounded-full bg-black/50 backdrop-blur border border-white/10 text-[10px] font-mono text-white tracking-wider mb-2">
                  COMMITTEE ID: {selectedCommittee.id}
                </span>
                <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">{selectedCommittee.name}</h1>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10 px-8">
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'vetting', label: 'Vetting Tasks' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setModalTab(tab.id as any)}
                  className={`px-6 py-4 text-xs font-mono uppercase tracking-[0.2em] border-b-2 transition-all ${modalTab === tab.id
                    ? 'border-cyan-500 text-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Content Scroll Area */}
            <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
              {modalTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-2 duration-300">
                  <div>
                    <h3 className="text-xs font-mono uppercase text-zinc-500 mb-4 tracking-widest">Manifesto</h3>
                    <div className="p-6 rounded-2xl bg-black/40 border border-white/5">
                      <p className="text-zinc-300 text-sm leading-relaxed mb-4">{selectedCommittee.foundingStatement}</p>
                      <div className="w-full h-px bg-white/5 my-4" />
                      <p className="text-zinc-500 text-xs italic">{selectedCommittee.principles}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <h3 className="text-xs font-mono uppercase text-zinc-500 mb-0 tracking-widest">Status</h3>
                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                      <span className="text-zinc-400 text-sm">Valid Members</span>
                      <span className="text-xl font-mono text-white">{selectedCommittee.memberCount}</span>
                    </div>
                    <div className="p-4 rounded-xl bg-black/40 border border-white/5 flex justify-between items-center">
                      <span className="text-zinc-400 text-sm">Founded By</span>
                      <span className="text-xs font-mono text-zinc-500">{selectedCommittee.founder.slice(0, 6)}...{selectedCommittee.founder.slice(-4)}</span>
                    </div>

                    <button
                      className={`mt-auto w-full py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${selectedCommittee.isMember
                        ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30'
                        : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                        }`}
                      onClick={() => handleJoinLeave(selectedCommittee)}
                    >
                      {selectedCommittee.isMember ? 'Renounce Membership' : 'Join Committee'}
                    </button>
                  </div>
                </div>
              )}

              {modalTab === 'vetting' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-300">
                  {/* Pending Tasks */}
                  <div>
                    <h3 className="text-xs font-mono uppercase text-zinc-500 mb-4 tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></span>
                      Action Required
                    </h3>
                    <div className="space-y-3">
                      {loadingTasks ? (
                        <div className="text-center py-8 text-zinc-600 font-mono text-xs">Scanning Grid...</div>
                      ) : tasks.length === 0 ? (
                        <div className="p-8 rounded-2xl border border-dashed border-white/10 text-center text-zinc-600 text-sm">
                          No pending requests.
                        </div>
                      ) : (
                        tasks.map(task => (
                          <div key={Number(task.proposalId)} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors flex justify-between items-center group">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 border border-zinc-700 font-mono text-xs">
                                {task.isPhaseApprovalTask ? 'VRDI' : 'DIO'}
                              </div>
                              <div>
                                <h4 className="text-white font-medium text-sm group-hover:text-cyan-300 transition-colors">{task.title}</h4>
                                <span className="text-xs text-zinc-500">
                                  {task.isPhaseApprovalTask
                                    ? `Evidence: ${task.evidenceLink?.slice(0, 25)}...`
                                    : `Doc: ${task.documentLink?.slice(0, 25)}...`}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleExamine(task)}
                              className="px-6 py-2 rounded-lg bg-cyan-900/30 border border-cyan-500/30 text-xs text-cyan-400 font-bold uppercase hover:bg-cyan-500 hover:text-black transition-all"
                            >
                              Examine
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Approved History */}
                  {approvedTasks.length > 0 && (
                    <div className="opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                      <h3 className="text-xs font-mono uppercase text-zinc-500 mb-4 tracking-widest mt-8">Recent Approvals</h3>
                      <div className="space-y-3">
                        {approvedTasks.map(task => (
                          <div key={Number(task.proposalId)} className="p-4 rounded-xl bg-black/20 border border-white/5 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-600 border border-zinc-800 font-mono text-[10px]">
                                ✓
                              </div>
                              <div>
                                <h4 className="text-zinc-400 font-medium text-sm">{task.title}</h4>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-white/10 bg-black/20 backdrop-blur flex justify-end">
              <button
                className="px-8 py-3 rounded-full bg-white text-black font-bold text-xs font-mono uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                onClick={() => setSelectedCommittee(null)}
              >
                Close Nexus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPROVAL DIALOG */}
      {isApprovalDialogOpen && approvalTask && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsApprovalDialogOpen(false)}>
          <div className="w-full max-w-lg bg-zinc-950 border border-cyan-900/50 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(8,145,178,0.2)] p-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-3 h-3 bg-cyan-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
              <h2 className="text-xl font-bold text-white tracking-tight uppercase">Confirm Approval</h2>
            </div>

            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              You are about to cast an irrevocable approval vote for <span className="text-cyan-400 font-mono">{approvalTask.title}</span> on behalf of the committee <span className="text-white font-bold">{selectedCommittee?.name}</span>.
            </p>

            <div className="bg-black/40 rounded-xl p-4 mb-6 border border-white/5">
              <div className="flex justify-between mb-2">
                <span className="text-xs text-zinc-500 uppercase">Item Type</span>
                <span className="text-xs text-white font-mono">{approvalTask.isPhaseApprovalTask ? 'VRDI Milestone' : 'Standard Proposal'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-zinc-500 uppercase">External Ref</span>
                <a
                  href={approvalTask.evidenceLink || approvalTask.documentLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-cyan-500 hover:text-cyan-300 underline"
                >
                  View Source Document
                </a>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                className="px-6 py-3 rounded-lg hover:bg-white/5 text-zinc-400 text-xs font-bold uppercase transition-colors"
                onClick={() => setIsApprovalDialogOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-8 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold uppercase transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.4)]"
                onClick={handleConfirmApproval}
                disabled={isApproving}
              >
                {isApproving && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {isApproving ? 'Signing...' : 'Execute Approval'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunitiesPanel;