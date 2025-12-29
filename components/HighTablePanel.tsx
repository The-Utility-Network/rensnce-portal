import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { readContract, prepareContractCall, sendAndConfirmTransaction, getContract } from 'thirdweb';
import { useActiveWallet, useActiveAccount } from 'thirdweb/react';
import { defineChain } from "thirdweb";
import * as TSPABI from './core/TSPABI';
import { CircularProgress } from '@mui/material';
import { baseSepolia, base } from 'thirdweb/chains';
import { client, diamondAddress, default as diamondAbi } from './core/TSPABI';

// --- Interfaces (copied from DAODashboard) ---
interface Proposal {
  id: string;
  title: string;
  status: string;
  description?: string;
  submitter?: string;
  documentLink?: string;
  assignedCommittees?: readonly string[];
  committeeApprovalDetails?: Array<{ id: string; approved: boolean }>;
  highTableApproved?: boolean;
  highTableVetoed?: boolean;
  dioId?: string;
  rawData?: any;
}

interface VRDIPhase {
  amount: string;
  isActive: boolean;
  isComplete: boolean;
  evidenceLink?: string;
  completionTimestamp?: string;
  committeeApprovalDetails?: Array<{ committeeId: string; approved: boolean; statusText: string }>;
}

interface VRDI {
  id: string;
  debtor: string;
  totalRepaymentAmount: string;
  principalUSDC: string;
  principalMKVLI20: string;
  interestRate: string;
  currentPhaseIndex: number;
  phases: VRDIPhase[];
  status: string;
  isFrozen: boolean;
  isClosed: boolean;
  startTimestamp?: string;
  totalWithdrawnDisplay?: string;
  rawDataDetails?: any;
  rawDataPhases?: any;
  stakedTokenCount?: number;
}

// --- Status helpers (copied from DAODashboard) ---
const getProposalStatus = (details: any, committeeApprovals?: Record<string, boolean>): string => {
  if (!details) return 'prop_pending_review';
  if (details.highTableVetoed) return 'prop_executed_closed';
  if (details.dioId && BigInt(details.dioId.toString()) > 0n) return 'prop_finalized';
  if (details.highTableApproved) return 'prop_hightable_approved';
  if (details.assignedCommittees && details.assignedCommittees.length > 0) {
    if (committeeApprovals) {
      const allApproved = details.assignedCommittees.every((c: string) => committeeApprovals[c]);
      if (allApproved) return 'prop_committee_approved';
      return 'prop_committee_assigned';
    }
    return 'prop_committee_assigned';
  }
  return 'prop_pending_review';
};

const getVRDIStatus = (details: any, phasesData?: any, stakedTokenCount?: number): string => {
  if (!details) return 'vrdi_active_disbursing';
  if (details.isClosed) return 'vrdi_closed';
  if (details.isFrozen) return 'vrdi_frozen';
  if (typeof stakedTokenCount === 'number' && stakedTokenCount === 0) {
    return 'vrdi_pending_first_withdrawal';
  }
  if (phasesData && phasesData.completionTimestamps && Array.isArray(phasesData.completionTimestamps)) {
    const allComplete = phasesData.completionTimestamps.length > 0 && phasesData.completionTimestamps.every((ts: bigint) => ts > 0n);
    if (allComplete) return 'vrdi_repayment';
  }
  if (phasesData && phasesData.withdrawnAmountsUSDC && Array.isArray(phasesData.withdrawnAmountsUSDC)) {
    const anyWithdrawn = phasesData.withdrawnAmountsUSDC.some((amt: bigint) => amt > 0n);
    if (anyWithdrawn) return 'vrdi_active_disbursing';
  }
  return 'vrdi_pending_first_withdrawal';
};

const USDC_DECIMALS = 6;
const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

// Simple Status Badge Component
const StatusBadge = ({ status, type }: { status: string, type: 'proposal' | 'vrdi' }) => {
  let colorClass = "bg-zinc-800 text-zinc-400";
  let label = status.replace(/_/g, " ").replace("prop ", "").replace("vrdi ", "");

  if (status.includes("approved") || status.includes("repayment")) colorClass = "bg-emerald-950/30 text-emerald-400 border border-emerald-900/30";
  if (status.includes("pending") || status.includes("disbursing")) colorClass = "bg-amber-950/30 text-amber-500 border border-amber-900/30";
  if (status.includes("closed") || status.includes("finalized") || status.includes("vetoed")) colorClass = "bg-zinc-800 text-zinc-500 border border-zinc-700";
  if (status.includes("frozen")) colorClass = "bg-blue-950/30 text-blue-400 border border-blue-900/30";

  return <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold tracking-wide ${colorClass}`}>{label}</span>;
}

const HighTablePanel: React.FC = () => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [vrdis, setVrdis] = useState<VRDI[]>([]);
  const [loading, setLoading] = useState(true);
  const activeWallet = useActiveWallet();
  const activeAccount = useActiveAccount();

  // State for button actions
  const [isProcessing, setIsProcessing] = useState<Record<string, boolean>>({}); // e.g. { `override-${proposal.id}`: true }
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [justification, setJustification] = useState<string>("");
  const [showJustificationModal, setShowJustificationModal] = useState<string | null>(null); // Stores proposalId for modal

  // New state for the Stake for VRDI modal
  const [showStakeModalForVRDI, setShowStakeModalForVRDI] = useState<string | null>(null); // Stores vrdiId
  const [stakeInputs, setStakeInputs] = useState<{ holderAddress: string; amount: string }[]>([{ holderAddress: '', amount: '' }]);
  const [stakeInputMode, setStakeInputMode] = useState<'manual' | 'array'>('manual');
  const [stakeArrayText, setStakeArrayText] = useState<string>(
    `[
  { "holderAddress": "0x...", "amount": "10" },
  { "holderAddress": "0x...", "amount": "20" }
]`
  );

  // State for additional data for stake modal
  const [mkvliTokenDecimals, setMkvliTokenDecimals] = useState<number | null>(null);
  const [currentRedemptionPrice, setCurrentRedemptionPrice] = useState<bigint | null>(null);
  const [isLoadingExtraData, setIsLoadingExtraData] = useState<boolean>(false);

  // New state for High Table role check
  const [isHighTableMember, setIsHighTableMember] = useState<boolean>(false);
  const [checkingHighTable, setCheckingHighTable] = useState<boolean>(true);

  // Determine if we are on testnet or mainnet
  const isTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';

  // Memoized contract instance for whichever chain the user selected
  const diamondContract = useMemo(() => getContract({
    client,
    chain: isTestnet ? baseSepolia : base,
    address: diamondAddress,
    abi: diamondAbi,
  }), [isTestnet, diamondAddress]);

  // HUD Data Calculation
  const hudData = useMemo(() => {
    const activeProposalsList = proposals.filter(p => p.status !== 'prop_executed_closed' && p.status !== 'prop_finalized');
    const activeVRDIsList = vrdis.filter(v => v.status !== 'vrdi_closed');

    const proposalsReadyForHT = activeProposalsList.filter(p => p.status === 'prop_committee_approved').length;

    const vrdisReadyForActivation = activeVRDIsList.filter(v =>
      !v.isClosed &&
      v.phases &&
      v.phases.length > 0 &&
      v.currentPhaseIndex < v.phases.length && // Ensure currentPhaseIndex is valid
      v.phases[v.currentPhaseIndex]?.isComplete &&
      v.currentPhaseIndex < v.phases.length - 1
    ).length;

    return {
      totalActiveProposals: activeProposalsList.length,
      totalActiveVRDIs: activeVRDIsList.length,
      proposalsReadyForHT,
      vrdisReadyForActivation,
    };
  }, [proposals, vrdis]);

  // Debounce for success/error messages
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, error]);

  // Effect to check if the connected account is a High Table member
  useEffect(() => {
    const checkRole = async () => {
      if (!activeAccount?.address || !diamondContract) {
        setIsHighTableMember(false);
        setCheckingHighTable(false);
        return;
      }
      setCheckingHighTable(true);
      try {
        const highTableRoleString = await readContract({
          contract: diamondContract,
          method: "HIGH_TABLE", // Assuming this method returns the role string bytes32
          params: []
        });
        const hasRole = await readContract({
          contract: diamondContract,
          method: "hasRole",
          params: [highTableRoleString, activeAccount.address]
        });
        setIsHighTableMember(!!hasRole);
      } catch (e) {
        console.error("Error checking High Table role:", e);
        setIsHighTableMember(false);
      } finally {
        setCheckingHighTable(false);
      }
    };
    checkRole();
  }, [activeAccount?.address]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setIsLoadingExtraData(true);
    setError(null);
    try {
      // Fetch MKVLI token metadata (for decimals) and redemption price first
      try {
        const metadata = await TSPABI.getTokenMetadata();
        if (metadata && typeof metadata.decimals === 'number') {
          setMkvliTokenDecimals(metadata.decimals);
        } else {
          console.warn("HighTablePanel: Could not fetch MKVLI decimals, defaulting.");
          setMkvliTokenDecimals(0); // Default or handle error appropriately
        }
      } catch (e) {
        console.error("HighTablePanel: Error fetching MKVLI metadata", e);
        setMkvliTokenDecimals(0); // Default or handle error appropriately
      }

      try {
        const price = await TSPABI.calculateRedemptionPrice();
        setCurrentRedemptionPrice(price);
      } catch (e) {
        console.error("HighTablePanel: Error fetching redemption price", e);
        setCurrentRedemptionPrice(null);
      }
      setIsLoadingExtraData(false); // Done fetching extra data

      // Fetch Proposals
      const nextProposalIdBigInt = await readContract({
        contract: diamondContract,
        method: 'getNextProposalId',
        params: []
      });
      const nextProposalId = Number(nextProposalIdBigInt);
      const fetchedProposals: Proposal[] = [];
      const proposalLookback = Math.min(nextProposalId > 0 ? nextProposalId : 0, 20);
      for (let i = 0; i < proposalLookback; i++) {
        const proposalIdToFetch = BigInt(nextProposalId - 1 - i);
        if (proposalIdToFetch < 0n) break;
        try {
          const proposalDataArray = await readContract({
            contract: diamondContract,
            method: 'getProposalDetails',
            params: [proposalIdToFetch]
          }) as unknown as readonly [string, string, readonly string[], boolean, boolean, bigint, any, bigint, boolean, string];
          const details = {
            submitter: proposalDataArray[0],
            documentLink: proposalDataArray[1],
            assignedCommittees: proposalDataArray[2],
            highTableApproved: proposalDataArray[3],
            highTableVetoed: proposalDataArray[4],
            dioId: proposalDataArray[5],
            dioParams: proposalDataArray[6],
            totalMKVLI20: proposalDataArray[7],
            highTableOverride: proposalDataArray[8],
            highTableJustification: proposalDataArray[9]
          };
          let committeeApprovals: Record<string, boolean> = {};
          if (details.assignedCommittees && details.assignedCommittees.length > 0) {
            for (const committee of details.assignedCommittees) {
              try {
                const approved = await readContract({
                  contract: diamondContract,
                  method: 'getCommitteeApproval',
                  params: [proposalIdToFetch, committee]
                });
                committeeApprovals[committee] = !!approved;
              } catch {
                committeeApprovals[committee] = false;
              }
            }
          }

          const committeeDetailsForProposal: Array<{ id: string; approved: boolean }> = [];
          if (details.assignedCommittees) {
            for (const committeeId of details.assignedCommittees) {
              committeeDetailsForProposal.push({
                id: committeeId,
                approved: committeeApprovals[committeeId] === true
              });
            }
          }

          fetchedProposals.push({
            id: proposalIdToFetch.toString(),
            title: `Proposal #${proposalIdToFetch.toString()}`,
            status: getProposalStatus(details, committeeApprovals),
            description: details.documentLink ? `${details.documentLink.substring(0, 50)}...` : 'No document link.',
            submitter: details.submitter,
            documentLink: details.documentLink,
            assignedCommittees: details.assignedCommittees,
            committeeApprovalDetails: committeeDetailsForProposal,
            highTableApproved: details.highTableApproved,
            highTableVetoed: details.highTableVetoed,
            dioId: details.dioId && BigInt(details.dioId.toString()) > 0n ? details.dioId.toString() : undefined,
            rawData: proposalDataArray,
          });
        } catch (e) {
          // Ignore individual proposal fetch errors
        }
      }
      setProposals(fetchedProposals.filter(p => p.status !== 'prop_executed_closed' && p.status !== 'prop_finalized'));

      // Fetch VRDIs
      const nextVRDIIdBigInt = await readContract({
        contract: diamondContract,
        method: 'getNextVRDIId',
        params: []
      });
      const nextVRDIId = Number(nextVRDIIdBigInt);
      const fetchedVrdis: VRDI[] = [];
      const vrdiLookback = Math.min(nextVRDIId > 0 ? nextVRDIId : 0, 20);
      for (let i = 0; i < vrdiLookback; i++) {
        const vrdiIdToFetch = BigInt(nextVRDIId - 1 - i);
        if (vrdiIdToFetch < 0n) break;
        try {
          const detailsFromContract = await readContract({
            contract: diamondContract,
            method: 'getVRDIDetails',
            params: [vrdiIdToFetch]
          });
          let vrdiOverallAssignedCommittees: readonly string[] | undefined = undefined;
          if (detailsFromContract.dioId && BigInt(detailsFromContract.dioId.toString()) > 0n) {
            const originalProposalId = detailsFromContract.dioId;
            try {
              const proposalDataArray = await readContract({
                contract: diamondContract,
                method: 'getProposalDetails',
                params: [originalProposalId]
              }) as any;

              if (proposalDataArray && proposalDataArray[2] && Array.isArray(proposalDataArray[2])) {
                vrdiOverallAssignedCommittees = proposalDataArray[2] as readonly string[];
              } else {
                // console.warn(`HighTablePanel: No assigned committees found in proposal ${originalProposalId} for VRDI ${vrdiIdToFetch}`);
              }
            } catch (e) {
              console.warn(`HighTablePanel: Could not fetch proposal details for original proposal ${originalProposalId} (VRDI ${vrdiIdToFetch})`, e);
            }
          } else {
            // console.log(`HighTablePanel: VRDI ${vrdiIdToFetch} has no valid dioId to fetch original proposal committees.`);
          }
          let stakedTokenCount = 0;
          if (detailsFromContract && detailsFromContract.dioId !== undefined) {
            try {
              const dioInfoArr = await readContract({
                contract: diamondContract,
                method: 'getDIOInfo',
                params: [detailsFromContract.dioId]
              }) as readonly [bigint, bigint, readonly bigint[]];
              const [, stakedTokenCountBigInt] = dioInfoArr;
              stakedTokenCount = stakedTokenCountBigInt ? Number(stakedTokenCountBigInt) : 0;
            } catch (e) {
              stakedTokenCount = 0;
            }
          }
          if (detailsFromContract && typeof detailsFromContract.isClosed === 'boolean' && typeof detailsFromContract.isFrozen === 'boolean') {
            const phasesTuple = await readContract({
              contract: diamondContract,
              method: 'getVRDIPhases',
              params: [vrdiIdToFetch]
            }) as unknown as readonly [readonly bigint[], readonly boolean[], readonly boolean[], string[], readonly bigint[], readonly bigint[]];
            const formattedPhases: VRDIPhase[] = [];
            if (phasesTuple && phasesTuple[0] && phasesTuple[0].length > 0) {
              const phaseAmountsUSDC = phasesTuple[0];
              const isActiveArray = phasesTuple[1] || [];
              const isCompleteArray = phasesTuple[2] || [];
              const evidenceLinksArray = phasesTuple[3] || [];
              const withdrawnAmountsUSDC = phasesTuple[4] || [];
              const completionTimestampsArray = phasesTuple[5] || [];
              for (let index = 0; index < phaseAmountsUSDC.length; index++) {
                const amount = phaseAmountsUSDC[index];
                const actualTimestamp = completionTimestampsArray[index];
                const hasActualCompletionTimestamp = actualTimestamp && BigInt(actualTimestamp.toString()) > 0n; // Ensure BigInt comparison

                let phaseIsComplete = false;
                let phaseIsActive = false;
                let completionTimestampDisplay: string | undefined = undefined;
                let phaseCommitteeApprovalDetails: Array<{ committeeId: string; approved: boolean; statusText: string }> | undefined = undefined;

                if (hasActualCompletionTimestamp) {
                  phaseIsComplete = true;
                  phaseIsActive = false;
                  completionTimestampDisplay = new Date(Number(actualTimestamp) * 1000).toLocaleDateString();
                } else if (detailsFromContract.isClosed) {
                  phaseIsComplete = true;
                  phaseIsActive = false;
                  completionTimestampDisplay = 'VRDI Closed';
                } else {
                  phaseIsComplete = isCompleteArray[index] === true;
                  phaseIsActive = isActiveArray[index] === true;
                  if (phaseIsActive) {
                    phaseIsComplete = false; // Active phase cannot be simultaneously complete for this logic
                  }
                }

                // DETAILED LOGGING FOR THE CONDITION (Keep for this test)
                const shouldDisplayCommitteeSection =
                  vrdiOverallAssignedCommittees && vrdiOverallAssignedCommittees.length > 0;

                if (shouldDisplayCommitteeSection) {
                  let fetchedApprovalsMap = new Map<string, boolean>();
                  let fetchErrorOccurred = false;

                  // Determine if we should even attempt to fetch granular approvals from the contract for this phase
                  const allowFetchForThisPhase = !(detailsFromContract.isClosed && !hasActualCompletionTimestamp && phaseIsComplete);

                  if (allowFetchForThisPhase) {
                    try {
                      const approvalStatusesFromContract = await readContract({
                        contract: diamondContract,
                        method: "getVRDIPhaseAllCommitteeApprovals",
                        params: [vrdiIdToFetch, BigInt(index)]
                      }) as unknown as Array<{ committeeName: string; isApproved: boolean }>;

                      if (approvalStatusesFromContract && approvalStatusesFromContract.length > 0) {
                        approvalStatusesFromContract.forEach(status => {
                          fetchedApprovalsMap.set(status.committeeName, status.isApproved);
                        });
                      }
                    } catch (e) {
                      console.warn(`HighTablePanel: Call to getVRDIPhaseAllCommitteeApprovals failed for VRDI ${vrdiIdToFetch}, Phase ${index}:`, e);
                      fetchErrorOccurred = true;
                    }
                  } else {
                    // If not allowing fetch (e.g., auto-closed phase), treat as if fetch error occurred
                    // to guide status text, or set a specific status like "N/A (VRDI Closed)"
                    fetchErrorOccurred = true;
                  }

                  phaseCommitteeApprovalDetails = vrdiOverallAssignedCommittees!.map(committeeId => {
                    const isApprovedFromMap = fetchedApprovalsMap.get(committeeId) === true;
                    let statusText = "";

                    if (!allowFetchForThisPhase) {
                      statusText = "N/A (VRDI Closed)";
                    } else if (fetchErrorOccurred) {
                      statusText = "Approval Status Unavailable";
                    } else if (fetchedApprovalsMap.has(committeeId)) {
                      statusText = isApprovedFromMap ? "Approved by Committee" : "Review Pending/Rejected";
                    } else {
                      // No specific status from contract for this committee for this phase
                      if (phaseIsComplete) {
                        statusText = "N/A (Phase Complete)";
                      } else {
                        statusText = evidenceLinksArray[index] ? "Pending Committee Approval" : "Pending Evidence Submission";
                      }
                    }

                    return {
                      committeeId: committeeId,
                      approved: phaseIsComplete ? true : isApprovedFromMap,
                      statusText: statusText
                    };
                  });
                }

                formattedPhases.push({
                  amount: typeof amount === 'bigint' ? ethers.formatUnits(amount, USDC_DECIMALS) : '0.00',
                  isActive: phaseIsActive,
                  isComplete: phaseIsComplete,
                  evidenceLink: evidenceLinksArray[index] || undefined,
                  completionTimestamp: completionTimestampDisplay,
                  committeeApprovalDetails: phaseCommitteeApprovalDetails,
                });
              }
            }
            let totalWithdrawnForVRDISmallestUnit = 0n;
            if (phasesTuple && phasesTuple[4]) {
              for (const amount of phasesTuple[4]) {
                if (typeof amount === 'bigint') {
                  totalWithdrawnForVRDISmallestUnit += amount;
                }
              }
            }
            const totalWithdrawnDisplay = ethers.formatUnits(totalWithdrawnForVRDISmallestUnit, USDC_DECIMALS);
            const phasesData = {
              phaseAmountsUSDC: phasesTuple[0],
              isActive: phasesTuple[1],
              isComplete: phasesTuple[2],
              evidenceLinks: phasesTuple[3],
              withdrawnAmountsUSDC: phasesTuple[4],
              completionTimestamps: phasesTuple[5],
            };
            const derivedStatus = getVRDIStatus(detailsFromContract, phasesData, stakedTokenCount);
            fetchedVrdis.push({
              id: vrdiIdToFetch.toString(),
              debtor: detailsFromContract.debtor,
              totalRepaymentAmount: typeof detailsFromContract.totalRepaymentAmount === 'bigint' ? ethers.formatUnits(detailsFromContract.totalRepaymentAmount, USDC_DECIMALS) : 'N/A',
              principalUSDC: typeof detailsFromContract.principalUSDC === 'bigint' ? ethers.formatUnits(detailsFromContract.principalUSDC, USDC_DECIMALS) : 'N/A',
              principalMKVLI20: typeof detailsFromContract.principalMKVLI20 === 'bigint' ? detailsFromContract.principalMKVLI20.toString() : 'N/A',
              interestRate: typeof detailsFromContract.interestRate === 'bigint' ? (Number(detailsFromContract.interestRate) / 100).toFixed(2) + '%' : 'N/A',
              currentPhaseIndex: typeof detailsFromContract.activePhaseIndex === 'bigint' ? Number(detailsFromContract.activePhaseIndex) : 0,
              phases: formattedPhases,
              status: derivedStatus,
              totalWithdrawnDisplay: totalWithdrawnDisplay,
              isFrozen: detailsFromContract.isFrozen,
              isClosed: detailsFromContract.isClosed,
              startTimestamp: typeof detailsFromContract.startTimestamp === 'bigint' && detailsFromContract.startTimestamp > 0n ? new Date(Number(detailsFromContract.startTimestamp) * 1000).toLocaleDateString() : undefined,
              rawDataDetails: detailsFromContract,
              rawDataPhases: phasesTuple,
              stakedTokenCount,
            });
          }
        } catch (e) {
          // Ignore individual VRDI fetch errors
        }
      }
      setVrdis(fetchedVrdis.filter(v => v.status !== 'vrdi_closed'));
    } catch (fetchError) {
      console.error("Error fetching panel data:", fetchError);
      setError("Failed to load proposals and VRDIs. Please try again later.");
    } finally {
      setLoading(false);
      setIsLoadingExtraData(false); // Ensure this is also set false in finally
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]); // Correctly call fetchData on mount and when it changes (though it shouldn't change due to useCallback with [] deps)

  // Placeholder for a generic transaction handler
  const handleTransaction = async (actionType: string, entityId: string, contractCall: any, successMsg: string, ...args: any[]) => {
    if (!activeAccount || !activeAccount.address || !activeWallet) {
      setError("Please connect your wallet.");
      return;
    }
    const processingKey = `${actionType}-${entityId}`;
    setIsProcessing(prev => ({ ...prev, [processingKey]: true }));
    setError(null);
    setSuccessMessage(null);

    try {
      const transaction = prepareContractCall(contractCall);
      const { transactionHash } = await sendAndConfirmTransaction({ transaction, account: activeAccount });
      setSuccessMessage(`${successMsg} (Tx: ${transactionHash.substring(0, 6)}...${transactionHash.substring(transactionHash.length - 4)})`);
      fetchData(); // Refresh data
    } catch (err: any) {
      console.error(`Raw error object during ${actionType} for ${entityId}:`, JSON.stringify(err, Object.getOwnPropertyNames(err), 2));

      let detailedMessage = "An unexpected error occurred.";
      if (err.reason) {
        detailedMessage = err.reason;
      } else if (err.message) {
        detailedMessage = err.message;
      } else if (err.data && typeof err.data === 'string' && err.data.startsWith("Reverted with reason string 'Hello'")) {
        // Attempt to parse newer Ethers v6 style revert reason (less common with thirdweb direct calls but good to check)
        try {
          const match = err.data.match(/'([^']*)'/);
          if (match && match[1]) detailedMessage = match[1];
        } catch { }
      } else if (err.data && err.data.message) {
        detailedMessage = err.data.message;
      } else if (typeof err.error?.message === 'string') { // For errors wrapped by some providers
        detailedMessage = err.error.message;
      } else if (typeof err === 'string') {
        detailedMessage = err;
      }

      if (err.code) detailedMessage += ` (Code: ${err.code})`;
      // For thirdweb specific errors, they often have a name and details
      if (err.name && err.name !== "Error") detailedMessage = `${err.name}: ${detailedMessage}`;
      if (err.details) detailedMessage += ` Details: ${err.details}`;


      setError(`Failed to ${actionType.replace('_', ' ')} ${entityId}. ${detailedMessage}`);
    } finally {
      setIsProcessing(prev => ({ ...prev, [processingKey]: false }));
    }
  };

  const handleOverrideCommittee = async (proposalId: string) => {
    if (!justification.trim()) {
      setError("Justification cannot be empty.");
      return;
    }
    await handleTransaction(
      'override_committee',
      proposalId,
      {
        contract: diamondContract,
        method: "overrideCommitteeApproval",
        params: [BigInt(proposalId), justification],
      },
      `Proposal ${proposalId} committee override successful.`
    );
    setShowJustificationModal(null);
    setJustification("");
  };

  const handleVetoProposal = async (proposalId: string, vetoStatus: boolean) => {
    await handleTransaction(
      vetoStatus ? 'veto_proposal' : 'unveto_proposal',
      proposalId,
      {
        contract: diamondContract,
        method: "vetoProposal",
        params: [BigInt(proposalId), vetoStatus],
      },
      `Proposal ${proposalId} ${vetoStatus ? 'veto' : 'un-veto'} successful.`
    );
  };

  const handleFreezeVRDI = async (vrdiId: string) => {
    await handleTransaction(
      'freeze_vrdi',
      vrdiId,
      {
        contract: diamondContract,
        method: "freezeVRDI",
        params: [BigInt(vrdiId)],
      },
      `VRDI ${vrdiId} freeze successful.`
    );
  };

  const handleUnfreezeVRDI = async (vrdiId: string) => {
    await handleTransaction(
      'unfreeze_vrdi',
      vrdiId,
      {
        contract: diamondContract,
        method: "unfreezeVRDI",
        params: [BigInt(vrdiId)],
      },
      `VRDI ${vrdiId} unfreeze successful.`
    );
  };

  const handleActivateNextPhase = async (vrdiId: string) => {
    await handleTransaction(
      'activate_next_phase',
      vrdiId,
      {
        contract: diamondContract,
        method: "activateNextPhase",
        params: [BigInt(vrdiId)],
      },
      `VRDI ${vrdiId} next phase activated.`
    );
  };

  // --- Handlers for StakeForVRDI Modal ---
  const handleAddStakeInput = () => {
    setStakeInputs([...stakeInputs, { holderAddress: '', amount: '' }]);
  };

  const handleRemoveStakeInput = (index: number) => {
    const newInputs = stakeInputs.filter((_, i) => i !== index);
    setStakeInputs(newInputs);
  };

  const handleStakeInputChange = (index: number, field: 'holderAddress' | 'amount', value: string) => {
    const newInputs = [...stakeInputs];
    newInputs[index][field] = value;
    setStakeInputs(newInputs);
  };

  const handleConfirmStakeForVRDI = async (vrdiId: string) => {
    if (!activeAccount || !activeAccount.address || !activeWallet) {
      setError("Please connect your wallet.");
      return;
    }

    let processedStakeInputs: { holderAddress: string; amount: string }[] = [];

    if (stakeInputMode === 'array') {
      try {
        const parsedInputs = JSON.parse(stakeArrayText);
        if (!Array.isArray(parsedInputs) || !parsedInputs.every(item => typeof item === 'object' && item !== null && 'holderAddress' in item && 'amount' in item)) {
          setError("Invalid array format. Expected an array of objects with 'holderAddress' and 'amount' properties.");
          return;
        }
        processedStakeInputs = parsedInputs;
      } catch (e) {
        setError("Failed to parse JSON array. Please check the format.");
        return;
      }
    } else {
      processedStakeInputs = stakeInputs;
    }

    if (processedStakeInputs.length === 0) {
      setError("No staking data provided.");
      return;
    }

    const MAX_ITEMS_PER_TX = 15; // Example batch size, adjust as needed for Base network
    if (processedStakeInputs.length > MAX_ITEMS_PER_TX) {
      setError(`Too many entries for a single transaction. Please limit to ${MAX_ITEMS_PER_TX} holders at a time, or use multiple smaller batches.`);
      return;
    }

    const holders: string[] = [];
    const amountsToStake: bigint[] = [];

    for (const input of processedStakeInputs) {
      if (!ethers.isAddress(input.holderAddress)) {
        setError(`Invalid address: ${input.holderAddress}`);
        return;
      }
      const amountNumber = parseFloat(input.amount);
      if (isNaN(amountNumber) || amountNumber <= 0) {
        setError(`Invalid amount for ${input.holderAddress}: ${input.amount}. Amount must be a positive number.`);
        return;
      }
      holders.push(input.holderAddress);
      // Assuming stake amounts are in whole tokens (MKVLI has 0 decimals as per typical NFT/utility token)
      // If MKVLI had decimals, you would use ethers.parseUnits(input.amount, mkvliDecimals)
      amountsToStake.push(BigInt(Math.floor(amountNumber))); // Use Math.floor for safety if decimals are pasted
    }

    await handleTransaction(
      'stake_for_vrdi',
      vrdiId,
      {
        contract: diamondContract,
        method: "stakeForVRDI",
        params: [BigInt(vrdiId), holders, amountsToStake],
      },
      `Staking for VRDI ${vrdiId} successful.`
    );
    setShowStakeModalForVRDI(null);
    setStakeInputs([{ holderAddress: '', amount: '' }]); // Reset for next time
    setStakeArrayText(
      `[
  { "holderAddress": "0x...", "amount": "10" },
  { "holderAddress": "0x...", "amount": "20" }
]`
    );
    setStakeInputMode('manual'); // Reset mode
  };

  return (
    <div className="relative w-full h-full flex flex-col ultra-glass border-none text-zinc-300 text-xs font-sans rounded-3xl overflow-hidden">
      {/* Title Bar */}
      <div className="w-full h-12 flex items-center justify-between px-6 border-b border-white/5 bg-zinc-950/40 backdrop-blur-md flex-shrink-0">
        <h1 className="text-sm font-medium text-zinc-100 tracking-tight flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-fuchsia-500 shadow-[0_0_8px_rgba(217,70,239,0.5)]"></span>
          The High Table Commands
        </h1>
        {/* Close handled by parent toggle */}
      </div>

      {/* Sticky HUD Area */}
      <div className="w-full p-2 bg-zinc-950/40 backdrop-blur-sm border-b border-white/5 shadow-sm flex-shrink-0 z-10">
        {(loading || checkingHighTable) ? (
          <p className="text-center text-zinc-500 text-[10px] font-mono animate-pulse">Scanning Authority...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center max-w-4xl mx-auto">
            <div>
              <p className="text-zinc-500 text-[9px] uppercase tracking-widest mb-0.5">Active Props</p>
              <p className="text-fuchsia-300 font-bold text-sm font-mono">{hudData.totalActiveProposals}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-[9px] uppercase tracking-widest mb-0.5">Pending HT</p>
              <p className="text-fuchsia-300 font-bold text-sm font-mono">{hudData.proposalsReadyForHT}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-[9px] uppercase tracking-widest mb-0.5">Active VRDIs</p>
              <p className="text-cyan-300 font-bold text-sm font-mono">{hudData.totalActiveVRDIs}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-[9px] uppercase tracking-widest mb-0.5">Action Ready</p>
              <p className="text-emerald-400 font-bold text-sm font-mono">{hudData.vrdisReadyForActivation}</p>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area (Proposals & VRDIs Columns) */}
      <div className="flex-grow flex flex-col md:flex-row gap-4 p-4 overflow-hidden bg-transparent">
        {/* Error/Success Messages */}
        {error && <div className="fixed top-20 right-4 bg-red-950/90 border border-red-500/30 text-red-200 px-4 py-2 rounded-md shadow-xl z-50 text-xs backdrop-blur-md flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>{error}</div>}
        {successMessage && <div className="fixed top-20 right-4 bg-emerald-950/90 border border-emerald-500/30 text-emerald-200 px-4 py-2 rounded-md shadow-xl z-50 text-xs backdrop-blur-md flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>{successMessage}</div>}

        {/* Proposals Column */}
        <div className="flex-1 flex flex-col min-h-0 bg-transparent rounded-lg overflow-hidden">
          <div className="p-3 border-b border-white/5 flex justify-between items-center bg-zinc-950/40">
            <h2 className="text-zinc-100 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <span className="text-fuchsia-500">◆</span> Proposals
            </h2>
            <span className="text-[10px] text-zinc-500 font-mono">{proposals.length} ITEMS</span>
          </div>
          <div className="overflow-y-auto flex-grow p-3 space-y-3 styled-scrollbar">
            {loading || checkingHighTable ? <div className="text-center py-8 text-zinc-600 font-mono text-xs">Loading Data...</div> : proposals.length === 0 ? <div className="text-zinc-600 text-center py-8 text-xs italic">No active proposals found.</div> : proposals.map((proposal) => (
              <div key={proposal.id} className="ultra-glass ultra-glass-hover p-5 group">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-mono text-[10px] text-zinc-500">ID: {proposal.id}</span>
                  <StatusBadge status={proposal.status} type="proposal" />
                </div>
                <h3 className="font-medium text-zinc-200 text-xs mb-1 group-hover:text-fuchsia-300 transition-colors">{proposal.title}</h3>
                <p className="text-[10px] text-zinc-400 mb-3 line-clamp-2">{proposal.description}</p>

                {/* Proposal Actions */}
                <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                  {proposal.documentLink && (
                    <a href={proposal.documentLink} target="_blank" rel="noopener noreferrer" className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[9px] rounded border border-zinc-700 uppercase tracking-wide">
                      View Doc
                    </a>
                  )}

                  {/* Override Committee Button (High Table Super Power) */}
                  {isHighTableMember && !proposal.dioId && !proposal.highTableVetoed && (
                    <button
                      onClick={() => { setShowJustificationModal(proposal.id); setJustification(""); }}
                      disabled={isProcessing[`override_committee-${proposal.id}`]}
                      className="ml-auto px-2 py-1 bg-amber-950/30 hover:bg-amber-900/40 text-amber-500 border border-amber-900/30 hover:border-amber-700 text-[9px] rounded uppercase tracking-wide transition-colors"
                    >
                      Override
                    </button>
                  )}
                </div>

                {/* Status-Specific Actions */}
                {isHighTableMember && !proposal.dioId && !proposal.highTableVetoed && (
                  (proposal.status === 'prop_committee_approved' || proposal.status === 'prop_hightable_approved') && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={() => handleVetoProposal(proposal.id, true)}
                        disabled={isProcessing[`veto_proposal-${proposal.id}`]}
                        className="px-2 py-1.5 bg-red-950/20 hover:bg-red-900/40 border border-red-900/30 text-red-400 text-[10px] rounded font-medium transition-colors flex justify-center"
                      >
                        {isProcessing[`veto_proposal-${proposal.id}`] ? <CircularProgress size={10} color="inherit" /> : 'VETO'}
                      </button>
                      {/* Finalize button removed as it requires complex modal logic not present in this panel */}
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        {/* VRDIs Column */}
        <div className="flex-[1.5] flex flex-col min-h-0 bg-white/[0.02] rounded-lg border border-white/5 overflow-hidden">
          <div className="p-3 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <h2 className="text-zinc-100 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <span className="text-cyan-500">❖</span> VRDI Oversight
            </h2>
            <span className="text-[10px] text-zinc-500 font-mono">{vrdis.length} ACTIVE</span>
          </div>
          <div className="overflow-y-auto flex-grow p-3 space-y-3 styled-scrollbar">
            {loading ? <div className="text-center py-8 text-zinc-600 font-mono text-xs">Loading VRDIs...</div> : vrdis.length === 0 ? <div className="text-zinc-600 text-center py-8 text-xs italic">No active VRDIs.</div> : vrdis.map((vrdi) => (
              <div key={vrdi.id} className="bg-zinc-900/40 border border-white/5 hover:border-cyan-500/30 rounded-lg p-3 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-zinc-200 font-bold">VRDI #{vrdi.id}</span>
                      {/* Phase Indicator */}
                      <div className="flex items-center gap-0.5">
                        {vrdi.phases.map((_, i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < vrdi.currentPhaseIndex ? 'bg-emerald-500' : i === vrdi.currentPhaseIndex ? 'bg-amber-500 animate-pulse' : 'bg-zinc-800'}`}></div>
                        ))}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono block mt-0.5">{vrdi.debtor.substring(0, 6)}...{vrdi.debtor.substring(38)}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={vrdi.status} type="vrdi" />
                    <div className="text-[10px] text-zinc-400 font-mono">
                      {vrdi.totalWithdrawnDisplay} / {vrdi.principalUSDC} USDC
                    </div>
                  </div>
                </div>

                {/* Detailed Stats Row */}
                <div className="grid grid-cols-4 gap-2 mb-3 bg-zinc-950/30 rounded p-2 border border-white/5">
                  <div>
                    <span className="text-[9px] text-zinc-500 block uppercase">Tokens Staked</span>
                    <span className="text-[11px] text-zinc-200 font-mono">{vrdi.stakedTokenCount || 0}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-zinc-500 block uppercase">Interest</span>
                    <span className="text-[11px] text-zinc-200 font-mono">{vrdi.interestRate}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[9px] text-zinc-500 block uppercase">Next Phase Check</span>
                    <span className="text-[10px] text-zinc-300 font-mono flex items-center gap-1">
                      Phase {vrdi.currentPhaseIndex + 1}:
                      <span className={vrdi.phases[vrdi.currentPhaseIndex]?.isComplete ? 'text-emerald-400' : 'text-amber-400'}>
                        {vrdi.phases[vrdi.currentPhaseIndex]?.isComplete ? ' COMPLETE' : ' IN PROGRESS'}
                      </span>
                    </span>
                  </div>
                </div>

                {/* VRDI Actions */}
                {isHighTableMember && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => {
                        setShowStakeModalForVRDI(vrdi.id);
                        setStakeInputs([{ holderAddress: '', amount: '' }]);
                      }}
                      className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] font-medium border border-zinc-700 transition-colors"
                    >
                      Stake
                    </button>

                    {vrdi.isFrozen ? (
                      <button
                        onClick={() => handleUnfreezeVRDI(vrdi.id)}
                        disabled={isProcessing[`unfreeze_vrdi-${vrdi.id}`]}
                        className="px-3 py-1 bg-emerald-950/20 hover:bg-emerald-900/40 text-emerald-400 rounded text-[10px] font-medium border border-emerald-900/30 transition-colors"
                      >
                        {isProcessing[`unfreeze_vrdi-${vrdi.id}`] ? 'Unfreezing...' : 'Unfreeze'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleFreezeVRDI(vrdi.id)}
                        disabled={isProcessing[`freeze_vrdi-${vrdi.id}`]}
                        className="px-3 py-1 bg-amber-950/20 hover:bg-amber-900/40 text-amber-500 rounded text-[10px] font-medium border border-amber-900/30 transition-colors"
                      >
                        {isProcessing[`freeze_vrdi-${vrdi.id}`] ? 'Freezing...' : 'Freeze'}
                      </button>
                    )}

                    {/* Activate Next Phase Logic */}
                    {!vrdi.isFrozen &&
                      !vrdi.isClosed &&
                      vrdi.phases[vrdi.currentPhaseIndex]?.isComplete &&
                      vrdi.currentPhaseIndex < vrdi.phases.length - 1 && (
                        <button
                          onClick={() => handleActivateNextPhase(vrdi.id)}
                          disabled={isProcessing[`activate_next_phase-${vrdi.id}`]}
                          className="ml-auto px-4 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-bold uppercase tracking-wide shadow-lg shadow-cyan-900/20 transition-all active:scale-95"
                        >
                          {isProcessing[`activate_next_phase-${vrdi.id}`] ? 'Activating...' : 'Activate Phase ' + (vrdi.currentPhaseIndex + 2)}
                        </button>
                      )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- Modals (Justification, Staking, etc.) --- */}
      {/* Justification Modal */}
      {showJustificationModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900/95 border border-amber-500/30 rounded-lg p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-amber-500 font-bold uppercase tracking-wider text-xs mb-4">Override Justification Required</h3>
            <textarea
              className="w-full bg-black/50 border border-zinc-700 rounded p-3 text-xs font-mono text-zinc-200 focus:border-amber-500/50 outline-none h-32 resize-none"
              placeholder="Enter reason for committee override..."
              value={justification}
              onChange={e => setJustification(e.target.value)}
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowJustificationModal(null)} className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-xs">Cancel</button>
              <button
                onClick={() => handleOverrideCommittee(showJustificationModal!)}
                disabled={!justification.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs rounded uppercase disabled:opacity-50"
              >
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stake Modal */}
      {showStakeModalForVRDI && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900/95 border border-white/10 rounded-xl p-6 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4 flex-shrink-0">
              <h3 className="text-zinc-100 font-medium tracking-tight text-sm">Stake for VRDI #{showStakeModalForVRDI}</h3>
              <button onClick={() => setShowStakeModalForVRDI(null)} className="text-zinc-500 hover:text-white transition-colors">&times;</button>
            </div>

            <div className="flex-grow overflow-y-auto pr-2 styled-scrollbar">
              {/* Mode Toggle */}
              <div className="flex gap-4 mb-4 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
                  <input
                    type="radio"
                    name="stakeMode"
                    checked={stakeInputMode === 'manual'}
                    onChange={() => setStakeInputMode('manual')}
                    className="accent-cyan-500"
                  />
                  Manual Entry
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-200">
                  <input
                    type="radio"
                    name="stakeMode"
                    checked={stakeInputMode === 'array'}
                    onChange={() => setStakeInputMode('array')}
                    className="accent-cyan-500"
                  />
                  JSON Array Import (Bulk)
                </label>
              </div>

              {stakeInputMode === 'manual' ? (
                <div className="space-y-3">
                  {stakeInputs.map((input, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Holder Address (0x...)"
                        className="flex-[2] bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 focus:border-cyan-500/50 outline-none"
                        value={input.holderAddress}
                        onChange={e => handleStakeInputChange(idx, 'holderAddress', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Amount"
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs font-mono text-zinc-200 focus:border-cyan-500/50 outline-none"
                        value={input.amount}
                        onChange={e => handleStakeInputChange(idx, 'amount', e.target.value)}
                      />
                      {stakeInputs.length > 1 && (
                        <button onClick={() => handleRemoveStakeInput(idx)} className="text-red-500 hover:text-red-400 font-bold px-2">&times;</button>
                      )}
                    </div>
                  ))}
                  <button onClick={handleAddStakeInput} className="text-cyan-500 hover:text-cyan-400 text-xs font-bold uppercase tracking-wide mt-2">+ Add Another Holder</button>
                </div>
              ) : (
                <div className="h-48">
                  <textarea
                    className="w-full h-full bg-zinc-950 border border-zinc-800 rounded p-3 text-xs font-mono text-zinc-300 focus:border-cyan-500/50 outline-none resize-none"
                    value={stakeArrayText}
                    onChange={e => setStakeArrayText(e.target.value)}
                  />
                </div>
              )}

              {isProcessing[`stake_for_vrdi-${showStakeModalForVRDI}`] && (
                <div className="mt-4 p-3 bg-zinc-800/50 rounded flex items-center justify-center text-xs text-zinc-400">
                  <CircularProgress size={14} color="inherit" sx={{ mr: 2 }} /> Processing Staking Transaction...
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex justify-end gap-3 flex-shrink-0">
              <button onClick={() => setShowStakeModalForVRDI(null)} className="px-4 py-2 text-zinc-500 hover:text-white text-xs transition-colors">Cancel</button>
              <button
                onClick={() => handleConfirmStakeForVRDI(showStakeModalForVRDI)}
                disabled={isProcessing[`stake_for_vrdi-${showStakeModalForVRDI}`]}
                className="px-6 py-2 bg-zinc-100 hover:bg-white text-black font-bold text-xs rounded shadow-lg uppercase tracking-wide disabled:opacity-50"
              >
                Confirm Stake
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HighTablePanel;