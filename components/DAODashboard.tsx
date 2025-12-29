'use client';
import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import * as TSPABI from './core/TSPABI';
import { getContract, readContract, prepareContractCall, sendAndConfirmTransaction } from "thirdweb";
import { generateDAOMesh } from './utils/generativeDesign';
import { useActiveWallet, useActiveAccount } from 'thirdweb/react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, CircularProgress, Select, MenuItem, InputLabel, FormControl } from '@mui/material';
import { base, baseSepolia } from 'thirdweb/chains';
import { client, diamondAddress, default as diamondAbi } from './core/TSPABI';

import HighTablePanel from './HighTablePanel';
import DebtHolderPanel from './DebtHolderPanel';
// Assuming types might be part of the main contract ABI export or generated elsewhere.
// If RENSNCEDAOSTRG and RENSNCERPSTRY are specific type namespaces from your ABI, ensure they are accessible.
// For now, we will use the general return types inferred by readContract or define them more generically if needed.

const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`; // Define MONO_FONT_FAMILY

// --- Interfaces (Refined based on ABI) ---
interface Proposal {
  id: string;
  title: string;
  status: string;
  description?: string;
  submitter?: string;
  documentLink?: string;
  assignedCommittees?: readonly string[];
  highTableApproved?: boolean;
  highTableVetoed?: boolean;
  dioId?: string;
  rawData?: any; // To store raw contract output for getProposalDetails
}

interface VRDIPhase {
  amount: string;
  isActive: boolean;
  isComplete: boolean;
  evidenceLink?: string;
  completionTimestamp?: string;
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
  totalWithdrawnDisplay?: string; // To store formatted total withdrawn USDC
  rawDataDetails?: any; // To store raw contract output for getVRDIDetails
  rawDataPhases?: any;  // To store raw contract output for getVRDIPhases
  stakedTokenCount?: number; // Optional staked token count for debugging/inspection
}

// Interface for the structure returned by getVRDIDetails
interface VRDIDetailsFromContract {
  dioId: bigint;
  principalUSDC: bigint;
  principalMKVLI20: bigint;
  interestRate: bigint;
  totalRepaymentAmount: bigint;
  debtor: string;
  isFrozen: boolean;
  isClosed: boolean;
  depositedUSDC: bigint;
  startTimestamp: bigint;
  amortizationDuration: bigint;
  deferralPeriod: bigint;
  activePhaseIndex: bigint;
  // Add any other fields if present in the actual returned struct
}

// --- KANBAN Column Definitions --- (Updated)
const KANBAN_COLUMNS = {
  proposals: [
    { id: 'prop_pending_review', title: 'PENDING REVIEW' },
    { id: 'prop_committee_assigned', title: 'COMMITTEE ASSIGNED' },
    { id: 'prop_committee_approved', title: 'COMMITTEE APPROVED' }, // Approved by all assigned committees
    { id: 'prop_hightable_approved', title: 'HIGH TABLE APPROVED' }, // Approved by high table, pre-finalization
    { id: 'prop_finalized', title: 'FINALIZED (DIO INITIATED)' }, // DIO created
    // Removed 'EXECUTED / CLOSED' as per request
  ],
  vrdis: [
    { id: 'vrdi_pending_first_withdrawal', title: 'PENDING 1ST WITHDRAWAL' },
    { id: 'vrdi_active_disbursing', title: 'ACTIVE - DISBURSING' },
    { id: 'vrdi_repayment', title: 'REPAYMENT PHASE' }, // Needs logic
    { id: 'vrdi_frozen', title: 'FROZEN' },
    { id: 'vrdi_closed', title: 'CLOSED/COMPLETED' },
  ],
};

// --- Helper to determine Proposal Status --- 
const getProposalStatus = (details: any, committeeApprovals?: Record<string, boolean>): string => {
  if (!details) return 'prop_pending_review';
  if (details.highTableVetoed) return 'prop_executed_closed';
  if (details.dioId && BigInt(details.dioId.toString()) > 0n) return 'prop_finalized';
  if (details.highTableApproved) return 'prop_hightable_approved';
  // New logic: all assigned committees must approve
  if (details.assignedCommittees && details.assignedCommittees.length > 0) {
    if (committeeApprovals) {
      const allApproved = details.assignedCommittees.every((c: string) => committeeApprovals[c]);
      if (allApproved) return 'prop_committee_approved';
      return 'prop_committee_assigned';
    }
    // Fallback: if no approvals info, default to assigned
    return 'prop_committee_assigned';
  }
  return 'prop_pending_review';
};

// --- Helper to determine VRDI Status ---
const getVRDIStatus = (details: any /* VRDIDetailsFromContract */, phasesData?: any /* raw phases data */, stakedTokenCount?: number): string => {
  if (!details) return 'vrdi_active_disbursing';
  if (details.isClosed) return 'vrdi_closed';
  if (details.isFrozen) return 'vrdi_frozen';
  if (typeof stakedTokenCount === 'number' && stakedTokenCount === 0) {
    return 'vrdi_pending_first_withdrawal';
  }
  // Check for repayment phase: all phases complete
  if (phasesData && phasesData.completionTimestamps && Array.isArray(phasesData.completionTimestamps)) {
    const allComplete = phasesData.completionTimestamps.length > 0 && phasesData.completionTimestamps.every((ts: bigint) => ts > 0n);
    if (allComplete) return 'vrdi_repayment';
  }
  // Check for active disbursing: any withdrawn amount > 0
  if (phasesData && phasesData.withdrawnAmountsUSDC && Array.isArray(phasesData.withdrawnAmountsUSDC)) {
    const anyWithdrawn = phasesData.withdrawnAmountsUSDC.some((amt: bigint) => amt > 0n);
    if (anyWithdrawn) return 'vrdi_active_disbursing';
  }
  // Default fallback
  return 'vrdi_pending_first_withdrawal';
};

// Helper to format numbers with spaces every 3 digits before the decimal
function formatWithSpaces(numStr: string) {
  if (!numStr) return '';
  const [intPart, decPart] = numStr.split('.');
  const intWithSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return decPart !== undefined ? `${intWithSpaces}.${decPart}` : intWithSpaces;
}

const DAODashboard: React.FC = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeWallet = useActiveWallet();
  const accountObj = activeWallet?.getAccount();
  const account = useActiveAccount(); // Use the hook for the active account

  // Panel Visibility States
  const [showHighTablePanel, setShowHighTablePanel] = useState(false);
  const [showDebtHolderPanel, setShowDebtHolderPanel] = useState(false);
  const [activeProcess, setActiveProcess] = useState<'DIO' | 'VRDI'>('DIO');

  // Contract Instance
  const isTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';
  // Dynamically select address based on testnet state to ensure it matches the chain
  const diamondContract = React.useMemo(() => getContract({
    client,
    chain: isTestnet ? baseSepolia : base,
    address: diamondAddress,
    abi: diamondAbi,
  }), [isTestnet]);

  // High Table Role Check
  const [isHighTableMember, setIsHighTableMember] = useState(false);
  const [checkingHighTable, setCheckingHighTable] = useState(true);

  // Proposals & VRDIs State
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [vrdis, setVrdis] = useState<VRDI[]>([]);

  // Modals & Forms State
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [selectedVRDI, setSelectedVRDI] = useState<VRDI | null>(null);
  const [showVRDIModal, setShowVRDIModal] = useState(false);

  const [addProposalOpen, setAddProposalOpen] = useState(false);
  const [proposalDocLink, setProposalDocLink] = useState('');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [addProposalError, setAddProposalError] = useState<string | null>(null);
  const [addProposalSuccess, setAddProposalSuccess] = useState<string | null>(null);

  const [assignCommitteeOpen, setAssignCommitteeOpen] = useState(false);
  const [assignCommitteeName, setAssignCommitteeName] = useState('');
  const [committeeOptions, setCommitteeOptions] = useState<string[]>([]);
  const [isAssigningCommittee, setIsAssigningCommittee] = useState(false);
  const [assignCommitteeError, setAssignCommitteeError] = useState<string | null>(null);
  const [assignCommitteeSuccess, setAssignCommitteeSuccess] = useState<string | null>(null);

  const [vetoingProposalId, setVetoingProposalId] = useState<string | null>(null);
  const [finalizingProposalId, setFinalizingProposalId] = useState<string | null>(null); // Kept this one from original
  const [highTableActionError, setHighTableActionError] = useState<string | null>(null);
  const [highTableActionSuccess, setHighTableActionSuccess] = useState<string | null>(null);

  // Finalize Form State
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);
  const [finalizeTargetProposalId, setFinalizeTargetProposalId] = useState<string | null>(null);
  const [finalizeFormValues, setFinalizeFormValues] = useState<any>(null);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [finalizeSuccess, setFinalizeSuccess] = useState<string | null>(null);
  const [principalAmountRaw, setPrincipalAmountRaw] = useState('');
  const [entryMode, setEntryMode] = useState<'usdc' | 'mkvli'>('usdc');
  const [mkvliAmountRaw, setMkvliAmountRaw] = useState('');
  const [redemptionPrice, setRedemptionPrice] = useState<number | null>(null);
  const usdcInputRef = useRef<HTMLInputElement | null>(null); // Kept this from original
  const [usdcFlash, setUsdcFlash] = useState(false);
  const [usdcUserInput, setUsdcUserInput] = useState('');
  const [usdcAdjusted, setUsdcAdjusted] = useState('');
  const [isAdjusted, setIsAdjusted] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Initialize VRDI Form State
  const [showInitializeVRDIModal, setShowInitializeVRDIModal] = useState(false);
  const [vrdiForm, setVrdiForm] = useState<any>({
    dioId: '',
    principalUSDC: '',
    principalMKVLI20: '',
    interestRate: '',
    amortizationDuration: '',
    deferralPeriod: '',
    debtor: '',
    phaseAmountsUSDC: [''],
  });
  const [phaseAmountsPercent, setPhaseAmountsPercent] = useState<string[]>(['']);
  const [phaseEntryMode, setPhaseEntryMode] = useState<'usdc' | 'percent'>('percent');
  const [principalUSDCDisplayValue, setPrincipalUSDCDisplayValue] = useState(''); // Renamed from principalUSDCDisplay
  const [principalUSDCInt, setPrincipalUSDCInt] = useState(0);

  const [vrdiProposals, setVrdiProposals] = useState<any[]>([]);

  const USDC_DECIMALS = 6; // Kept this from original

  const resetInitializeVRDIForm = (dioParams?: any) => {
    if (!dioParams) {
      setVrdiForm({
        dioId: '',
        principalUSDC: '',
        principalMKVLI20: '',
        interestRate: '',
        amortizationDuration: '',
        deferralPeriod: '',
        debtor: '',
        phaseAmountsUSDC: [''],
      });
      setPhaseAmountsPercent(['']);
      setPrincipalUSDCDisplayValue('');
      setPrincipalUSDCInt(0);
      return;
    }
    const principal = Number(ethers.formatUnits(dioParams.principalAmount || 0n, USDC_DECIMALS));
    setPrincipalUSDCInt(Number(dioParams.principalAmount || 0n)); // Smallest units
    setPrincipalUSDCDisplayValue(principal.toString());

    setVrdiForm({
      dioId: finalizeTargetProposalId || '', // Fallback, though likely unused in this context
      principalUSDC: dioParams.principalAmount?.toString() || '',
      principalMKVLI20: '0', // Need to calculate?
      interestRate: dioParams.interestRate?.toString() || '',
      amortizationDuration: dioParams.amortizationDuration?.toString() || '',
      deferralPeriod: dioParams.deferralPeriod?.toString() || '',
      debtor: dioParams.debtor || '',
      phaseAmountsUSDC: [''],
    });
  };

  // Helper to get principal as number (in smallest unit)
  // const principalUSDCInt: number = Number(vrdiForm.principalUSDC) || 0; // This is now a state variable
  // const principalUSDCDisplay = principalUSDCDisplayValue !== '' ? principalUSDCDisplayValue : (principalUSDCInt / 1e6).toFixed(6); // This is now a state variable

  // When user enters principal in dollars, store as smallest unit and update display value
  const handlePrincipalUSDCChange = (value: string) => {
    // Only allow digits and decimal
    const cleaned = value.replace(/[^\d.]/g, '');
    setPrincipalUSDCDisplayValue(cleaned);
    const asFloat = parseFloat(cleaned);
    const asInt = isNaN(asFloat) ? '' : Math.round(asFloat * 1e6).toString();
    setVrdiForm((prev: any) => ({ ...prev, principalUSDC: asInt }));
  };

  // Filter proposals ready for VRDI initialization
  useEffect(() => {
    // Collect all dioIds from existing VRDIs (as strings)
    const vrdiDioIds = new Set(
      vrdis
        .map(v => v.rawDataDetails && v.rawDataDetails.dioId !== undefined ? v.rawDataDetails.dioId.toString() : undefined)
        .filter((id): id is string => !!id)
    );
    // Only proposals that are finalized and have a dioId, and that dioId is not in any VRDI
    const readyProposals = proposals.filter(
      (p) => p.status === 'prop_finalized' && p.dioId && !vrdiDioIds.has(p.dioId)
    );
    setVrdiProposals(readyProposals);
  }, [proposals, vrdis]);

  const handleVRDIFormChange = (field: string, value: any) => {
    setVrdiForm((prev: any) => ({ ...prev, [field]: value }));
  };
  // When user enters phase amount in dollars, store as smallest unit
  const handlePhaseAmountChange = (idx: number, value: string) => {
    if (phaseEntryMode === 'usdc') {
      // Only allow digits and decimal
      const cleaned = value.replace(/[^\d.]/g, '');
      const asFloat = parseFloat(cleaned);
      const asInt = isNaN(asFloat) ? '' : Math.round(asFloat * 1e6).toString();
      setVrdiForm((prev: any) => {
        const arr = [...prev.phaseAmountsUSDC];
        arr[idx] = asInt;
        return { ...prev, phaseAmountsUSDC: arr };
      });
    } else {
      setPhaseAmountsPercent(prev => {
        const arr = [...prev];
        arr[idx] = value;
        return arr;
      });
    }
  };
  const addPhaseAmount = () => {
    if (phaseEntryMode === 'usdc') {
      setVrdiForm((prev: any) => ({ ...prev, phaseAmountsUSDC: [...prev.phaseAmountsUSDC, ''] }));
    } else {
      setPhaseAmountsPercent(prev => [...prev, '']);
    }
  };
  const removePhaseAmount = (idx: number) => {
    if (phaseEntryMode === 'usdc') {
      setVrdiForm((prev: any) => {
        const arr = [...prev.phaseAmountsUSDC];
        arr.splice(idx, 1);
        return { ...prev, phaseAmountsUSDC: arr };
      });
    } else {
      setPhaseAmountsPercent(prev => {
        const arr = [...prev];
        arr.splice(idx, 1);
        return arr;
      });
    }
  };
  // When user selects a proposal, set both display and smallest unit values
  const handleVRDIProposalSelect = (proposalId: string) => {
    const proposal = vrdiProposals.find((p) => p.id === proposalId);
    if (!proposal || !proposal.rawData) return;
    const dioParams = proposal.rawData[6] || {};
    const principalSmallest = dioParams.principalAmount ? dioParams.principalAmount.toString() : '';
    const principalDisplay = principalSmallest ? (Number(principalSmallest) / 1e6).toFixed(6) : '';
    setPrincipalUSDCDisplayValue(principalDisplay);
    setVrdiForm({
      dioId: proposalId,
      principalUSDC: principalSmallest,
      principalMKVLI20: proposal.rawData[7]?.toString() || '',
      interestRate: dioParams.interestRate?.toString() || '',
      amortizationDuration: dioParams.amortizationDuration?.toString() || '',
      deferralPeriod: dioParams.deferralPeriod?.toString() || '',
      debtor: dioParams.debtor || '',
      phaseAmountsUSDC: [''],
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!diamondContract || !client || !diamondAddress) {
        console.warn("DAO Dashboard: Diamond contract, client, or address not available yet.");
        setIsLoading(true); // Keep loading state
        return;
      }
      setIsLoading(true);
      setError(null);

      try {
        // Fetch Proposals
        const nextProposalIdBigInt = await readContract({
          contract: diamondContract,
          method: "getNextProposalId",
          params: []
        });
        const nextProposalId = Number(nextProposalIdBigInt);
        const fetchedProposals: Proposal[] = [];
        const proposalLookback = Math.min(nextProposalId > 0 ? nextProposalId : 0, 500); // Increased lookback to capture all including 0

        for (let i = 0; i < proposalLookback; i++) {
          const proposalIdToFetch = BigInt(nextProposalId - 1 - i);
          if (proposalIdToFetch < 0n) break;
          try {
            const proposalDataArray = await readContract({
              contract: diamondContract,
              method: "getProposalDetails",
              params: [proposalIdToFetch]
            }) as unknown as readonly [string, string, readonly string[], boolean, boolean, bigint, any, bigint, boolean, string]; // Type assertion for tuple

            // Access by index based on ABI output order
            const details = {
              submitter: proposalDataArray[0],
              documentLink: proposalDataArray[1],
              assignedCommittees: proposalDataArray[2],
              highTableApproved: proposalDataArray[3],
              highTableVetoed: proposalDataArray[4],
              dioId: proposalDataArray[5],
              dioParams: proposalDataArray[6], // This is the struct, handle as needed
              totalMKVLI20: proposalDataArray[7],
              highTableOverride: proposalDataArray[8],
              highTableJustification: proposalDataArray[9]
            };

            // Fetch committee approvals for this proposal
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

            fetchedProposals.push({
              id: proposalIdToFetch.toString(),
              title: `Proposal #${proposalIdToFetch.toString()}`,
              status: getProposalStatus(details, committeeApprovals), // Pass the mapped object
              description: details.documentLink ? `${details.documentLink.substring(0, 50)}...` : 'No document link.',
              submitter: details.submitter,
              documentLink: details.documentLink,
              assignedCommittees: details.assignedCommittees,
              highTableApproved: details.highTableApproved,
              highTableVetoed: details.highTableVetoed,
              dioId: details.dioId && BigInt(details.dioId.toString()) > 0n ? details.dioId.toString() : undefined,
              rawData: proposalDataArray, // Store original array if needed
            });
          } catch (e) {
            console.error(`Failed to fetch details for proposal ${proposalIdToFetch}:`, e);
          }
        }
        setProposals(fetchedProposals.sort((a, b) => parseInt(b.id) - parseInt(a.id))); // Show newest first generally

        // Fetch VRDIs
        const nextVRDIIdBigInt = await readContract({
          contract: diamondContract,
          method: "getNextVRDIId",
          params: []
        });
        const nextVRDIId = Number(nextVRDIIdBigInt);
        const fetchedVrdis: VRDI[] = [];
        const vrdiLookback = Math.min(nextVRDIId > 0 ? nextVRDIId : 0, 500);

        for (let i = 0; i < vrdiLookback; i++) {
          const vrdiIdToFetch = BigInt(nextVRDIId - 1 - i);
          if (vrdiIdToFetch < 0n) break;
          try {
            // getVRDIDetails now returns an object, not an array/tuple
            const detailsFromContract = await readContract({
              contract: diamondContract,
              method: "getVRDIDetails",
              params: [vrdiIdToFetch]
            }) as VRDIDetailsFromContract; // Assert to our new interface

            // Fetch stakedTokenCount for this VRDI's dioId
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
                method: "getVRDIPhases",
                params: [vrdiIdToFetch]
              }) as unknown as readonly [
                readonly bigint[], // phaseAmountsUSDC @ index 0
                readonly boolean[],// isActive @ index 1
                readonly boolean[],// isComplete @ index 2
                readonly string[], // evidenceLinks @ index 3
                readonly bigint[], // withdrawnAmountsUSDC @ index 4
                readonly bigint[]  // completionTimestamps @ index 5
              ];

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
                  const hasActualCompletionTimestamp = actualTimestamp && actualTimestamp > 0n;

                  let phaseIsComplete = false;
                  let phaseIsActive = false;
                  let completionTimestampDisplay: string | undefined = undefined;

                  if (hasActualCompletionTimestamp) {
                    phaseIsComplete = true;
                    phaseIsActive = false;
                    completionTimestampDisplay = new Date(Number(actualTimestamp) * 1000).toLocaleDateString();
                  } else if (detailsFromContract.isClosed) {
                    phaseIsComplete = true;
                    phaseIsActive = false;
                    completionTimestampDisplay = "VRDI Closed";
                  } else {
                    phaseIsComplete = isCompleteArray[index] === true;
                    phaseIsActive = isActiveArray[index] === true;
                    if (phaseIsActive) {
                      phaseIsComplete = false;
                    }
                  }

                  formattedPhases.push({
                    amount: typeof amount === 'bigint' ? ethers.formatUnits(amount, USDC_DECIMALS) : '0.00',
                    isActive: phaseIsActive,
                    isComplete: phaseIsComplete,
                    evidenceLink: evidenceLinksArray[index] || undefined,
                    completionTimestamp: completionTimestampDisplay,
                  });
                }
              } else {
                console.warn(`VRDI ID ${vrdiIdToFetch}: No phase data found in phasesTuple or phaseAmountsUSDC is empty. phasesTuple:`, phasesTuple);
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

              // Compose phasesData for status helper
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
                rawDataPhases: phasesTuple, // Store the raw tuple
                stakedTokenCount, // Store for debugging/inspection
              });
            } else {
              console.error(`Unexpected or incomplete structure for VRDIDetailsFromContract for VRDI ID ${vrdiIdToFetch}:`, detailsFromContract);
            }
          } catch (e) { console.error(`Failed to fetch or process details for VRDI ${vrdiIdToFetch}:`, e); }
        }
        setVrdis(fetchedVrdis.sort((a, b) => parseInt(b.id) - parseInt(a.id)));

      } catch (e: any) {
        console.error("Error fetching DAO data:", e);
        setError("Failed to load DAO dashboard data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Fetch data once on mount, assuming TSPABI.contract is stable after initial app load

  useEffect(() => {
    const checkHighTable = async () => {
      setCheckingHighTable(true);
      try {
        if (!account?.address || !diamondContract) {
          setIsHighTableMember(false);
          setCheckingHighTable(false);
          return;
        }
        // Get HIGH_TABLE role string from contract
        const highTableRole = await readContract({ contract: diamondContract, method: 'HIGH_TABLE', params: [] });
        const hasRole = await readContract({ contract: diamondContract, method: 'hasRole', params: [highTableRole, account.address] });
        setIsHighTableMember(!!hasRole);
      } catch (e) {
        setIsHighTableMember(false);
      } finally {
        setCheckingHighTable(false);
      }
    };
    checkHighTable();
  }, [account?.address]);

  // Fetch committee names when assign committee form opens
  useEffect(() => {
    const fetchCommittees = async () => {
      if (!assignCommitteeOpen || !diamondContract) return;
      try {
        const [ids, names] = await readContract({
          contract: diamondContract,
          method: 'getAllCommittees',
          params: [],
        }) as [bigint[], string[]];
        setCommitteeOptions(names);
      } catch (e) {
        setCommitteeOptions([]);
      }
    };
    fetchCommittees();
  }, [assignCommitteeOpen]);

  // Helper to get proposals for a column
  const getProposalsForColumn = (columnId: string) => proposals.filter(p => p.status === columnId);
  // Helper to get VRDIs for a column
  const getVRDIsForColumn = (columnId: string) => vrdis.filter(v => v.status === columnId);

  // --- Modal Handlers ---
  const handleOpenProposalModal = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    setShowProposalModal(true);
  };
  const handleCloseProposalModal = () => setShowProposalModal(false);

  const handleOpenVRDIModal = (vrdi: VRDI) => {
    setSelectedVRDI(vrdi);
    setShowVRDIModal(true);
  };
  const handleCloseVRDIModal = () => setShowVRDIModal(false);

  const handleOpenAddProposal = () => {
    setAddProposalOpen(true);
    setProposalDocLink('');
    setAddProposalError(null);
    setAddProposalSuccess(null);
  };
  const handleCloseAddProposal = () => {
    setAddProposalOpen(false);
    setProposalDocLink('');
    setAddProposalError(null);
    setAddProposalSuccess(null);
  };
  const handleSubmitProposal = async () => {
    setIsSubmittingProposal(true);
    setAddProposalError(null);
    setAddProposalSuccess(null);
    try {
      if (!proposalDocLink.trim()) {
        setAddProposalError('Document link is required.');
        setIsSubmittingProposal(false);
        return;
      }
      if (!account?.address || !diamondContract) {
        setAddProposalError('Wallet not connected.');
        setIsSubmittingProposal(false);
        return;
      }
      // Prepare and send transaction using thirdweb utilities
      const tx = await prepareContractCall({
        contract: diamondContract,
        method: 'submitProposal',
        params: [proposalDocLink.trim()],
      });
      await sendAndConfirmTransaction({ transaction: tx, account });
      setAddProposalSuccess('Proposal submitted successfully!');
      setProposalDocLink('');
      // Optionally, refresh proposals list here
    } catch (e: any) {
      setAddProposalError(e?.message || 'Failed to submit proposal.');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleOpenAssignCommittee = () => {
    setAssignCommitteeOpen(true);
    setAssignCommitteeName('');
    setAssignCommitteeError(null);
    setAssignCommitteeSuccess(null);
  };
  const handleCloseAssignCommittee = () => {
    setAssignCommitteeOpen(false);
    setAssignCommitteeName('');
    setAssignCommitteeError(null);
    setAssignCommitteeSuccess(null);
  };
  const handleSubmitAssignCommittee = async () => {
    setIsAssigningCommittee(true);
    setAssignCommitteeError(null);
    setAssignCommitteeSuccess(null);
    try {
      if (!assignCommitteeName.trim()) {
        setAssignCommitteeError('Committee name is required.');
        setIsAssigningCommittee(false);
        return;
      }
      if (!account?.address || !diamondContract || !selectedProposal) {
        setAssignCommitteeError('Wallet not connected.');
        setIsAssigningCommittee(false);
        return;
      }
      const tx = await prepareContractCall({
        contract: diamondContract,
        method: 'assignCommittee',
        params: [BigInt(selectedProposal.id), assignCommitteeName.trim()],
      });
      await sendAndConfirmTransaction({ transaction: tx, account });
      setAssignCommitteeSuccess('Committee assigned successfully!');
      setAssignCommitteeName('');
      // Optionally, refresh proposal data here
    } catch (e: any) {
      setAssignCommitteeError(e?.message || 'Failed to assign committee.');
    } finally {
      setIsAssigningCommittee(false);
    }
  };

  // High Table Veto/Finalize handlers
  const handleVetoProposal = async (proposalId: string) => {
    setVetoingProposalId(proposalId);
    setHighTableActionError(null);
    setHighTableActionSuccess(null);
    try {
      if (!account?.address || !diamondContract) {
        setHighTableActionError('Wallet not connected.');
        setVetoingProposalId(null);
        return;
      }
      const tx = await prepareContractCall({
        contract: diamondContract,
        method: 'vetoProposal',
        params: [BigInt(proposalId), true],
      });
      await sendAndConfirmTransaction({ transaction: tx, account });
      setHighTableActionSuccess('Proposal vetoed successfully!');
      // Optionally refresh proposals list here
    } catch (e: any) {
      setHighTableActionError(e?.message || 'Failed to veto proposal.');
    } finally {
      setVetoingProposalId(null);
    }
  };

  const openFinalizeModal = (proposalId: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal || !proposal.rawData) return;
    const dioParams = proposal.rawData[6] || {};
    const rawHolders = proposal.rawData[7];
    const rawAmounts = proposal.rawData[8];

    // Safely coerce to arrays (ABI returned values might not be arrays yet)
    const holders: any[] = Array.isArray(rawHolders) ? rawHolders : [];
    const amounts: any[] = Array.isArray(rawAmounts) ? rawAmounts : [];

    // If the arrays are empty (or not provided), ensure at least one editable row exists
    const normalizedHolders = holders.length > 0 ? holders.map((h: string) => h) : [''];
    const normalizedAmounts = amounts.length > 0 ? amounts.map((a: any) => a?.toString?.() || '') : [''];
    setFinalizeFormValues({
      proposalId,
      principalAmount: dioParams.principalAmount?.toString() || '',
      interestRate: dioParams.interestRate?.toString() || '',
      amortizationDuration: dioParams.amortizationDuration?.toString() || '',
      deferralPeriod: dioParams.deferralPeriod?.toString() || '',
      perpetualReturns: dioParams.perpetualReturns || '',
      debtor: dioParams.debtor || '',
      holders: normalizedHolders,
      amounts: normalizedAmounts,
    });
    setFinalizeTargetProposalId(proposalId);
    setShowFinalizeModal(true);
    setFinalizeError(null);
    setFinalizeSuccess(null);
    setPrincipalAmountRaw(dioParams.principalAmount ? (typeof dioParams.principalAmount === 'bigint' ? (Number(dioParams.principalAmount) / 1e6).toString() : dioParams.principalAmount.toString()) : '');
    setEntryMode('usdc');
    setMkvliAmountRaw('');
    setUsdcUserInput('');
    setUsdcAdjusted('');
    setIsAdjusted(false);
  };
  const closeFinalizeModal = () => {
    setShowFinalizeModal(false);
    setFinalizeFormValues(null);
    setFinalizeTargetProposalId(null);
    setFinalizeError(null);
    setFinalizeSuccess(null);
    setPrincipalAmountRaw('');
    setEntryMode('usdc');
    setMkvliAmountRaw('');
    setUsdcUserInput('');
    setUsdcAdjusted('');
    setIsAdjusted(false);
  };
  const handleUSDCInputChange = (value: string) => {
    // Only allow digits and one decimal point
    const cleaned = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
    setUsdcUserInput(cleaned);
    setIsAdjusted(false);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    // Update MKVLI field in real time
    if (redemptionPrice) {
      const usdc = Number(cleaned);
      if (!isNaN(usdc)) {
        const mkvli = Math.ceil(usdc / redemptionPrice);
        setMkvliAmountRaw(mkvli ? mkvli.toString() : '');
      } else {
        setMkvliAmountRaw('');
      }
    }
    // Debounce: after 2s of inactivity, auto-adjust
    debounceTimer.current = setTimeout(() => {
      if (!redemptionPrice) return;
      const usdc = Number(cleaned);
      if (isNaN(usdc)) return;
      const roundedUSDC = getRoundedUSDC(usdc, redemptionPrice);
      const mkvli = Math.ceil(usdc / redemptionPrice);
      setUsdcAdjusted(roundedUSDC.toFixed(6));
      setPrincipalAmountRaw(roundedUSDC.toFixed(6));
      setMkvliAmountRaw(mkvli ? mkvli.toString() : '');
      setFinalizeFormValues((prev: any) => ({ ...prev, principalAmount: roundedUSDC.toFixed(6) }));
      setIsAdjusted(true);
      setUsdcFlash(true);
      setTimeout(() => setUsdcFlash(false), 250);
    }, 2000);
  };
  const handleFinalizeFormChange = (field: string, value: any) => {
    if (field === 'principalAmount') {
      // Only allow digits and one decimal point
      const cleaned = value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
      setPrincipalAmountRaw(cleaned);
      setFinalizeFormValues((prev: any) => ({ ...prev, principalAmount: cleaned }));
    } else {
      setFinalizeFormValues((prev: any) => ({ ...prev, [field]: value }));
    }
  };
  const handleFinalizeHoldersChange = (idx: number, value: string) => {
    setFinalizeFormValues((prev: any) => {
      const holders = [...prev.holders];
      holders[idx] = value;
      return { ...prev, holders };
    });
  };
  const handleFinalizeAmountsChange = (idx: number, value: string) => {
    setFinalizeFormValues((prev: any) => {
      const amounts = [...prev.amounts];
      amounts[idx] = value;
      return { ...prev, amounts };
    });
  };
  const addHolderAmountRow = () => {
    setFinalizeFormValues((prev: any) => ({ ...prev, holders: [...prev.holders, ''], amounts: [...prev.amounts, ''] }));
  };
  const removeHolderAmountRow = (idx: number) => {
    setFinalizeFormValues((prev: any) => {
      const holders = [...prev.holders];
      const amounts = [...prev.amounts];
      holders.splice(idx, 1);
      amounts.splice(idx, 1);
      return { ...prev, holders, amounts };
    });
  };
  const handleFinalizeSubmit = async () => {
    setFinalizeLoading(true);
    setFinalizeError(null);
    setFinalizeSuccess(null);
    try {
      if (!account?.address || !TSPABI.contract) {
        setFinalizeError('Wallet not connected.');
        setFinalizeLoading(false);
        return;
      }
      const v = finalizeFormValues;
      if (!v) {
        setFinalizeError('Form values missing.');
        setFinalizeLoading(false);
        return;
      }
      // Validate all fields
      if (!v.proposalId || !v.principalAmount || !v.interestRate || !v.amortizationDuration || !v.deferralPeriod || !v.perpetualReturns || !v.debtor) {
        setFinalizeError('All DIOParams fields are required.');
        setFinalizeLoading(false);
        return;
      }
      if (!Array.isArray(v.holders) || !Array.isArray(v.amounts) || v.holders.length !== v.amounts.length || v.holders.length === 0) {
        setFinalizeError('At least one holder and amount required, and counts must match.');
        setFinalizeLoading(false);
        return;
      }
      // Prepare params
      let usdcValue = Number(principalAmountRaw);
      if (isNaN(usdcValue)) {
        setFinalizeError('Principal amount must be a valid number.');
        setFinalizeLoading(false);
        return;
      }
      if (entryMode === 'usdc' && redemptionPrice) {
        usdcValue = getRoundedUSDC(usdcValue, redemptionPrice);
      }
      if (entryMode === 'mkvli' && redemptionPrice && mkvliAmountRaw) {
        usdcValue = getUSDCFromMKVLI(Number(mkvliAmountRaw), redemptionPrice);
      }
      const params = {
        principalAmount: BigInt(Math.round(usdcValue * 1e6)),
        interestRate: BigInt(v.interestRate),
        amortizationDuration: BigInt(v.amortizationDuration),
        deferralPeriod: BigInt(v.deferralPeriod),
        perpetualReturns: v.perpetualReturns,
        debtor: v.debtor,
      };
      const holders = v.holders;
      const amounts = v.amounts.map((a: string) => BigInt(a));
      const tx = await prepareContractCall({
        contract: TSPABI.contract,
        method: 'finalizeProposal',
        params: [BigInt(v.proposalId), params, holders, amounts],
      });
      await sendAndConfirmTransaction({ transaction: tx, account });
      setFinalizeSuccess('Proposal finalized successfully!');
      setTimeout(() => {
        closeFinalizeModal();
      }, 1200);
    } catch (e: any) {
      setFinalizeError(e?.message || 'Failed to finalize proposal.');
    } finally {
      setFinalizeLoading(false);
    }
  };

  // Fetch redemption price on modal open
  useEffect(() => {
    if (showFinalizeModal) {
      (async () => {
        try {
          const price = await TSPABI.calculateRedemptionPrice();
          setRedemptionPrice(Number(price) / 1e6); // USDC has 6 decimals
        } catch {
          setRedemptionPrice(null);
        }
      })();
    }
  }, [showFinalizeModal]);

  // Auto-populate MKVLI as user types USDC, and vice versa
  useEffect(() => {
    if (entryMode === 'usdc' && redemptionPrice && principalAmountRaw) {
      const usdc = Number(principalAmountRaw);
      if (!isNaN(usdc)) {
        const mkvli = Math.ceil(usdc / redemptionPrice);
        setMkvliAmountRaw(mkvli ? mkvli.toString() : '');
      } else {
        setMkvliAmountRaw('');
      }
    }
    // Do not update if in mkvli mode (to avoid overwrite while typing)
    // eslint-disable-next-line
  }, [principalAmountRaw, redemptionPrice, entryMode]);

  useEffect(() => {
    if (entryMode === 'mkvli' && redemptionPrice && mkvliAmountRaw) {
      const mkvli = Number(mkvliAmountRaw);
      if (!isNaN(mkvli)) {
        const usdc = mkvli * redemptionPrice;
        setPrincipalAmountRaw(usdc ? usdc.toFixed(6) : '');
      } else {
        setPrincipalAmountRaw('');
      }
    }
    // Do not update if in usdc mode (to avoid overwrite while typing)
    // eslint-disable-next-line
  }, [mkvliAmountRaw, redemptionPrice, entryMode]);

  // Helper to round up USDC to nearest value convertible to whole MKVLI
  function getRoundedUSDC(usdc: number, redemption: number) {
    if (!redemption || redemption <= 0) return usdc;
    const mkvli = Math.ceil(usdc / redemption);
    return mkvli * redemption;
  }
  // Helper to get MKVLI from USDC
  function getMKVLIFromUSDC(usdc: number, redemption: number) {
    if (!redemption || redemption <= 0) return 0;
    return Math.floor(usdc / redemption);
  }
  // Helper to get USDC from MKVLI
  function getUSDCFromMKVLI(mkvli: number, redemption: number) {
    return mkvli * redemption;
  }

  // Sync phaseAmountsUSDC <-> phaseAmountsPercent on mode switch or principal change
  useEffect(() => {
    if (phaseEntryMode === 'percent') {
      // Convert USDC to %
      setPhaseAmountsPercent(
        vrdiForm.phaseAmountsUSDC.map((amt: string) => {
          const n = parseFloat(amt || '0');
          const principal = Number(principalUSDCDisplayValue);
          return principal > 0 ? ((n / principal) * 100).toFixed(4) : '';
        })
      );
    } else {
      // Convert % to USDC
      setVrdiForm((prev: any) => ({
        ...prev,
        phaseAmountsUSDC: phaseAmountsPercent.map((pct: string) => {
          const n = parseFloat(pct || '0');
          const principal = Number(principalUSDCDisplayValue);
          return principal > 0 ? (principal * n / 100).toFixed(6) : '';
        })
      }));
    }
    // eslint-disable-next-line
  }, [phaseEntryMode, vrdiForm.principalUSDC]);

  // For display, always divide by 1e6
  const phaseUSDCDisplays: string[] = vrdiForm.phaseAmountsUSDC.map((amt: string) =>
    amt ? (parseInt(amt) / 1e6).toFixed(6) : ''
  );

  // In percent mode, calculate phase amounts in smallest unit from percent
  const phaseUSDCs: string[] = phaseEntryMode === 'usdc'
    ? vrdiForm.phaseAmountsUSDC
    : phaseAmountsPercent.map((pct: string) => {
      const percent = parseFloat(pct || '0');
      return Number(principalUSDCInt) > 0 ? Math.round(Number(principalUSDCInt) * percent / 100).toString() : '';
    });

  // For display in percent mode, calculate USDC display from percent
  const phaseUSDCDisplaysPercent: string[] = phaseAmountsPercent.map((pct: string) => {
    const percent = parseFloat(pct || '0');
    return Number(principalUSDCInt) > 0 ? (Number(principalUSDCInt) * percent / 100 / 1e6).toFixed(6) : '';
  });

  // For percent calculation, use smallest unit
  const phasePercents: string[] = phaseEntryMode === 'percent'
    ? phaseAmountsPercent
    : vrdiForm.phaseAmountsUSDC.map((amt: string) => {
      const n = Number(amt || '0');
      return Number(principalUSDCInt) > 0 ? ((n / Number(principalUSDCInt)) * 100).toFixed(4) : '';
    });

  // Totals for validation
  const totalUSDCInt: number = phaseUSDCs.reduce((sum: number, v: string) => sum + parseInt(v || '0'), 0);
  const totalPercent: number = phasePercents.reduce((sum: number, v: string) => sum + parseFloat(v || '0'), 0);
  const isPhaseValid: boolean = phaseEntryMode === 'usdc'
    ? (totalUSDCInt === principalUSDCInt && vrdiForm.phaseAmountsUSDC.every((v: string) => v && !isNaN(Number(v))))
    : (Math.abs(totalPercent - 100) < 0.0001 && phaseAmountsPercent.every((v: string) => v && !isNaN(Number(v))));

  const [vrdiInitLoading, setVrdiInitLoading] = useState(false);
  const [vrdiInitError, setVrdiInitError] = useState<string | null>(null);
  const [vrdiInitSuccess, setVrdiInitSuccess] = useState<string | null>(null);

  const handleInitializeVRDI = async () => {
    setVrdiInitLoading(true);
    setVrdiInitError(null);
    setVrdiInitSuccess(null);
    try {
      if (!isPhaseValid) throw new Error('Phase amounts invalid.');
      if (!vrdiForm.dioId || !vrdiForm.principalUSDC || !vrdiForm.principalMKVLI20 || !vrdiForm.interestRate || !vrdiForm.amortizationDuration || !vrdiForm.deferralPeriod || !vrdiForm.debtor) {
        throw new Error('All fields are required.');
      }
      if (!account?.address || !TSPABI.contract) {
        throw new Error('Wallet not connected.');
      }
      // Prepare data for contract
      const dioId = BigInt(vrdiForm.dioId);
      const principalUSDC = BigInt(vrdiForm.principalUSDC);
      const principalMKVLI20 = BigInt(vrdiForm.principalMKVLI20);
      const interestRate = BigInt(vrdiForm.interestRate);
      const amortizationDuration = BigInt(vrdiForm.amortizationDuration);
      const deferralPeriod = BigInt(vrdiForm.deferralPeriod);
      const debtor = vrdiForm.debtor;
      const phaseAmountsUSDC = phaseUSDCs.map((v: string) => BigInt(v));
      // Call contract
      const tx = await prepareContractCall({
        contract: TSPABI.contract,
        method: 'initializeVRDI',
        params: [
          dioId,
          principalUSDC,
          principalMKVLI20,
          interestRate,
          amortizationDuration,
          deferralPeriod,
          debtor,
          phaseAmountsUSDC
        ],
      });
      await sendAndConfirmTransaction({ transaction: tx, account });
      setVrdiInitSuccess('VRDI initialized successfully!');
      setTimeout(() => setShowInitializeVRDIModal(false), 1200);
    } catch (e: any) {
      setVrdiInitError(e?.message || 'Failed to initialize VRDI.');
    } finally {
      setVrdiInitLoading(false);
    }
  };

  // Non-blocking loading/error states are handled within the UI now
  // if (isLoading) ... removed
  // if (error) ... removed

  return (
    <div
      className="relative w-full h-full flex flex-col ultra-glass border-none text-zinc-300 text-xs font-sans rounded-3xl overflow-hidden transition-all duration-500"
    >
      {/* Premium Header / Process Switcher */}
      <div className="w-full h-16 flex items-center justify-between px-8 border-b border-white/5 bg-black/20 backdrop-blur-xl flex-shrink-0 z-20">

        {/* Left: Process Toggles */}
        <div className="flex bg-black/40 rounded-full p-1 border border-white/5 shadow-inner">
          <button
            onClick={() => setActiveProcess('DIO')}
            className={`px-6 py-2 rounded-full text-[10px] font-bold tracking-[0.15em] transition-all duration-300 ${activeProcess === 'DIO'
              ? 'bg-gradient-to-r from-cyan-900/80 to-blue-900/80 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)] border border-white/10'
              : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            DIO PROCESS
          </button>
          <button
            onClick={() => setActiveProcess('VRDI')}
            className={`px-6 py-2 rounded-full text-[10px] font-bold tracking-[0.15em] transition-all duration-300 ${activeProcess === 'VRDI'
              ? 'bg-gradient-to-r from-fuchsia-900/80 to-purple-900/80 text-white shadow-[0_0_15px_rgba(217,70,239,0.4)] border border-white/10'
              : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            VRDI PROCESS
          </button>
        </div>

        {/* Center: Status Indicator (Optional, could be empty) */}
        <div className="hidden md:flex items-center gap-3 opacity-60">
          {isLoading && <div className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> <span className="text-[9px] tracking-widest uppercase">Syncing Chain Data...</span></div>}
          {error && <span className="text-red-400 text-[9px] tracking-widest uppercase">CONNECTION ERROR</span>}
        </div>

        {/* Right: Actions */}
        <div className="flex gap-3">
          {isHighTableMember && !checkingHighTable && activeProcess === 'DIO' && (
            <button
              className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-widest py-2 px-4 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.1)] transition-all active:scale-95 flex items-center gap-2"
              onClick={handleOpenAddProposal}
            >
              <span>+</span>
              <span>New Proposal</span>
            </button>
          )}

          {activeProcess === 'VRDI' && (
            <button
              className="bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-[10px] font-bold uppercase tracking-widest py-2 px-4 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.1)] transition-all active:scale-95 flex items-center gap-2"
              onClick={() => setShowInitializeVRDIModal(true)}
            >
              <span>+</span>
              <span>Init VRDI</span>
            </button>
          )}
        </div>
      </div>

      {/* Supplemental Panels - REMOVED (Moved to Sanctum) */}
      {/* {showHighTablePanel && <HighTablePanel />} */}
      {/* {showDebtHolderPanel && <DebtHolderPanel />} */}

      {/* Scrollable Main Content Area */}
      {/* Horizontal Scrollable Main Content Area */}
      <div className="flex-grow overflow-x-auto overflow-y-hidden p-6 custom-scrollbar bg-transparent flex items-start">

        {/* Floating Action Buttons Moved to Header - Removed from here */}


        {/* KANBAN BOARD CONTAINER */}
        <div className="flex flex-nowrap gap-6 h-full min-w-full">

          {/* DIO PROCESS COLUMNS */}
          {activeProcess === 'DIO' && KANBAN_COLUMNS.proposals.map(column => (
            <div key={column.id} className="flex-shrink-0 w-80 h-full flex flex-col ultra-glass rounded-xl overflow-hidden border border-white/5 bg-black/10">
              {/* Column Header */}
              <div className="p-3 border-b border-white/5 bg-white/5 backdrop-blur-md flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-zinc-300 uppercase tracking-[0.15em]">{column.title}</h3>
                <span className="text-[9px] text-zinc-600 font-mono font-bold bg-black/20 px-1.5 py-0.5 rounded">{getProposalsForColumn(column.id).length}</span>
              </div>

              {/* Column Body / Cards */}
              <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {getProposalsForColumn(column.id).map(proposal => (
                  <div
                    key={proposal.id}
                    onClick={() => handleOpenProposalModal(proposal)}
                    className="group relative p-4 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-cyan-900/20 hover:border-white/20 active:scale-[0.98]"
                  >
                    {/* Glow effect on hover */}
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-purple-500/0 group-hover:from-cyan-500/5 group-hover:to-purple-500/5 transition-all duration-500 rounded-lg pointer-events-none" />

                    {/* Generative Mesh Background - Subtle */}
                    <div
                      className="absolute inset-0 opacity-40 group-hover:opacity-70 transition-opacity duration-500 rounded-lg pointer-events-none mix-blend-screen"
                      style={{ background: generateDAOMesh(proposal.id + proposal.title) }}
                    />

                    <div className="flex justify-between items-start mb-2 relative z-10">
                      <span className="font-mono text-[9px] text-zinc-500">#{proposal.id}</span>
                      {proposal.submitter && <span className="font-mono text-[9px] text-zinc-600 truncate max-w-[100px]" title={proposal.submitter}>{proposal.submitter.slice(0, 6)}...</span>}
                    </div>

                    <h4 className="text-sm font-medium text-zinc-100 mb-1 leading-snug relative z-10 group-hover:text-cyan-200 transition-colors">{proposal.title}</h4>
                    <p className="text-[10px] text-zinc-400 line-clamp-2 relative z-10">{proposal.description || 'No description provided.'}</p>

                    {/* Tags / Status Indicators */}
                    <div className="mt-3 flex flex-wrap gap-1 relative z-10">
                      {proposal.highTableApproved && <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-500/20">HT Approved</span>}
                      {proposal.highTableVetoed && <span className="text-[8px] font-bold uppercase tracking-wider text-red-300 bg-red-900/30 px-1.5 py-0.5 rounded border border-red-500/20">Vetoed</span>}
                      {proposal.dioId && <span className="text-[8px] font-bold uppercase tracking-wider text-fuchsia-300 bg-fuchsia-900/30 px-1.5 py-0.5 rounded border border-fuchsia-500/20">DIO Active</span>}
                    </div>

                    {/* Action Buttons (HT) */}
                    {isHighTableMember && !proposal.dioId && !proposal.highTableVetoed &&
                      (column.id === 'prop_committee_approved' || column.id === 'prop_hightable_approved') && (
                        <div className="flex gap-2 mt-3 justify-end pt-2 border-t border-white/5 relative z-10" onClick={e => e.stopPropagation()}>
                          <button onClick={() => handleVetoProposal(proposal.id)} disabled={vetoingProposalId === proposal.id} className="text-[9px] uppercase font-bold tracking-wider text-red-400 hover:text-red-300 transition-colors disabled:opacity-50">
                            {vetoingProposalId === proposal.id ? '...' : 'VETO'}
                          </button>
                          <button onClick={() => openFinalizeModal(proposal.id)} disabled={finalizingProposalId === proposal.id} className="text-[9px] uppercase font-bold tracking-wider text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50">
                            {finalizingProposalId === proposal.id ? '...' : 'FINALIZE'}
                          </button>
                        </div>
                      )}
                  </div>
                ))}
                {getProposalsForColumn(column.id).length === 0 && (
                  <div className="h-24 flex items-center justify-center border border-dashed border-white/5 rounded-lg">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-700">Empty</span>
                  </div>
                )}
              </div>
            </div>
          ))}


          {/* VRDI PROCESS COLUMNS */}
          {activeProcess === 'VRDI' && KANBAN_COLUMNS.vrdis.map(column => (
            <div key={column.id} className="flex-shrink-0 w-80 h-full flex flex-col ultra-glass rounded-xl overflow-hidden border border-white/5 bg-black/10">
              {/* Column Header */}
              <div className="p-3 border-b border-white/5 bg-white/5 backdrop-blur-md flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-zinc-300 uppercase tracking-[0.15em]">{column.title}</h3>
                <span className="text-[9px] text-zinc-600 font-mono font-bold bg-black/20 px-1.5 py-0.5 rounded">{getVRDIsForColumn(column.id).length}</span>
              </div>

              {/* Column Body / Cards */}
              <div className="flex-grow overflow-y-auto p-3 space-y-3 custom-scrollbar">
                {getVRDIsForColumn(column.id).map(vrdi => (
                  <div
                    key={vrdi.id}
                    onClick={() => handleOpenVRDIModal(vrdi)}
                    className="group relative p-4 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition-all duration-300 cursor-pointer shadow-lg hover:shadow-fuchsia-900/20 hover:border-white/20 active:scale-[0.98]"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/0 to-purple-500/0 group-hover:from-fuchsia-500/5 group-hover:to-purple-500/5 transition-all duration-500 rounded-lg pointer-events-none" />

                    {/* Generative Mesh Background - Subtle */}
                    <div
                      className="absolute inset-0 opacity-40 group-hover:opacity-70 transition-opacity duration-500 rounded-lg pointer-events-none mix-blend-screen"
                      style={{ background: generateDAOMesh(vrdi.id + vrdi.debtor) }}
                    />

                    <div className="flex justify-between items-start mb-2 relative z-10">
                      <span className="font-mono text-[9px] text-zinc-500">VRDI #{vrdi.id}</span>
                      <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${vrdi.isClosed ? 'text-emerald-300 bg-emerald-900/30 border-emerald-500/20' :
                        vrdi.isFrozen ? 'text-orange-300 bg-orange-900/30 border-orange-500/20' :
                          'text-fuchsia-300 bg-fuchsia-900/30 border-fuchsia-500/20'
                        }`}>{vrdi.isClosed ? 'CLOSED' : vrdi.isFrozen ? 'FROZEN' : 'ACTIVE'}</span>
                    </div>

                    <div className="space-y-1 relative z-10">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Debtor</span>
                        <span className="font-mono text-zinc-200" title={vrdi.debtor}>{vrdi.debtor.slice(0, 6)}...</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Principal</span>
                        <span className="font-mono text-zinc-200">${vrdi.principalUSDC}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Repayment</span>
                        <span className="font-mono text-zinc-200">${vrdi.totalRepaymentAmount}</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-4 relative z-10">
                      <div className="flex justify-between text-[9px] text-zinc-500 mb-1">
                        <span>Progress</span>
                        <span>Phase {vrdi.currentPhaseIndex + 1}/{vrdi.phases.length || 1}</span>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500 transition-all duration-500"
                          style={{ width: `${((vrdi.currentPhaseIndex + (vrdi.phases.length > 0 && vrdi.phases[vrdi.currentPhaseIndex]?.isComplete ? 1 : 0)) / (vrdi.phases.length || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {getVRDIsForColumn(column.id).length === 0 && (
                  <div className="h-24 flex items-center justify-center border border-dashed border-white/5 rounded-lg">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-700">Empty</span>
                  </div>
                )}
              </div>
            </div>
          ))}

        </div>

        {/* Initialize VRDI Modal Injection Point (Moved from above to keep structure clean) */}
        {showInitializeVRDIModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-zinc-900/40 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl p-6 w-full max-w-lg font-sans text-zinc-300 animate-in fade-in zoom-in duration-200">
              <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
                <span className="text-zinc-100 font-medium tracking-tight">Initialize VRDI</span>
                <button onClick={() => setShowInitializeVRDIModal(false)} className="text-zinc-500 hover:text-white transition-colors">&times;</button>
              </div>
              <form className="space-y-4 text-[11px] font-mono">
                <label className="flex flex-col gap-1.5 text-zinc-400">DIO Proposal
                  <select
                    className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    value={vrdiForm.dioId}
                    onChange={e => { handleVRDIProposalSelect(e.target.value); }}
                  >
                    <option value="">Select a proposal...</option>
                    {vrdiProposals.map((p) => (
                      <option key={p.id} value={p.id}>{p.title}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-zinc-400">Principal USDC
                  <input
                    type="text"
                    className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    value={principalUSDCDisplayValue}
                    onChange={e => handlePrincipalUSDCChange(e.target.value)}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-zinc-400">Principal MKVLI20
                    <input type="text" className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-cyan-500/50 transition-colors" value={vrdiForm.principalMKVLI20} onChange={e => handleVRDIFormChange('principalMKVLI20', e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-zinc-400">Interest Rate (BPS)
                    <input type="text" className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-cyan-500/50 transition-colors" value={vrdiForm.interestRate} onChange={e => handleVRDIFormChange('interestRate', e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-zinc-400">Amortization Duration
                    <input type="text" className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-cyan-500/50 transition-colors" value={vrdiForm.amortizationDuration} onChange={e => handleVRDIFormChange('amortizationDuration', e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1.5 text-zinc-400">Deferral Period
                    <input type="text" className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-cyan-500/50 transition-colors" value={vrdiForm.deferralPeriod} onChange={e => handleVRDIFormChange('deferralPeriod', e.target.value)} />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-zinc-400">Debtor (address)
                  <input type="text" className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:border-cyan-500/50 transition-colors" value={vrdiForm.debtor} onChange={e => handleVRDIFormChange('debtor', e.target.value)} />
                </label>
                <div className="pt-2 border-t border-white/5">
                  <div className="mb-3 flex justify-between items-center">
                    <div className="flex gap-2 items-center">
                      <span className="text-zinc-400">Phase Allocation</span>
                      <div className="flex bg-black/50 rounded border border-white/10 overflow-hidden">
                        <button type="button" className={`px-2 py-0.5 text-[10px] ${phaseEntryMode === 'usdc' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} onClick={() => setPhaseEntryMode('usdc')}>USDC</button>
                        <button type="button" className={`px-2 py-0.5 text-[10px] ${phaseEntryMode === 'percent' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`} onClick={() => setPhaseEntryMode('percent')}>%</button>
                      </div>
                    </div>
                    <button type="button" onClick={addPhaseAmount} className="text-emerald-400 hover:text-emerald-300 text-[10px] uppercase font-bold tracking-wide">+ Add Phase</button>
                  </div>
                  {/* (Phase inputs logic remains similar but styled) */}
                  {phaseEntryMode === 'usdc' ? (
                    vrdiForm.phaseAmountsUSDC.map((amt: string, idx: number) => (
                      <div key={idx} className="flex gap-2 mb-2 items-center">
                        <input type="text" placeholder="USDC" className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 w-32 focus:outline-none focus:border-cyan-500/50" value={phaseUSDCDisplays[idx] || ''} onChange={e => handlePhaseAmountChange(idx, e.target.value)} />
                        <span className="text-zinc-500 text-[10px]">{phasePercents[idx]}%</span>
                        <button type="button" onClick={() => removePhaseAmount(idx)} className="ml-auto text-red-400/70 hover:text-red-400 text-[10px] font-bold">X</button>
                      </div>
                    ))
                  ) : (
                    phaseAmountsPercent.map((pct: string, idx: number) => (
                      // ... similar structure ...
                      <div key={idx} className="flex gap-2 mb-2 items-center">
                        <input type="text" placeholder="%" className="bg-black/50 border border-white/10 rounded px-2 py-1.5 text-zinc-100 w-20 focus:outline-none focus:border-cyan-500/50" value={pct || ''} onChange={e => handlePhaseAmountChange(idx, e.target.value)} />
                        <button type="button" onClick={() => removePhaseAmount(idx)} className="ml-auto text-red-400/70 hover:text-red-400 text-[10px] font-bold">X</button>
                      </div>
                    ))
                  )}

                </div>
              </form>
              {vrdiInitError && <div className="mt-3 p-2 bg-red-900/20 border border-red-500/20 text-red-300 text-[10px] rounded">{vrdiInitError}</div>}
              {vrdiInitSuccess && <div className="mt-3 p-2 bg-emerald-900/20 border border-emerald-500/20 text-emerald-300 text-[10px] rounded">{vrdiInitSuccess}</div>}
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setShowInitializeVRDIModal(false)} className="px-4 py-2 text-zinc-500 hover:text-white text-xs font-medium transition-colors">Cancel</button>
                <button
                  onClick={handleInitializeVRDI}
                  disabled={vrdiInitLoading || !isPhaseValid}
                  className={`bg-zinc-100 hover:bg-white text-zinc-900 font-bold py-2 px-6 rounded-sm shadow-[0_0_15px_rgba(255,255,255,0.2)] text-xs tracking-wide uppercase transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center`}
                  type="button"
                >
                  {vrdiInitLoading ? <span className="w-3 h-3 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin mr-2"></span> : null}
                  Initialize
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Proposal Details Modal */}
      {showProposalModal && selectedProposal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="p-4 md:p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto ultra-glass" style={{ position: 'relative' }}>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-neutral-100">Proposal #{selectedProposal.id}</h2>
              <button onClick={handleCloseProposalModal} className="text-neutral-400 hover:text-white text-2xl">&times;</button>
            </div>
            <p className="text-sm text-neutral-200 mb-1 font-semibold">Title: <span className="font-normal">{selectedProposal.title || 'N/A'}</span></p>
            <p className="text-xs text-neutral-300 mb-1">Submitter: <span className="font-normal text-neutral-100">{selectedProposal.submitter}</span></p>
            {selectedProposal.documentLink && <p className="text-xs text-neutral-300 mb-1">Document: <a href={selectedProposal.documentLink} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">View Document</a></p>}
            <p className="text-xs text-neutral-300 mb-1">Committees: <span className="font-normal text-neutral-100">{selectedProposal.assignedCommittees?.join(', ') || 'None'}</span></p>
            <p className="text-xs text-neutral-300 mb-1">High Table Approved: <span className={`font-normal ${selectedProposal.highTableApproved ? 'text-green-400' : 'text-orange-400'}`}>{selectedProposal.highTableApproved ? 'Yes' : 'No'}</span></p>
            <p className="text-xs text-neutral-300 mb-1">High Table Vetoed: <span className={`font-normal ${selectedProposal.highTableVetoed ? 'text-red-500' : 'text-green-400'}`}>{selectedProposal.highTableVetoed ? 'Yes' : 'No'}</span></p>
            {selectedProposal.dioId && <p className="text-xs text-neutral-300 mb-1">DIO ID: <span className="font-normal text-neutral-100">{selectedProposal.dioId}</span></p>}
            <p className="text-xs text-neutral-400 mt-2 whitespace-pre-wrap">Description: {selectedProposal.description || 'No further details.'}</p>
            {/* Assign Committee Button and Form (High Table only) */}
            {isHighTableMember && (
              <div className="mt-4">
                {!assignCommitteeOpen ? (
                  <Button
                    variant="contained"
                    sx={{ background: '#9B4F96', color: '#fff', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, borderRadius: 2, boxShadow: '0 0 8px #9B4F9688', '&:hover': { background: '#b86ddf', color: '#fff' }, fontSize: '0.8rem', textTransform: 'none' }}
                    onClick={handleOpenAssignCommittee}
                  >
                    Assign Committee
                  </Button>
                ) : (
                  <div className="glass-card-light rounded-lg p-4 mt-2 shadow-inner">
                    <FormControl fullWidth margin="normal" variant="outlined" sx={{
                      background: 'rgba(60, 20, 80, 0.25)',
                      borderRadius: 2,
                      '& .MuiOutlinedInput-root': {
                        color: '#fff',
                        fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`,
                        fontSize: '0.85rem',
                        '& fieldset': {
                          borderColor: '#9B4F96',
                        },
                        '&:hover fieldset': {
                          borderColor: '#b86ddf',
                        },
                        '&.Mui-focused fieldset': {
                          borderColor: '#9B4F96',
                          boxShadow: '0 0 8px #9B4F9688',
                        },
                      },
                      '& .MuiInputLabel-root': {
                        color: '#9B4F96',
                        fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`,
                        fontSize: '0.85rem',
                        '&.Mui-focused': {
                          color: '#9B4F96',
                        },
                      },
                    }}>
                      <InputLabel id="committee-select-label">Committee Name</InputLabel>
                      <Select
                        labelId="committee-select-label"
                        value={assignCommitteeName}
                        onChange={e => setAssignCommitteeName(e.target.value)}
                        label="Committee Name"
                        disabled={isAssigningCommittee || committeeOptions.length === 0}
                        sx={{ color: '#fff', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, fontSize: '0.85rem' }}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              background: 'rgba(30, 10, 40, 0.92)',
                              backdropFilter: 'blur(16px)',
                              WebkitBackdropFilter: 'blur(16px)',
                              border: '2px solid #9B4F96',
                              borderRadius: 2,
                              boxShadow: '0 0 16px #9B4F96aa',
                              color: '#e0e0e0',
                              fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`,
                              fontSize: '0.85rem',
                              mt: 1,
                            },
                          },
                          MenuListProps: {
                            sx: {
                              p: 0,
                            },
                          },
                        }}
                      >
                        {committeeOptions.map(name => (
                          <MenuItem
                            key={name}
                            value={name}
                            sx={{
                              fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`,
                              fontSize: '0.85rem',
                              color: '#e0e0e0',
                              px: 2,
                              py: 1,
                              transition: 'background 0.2s',
                              '&.Mui-selected': {
                                background: '#9B4F96',
                                color: '#fff',
                              },
                              '&:hover': {
                                background: '#9B4F96',
                                color: '#fff',
                              },
                            }}
                          >
                            {name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {assignCommitteeError && <div style={{ color: '#ff6bcb', fontSize: '0.75rem', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, marginTop: 8 }}>{assignCommitteeError}</div>}
                    {assignCommitteeSuccess && <div style={{ color: '#50fa7b', fontSize: '0.75rem', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, marginTop: 8 }}>{assignCommitteeSuccess}</div>}
                    <div className="flex justify-end gap-2 mt-2">
                      <Button onClick={handleCloseAssignCommittee} sx={{ color: '#fff', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, background: 'rgba(60, 20, 80, 0.15)', borderRadius: 2, '&:hover': { background: '#9B4F96', color: '#fff' }, fontSize: '0.8rem', textTransform: 'none' }} disabled={isAssigningCommittee}>Cancel</Button>
                      <Button onClick={handleSubmitAssignCommittee} variant="contained" sx={{ background: '#9B4F96', color: '#fff', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, borderRadius: 2, boxShadow: '0 0 8px #9B4F9688', '&:hover': { background: '#b86ddf', color: '#fff' }, fontSize: '0.8rem', textTransform: 'none' }} disabled={isAssigningCommittee}>
                        {isAssigningCommittee ? <CircularProgress size={18} color="inherit" /> : 'Assign'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* VRDI Details Modal */}
      {showVRDIModal && selectedVRDI && (
        <div className="fixed inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-neutral-800 border border-neutral-600 p-4 md:p-6 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-neutral-100">VRDI #{selectedVRDI.id}</h2>
              <button onClick={handleCloseVRDIModal} className="text-neutral-400 hover:text-white text-2xl">&times;</button>
            </div>
            <p className="text-xs text-neutral-300 mb-1">Debtor: <span className="font-normal text-neutral-100">{selectedVRDI.debtor}</span></p>
            <p className="text-xs text-neutral-300 mb-1">Principal (USDC): <span className="font-normal text-neutral-100">${selectedVRDI.principalUSDC}</span></p>
            <p className="text-xs text-neutral-300 mb-1">Principal (MKVLI): <span className="font-normal text-neutral-100">{selectedVRDI.principalMKVLI20}</span></p>
            <p className="text-xs text-neutral-300 mb-1">Total Repayment: <span className="font-normal text-neutral-100">${selectedVRDI.totalRepaymentAmount} USDC</span></p>
            <p className="text-xs text-neutral-300 mb-1">Interest Rate: <span className="font-normal text-neutral-100">{selectedVRDI.interestRate}</span></p>
            <p className="text-xs text-neutral-300 mb-1">Status: <span className={`font-normal ${selectedVRDI.isClosed ? 'text-green-400' : selectedVRDI.isFrozen ? 'text-orange-400' : 'text-sky-400'}`}>{selectedVRDI.isClosed ? 'Closed' : selectedVRDI.isFrozen ? 'Frozen' : `Active - Phase ${selectedVRDI.currentPhaseIndex + 1}`}</span></p>
            {selectedVRDI.startTimestamp && <p className="text-xs text-neutral-300 mb-1">Start Date: <span className="font-normal text-neutral-100">{selectedVRDI.startTimestamp}</span></p>}

            <h4 className="text-sm font-semibold text-neutral-200 mt-3 mb-1 border-b border-neutral-700 pb-1">Phases ({selectedVRDI.phases.length})</h4>
            <div className="space-y-1.5 text-[10px]">
              {selectedVRDI.phases.map((phase, idx) => (
                <div key={idx} className={`p-1.5 rounded ${phase.isActive ? 'bg-sky-700/30' : phase.isComplete ? 'bg-green-700/30' : 'bg-neutral-700/30'}`}>
                  <p className="font-semibold text-neutral-100">Phase {idx + 1}: <span className="font-normal text-neutral-200">${phase.amount} USDC</span></p>
                  <p className={`font-medium ${phase.isActive ? 'text-sky-300' : phase.isComplete ? 'text-green-300' : 'text-neutral-400'}`}>
                    Status: {phase.isComplete ? `Completed (${phase.completionTimestamp || 'N/A'})` : phase.isActive ? 'Active' : 'Pending'}
                  </p>
                  {phase.evidenceLink && <p>Evidence: <a href={phase.evidenceLink} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline">View</a></p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Proposal Modal */}
      <Dialog open={addProposalOpen} onClose={handleCloseAddProposal} maxWidth="xs" fullWidth
        PaperProps={{
          sx: {
            background: 'rgba(30, 10, 40, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '2px solid #9B4F96',
            borderRadius: 4,
            boxShadow: '0 0 24px #9B4F96aa',
            color: '#e0e0e0',
            fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`,
            fontSize: '0.85rem',
          }
        }}
      >
        <DialogTitle sx={{ color: '#fff', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, fontWeight: 700, letterSpacing: 1, textShadow: '0 0 8px #9B4F9688' }}>Add New Proposal</DialogTitle>
        <DialogContent>
          <TextField
            label="Document Link"
            variant="outlined"
            fullWidth
            value={proposalDocLink}
            onChange={e => setProposalDocLink(e.target.value)}
            disabled={isSubmittingProposal}
            margin="normal"
            autoFocus
            InputProps={{
              sx: {
                color: '#fff',
                fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`,
                fontSize: '0.85rem',
                background: 'rgba(60, 20, 80, 0.25)',
                borderRadius: 2,
              },
            }}
            InputLabelProps={{
              sx: {
                color: '#9B4F96',
                fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`,
                fontSize: '0.85rem',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': {
                  borderColor: '#9B4F96',
                },
                '&:hover fieldset': {
                  borderColor: '#b86ddf',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#9B4F96',
                  boxShadow: '0 0 8px #9B4F9688',
                },
              },
            }}
          />
          {addProposalError && <div style={{ color: '#ff6bcb', fontSize: '0.75rem', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, marginTop: 8 }}>{addProposalError}</div>}
          {addProposalSuccess && <div style={{ color: '#50fa7b', fontSize: '0.75rem', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, marginTop: 8 }}>{addProposalSuccess}</div>}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
          <Button onClick={handleCloseAddProposal} sx={{ color: '#fff', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, background: 'rgba(60, 20, 80, 0.15)', borderRadius: 2, '&:hover': { background: '#9B4F96', color: '#fff' } }} disabled={isSubmittingProposal}>Cancel</Button>
          <Button onClick={handleSubmitProposal} variant="contained" sx={{ background: '#9B4F96', color: '#fff', fontFamily: `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`, borderRadius: 2, boxShadow: '0 0 8px #9B4F9688', '&:hover': { background: '#b86ddf', color: '#fff' } }} disabled={isSubmittingProposal}>
            {isSubmittingProposal ? <CircularProgress size={18} color="inherit" /> : 'Submit'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Finalize Proposal Modal */}
      {showFinalizeModal && finalizeFormValues && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-2">
          <div className="bg-neutral-900 bg-opacity-80 border border-cyan-500 rounded-xl shadow-2xl p-4 w-full max-w-lg" style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-cyan-300 font-mono text-xs font-bold tracking-wider">Finalize Proposal</span>
              <button onClick={closeFinalizeModal} className="text-neutral-400 hover:text-white text-lg">&times;</button>
            </div>
            <div className="space-y-2 text-[11px] font-mono text-neutral-200">
              <div className="flex gap-2 items-center mb-1">
                <button
                  className={`px-2 py-1 rounded text-xs font-mono ${entryMode === 'usdc' ? 'bg-cyan-700 text-white' : 'bg-neutral-800 text-cyan-300'} border border-cyan-700`}
                  onClick={() => setEntryMode('usdc')}
                  type="button"
                >Enter in USDC</button>
                <button
                  className={`px-2 py-1 rounded text-xs font-mono ${entryMode === 'mkvli' ? 'bg-cyan-700 text-white' : 'bg-neutral-800 text-cyan-300'} border border-cyan-700`}
                  onClick={() => setEntryMode('mkvli')}
                  type="button"
                >Enter in MKVLI</button>
                {redemptionPrice && <span className="text-neutral-400 text-xs ml-2">Redemption: 1 MKVLI = {redemptionPrice.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} USDC</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col">Principal Amount (USDC)
                  <input
                    ref={usdcInputRef}
                    type="text"
                    inputMode="decimal"
                    placeholder="USDC (6 decimals)"
                    className={`bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-colors duration-200 ${usdcFlash ? 'bg-cyan-900/40' : ''}`}
                    value={formatWithSpaces(isAdjusted ? usdcAdjusted : usdcUserInput)}
                    onChange={e => handleUSDCInputChange(e.target.value.replace(/ /g, ''))}
                    autoComplete="off"
                    disabled={entryMode !== 'usdc'}
                  />
                  {redemptionPrice && principalAmountRaw && !isNaN(Number(principalAmountRaw)) && (
                    <span className="text-neutral-400 text-[10px] mt-1">Rounded up: {getRoundedUSDC(Number(principalAmountRaw), redemptionPrice).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} USDC → {getMKVLIFromUSDC(getRoundedUSDC(Number(principalAmountRaw), redemptionPrice), redemptionPrice)} MKVLI</span>
                  )}
                </label>
                <label className="flex flex-col">Principal Amount (MKVLI)
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="MKVLI (whole tokens)"
                    className="bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                    value={mkvliAmountRaw}
                    onChange={e => {
                      const cleaned = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                      setMkvliAmountRaw(cleaned);
                      // Update principalAmountRaw to the corresponding USDC value
                      if (redemptionPrice && cleaned) {
                        setPrincipalAmountRaw((getUSDCFromMKVLI(Number(cleaned), redemptionPrice)).toFixed(6));
                        setFinalizeFormValues((prev: any) => ({ ...prev, principalAmount: (getUSDCFromMKVLI(Number(cleaned), redemptionPrice)).toFixed(6) }));
                      }
                    }}
                    autoComplete="off"
                    disabled={entryMode !== 'mkvli'}
                  />
                  {redemptionPrice && mkvliAmountRaw && !isNaN(Number(mkvliAmountRaw)) && (
                    <span className="text-neutral-400 text-[10px] mt-1">{Number(mkvliAmountRaw)} MKVLI → {(getUSDCFromMKVLI(Number(mkvliAmountRaw), redemptionPrice)).toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })} USDC</span>
                  )}
                </label>
              </div>
              <label className="flex flex-col">Interest Rate (BPS)
                <input
                  type="number"
                  step="1"
                  min="0"
                  placeholder="Basis points (bps)"
                  className="bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  value={finalizeFormValues.interestRate}
                  onChange={e => handleFinalizeFormChange('interestRate', e.target.value)}
                />
              </label>
              <label className="flex flex-col">Amortization Duration
                <input type="text" className="bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400" value={finalizeFormValues.amortizationDuration} onChange={e => handleFinalizeFormChange('amortizationDuration', e.target.value)} />
              </label>
              <label className="flex flex-col">Deferral Period
                <input type="text" className="bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400" value={finalizeFormValues.deferralPeriod} onChange={e => handleFinalizeFormChange('deferralPeriod', e.target.value)} />
              </label>
              <label className="flex flex-col">Perpetual Returns
                <input type="text" className="bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400" value={finalizeFormValues.perpetualReturns} onChange={e => handleFinalizeFormChange('perpetualReturns', e.target.value)} />
              </label>
              <label className="flex flex-col">Debtor (address)
                <input type="text" className="bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-400" value={finalizeFormValues.debtor} onChange={e => handleFinalizeFormChange('debtor', e.target.value)} />
              </label>
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-neutral-400">Holders & Amounts</span>
                  <button onClick={addHolderAmountRow} className="text-cyan-400 text-xs font-bold px-2 py-0.5 rounded hover:bg-cyan-900/30">+ Add</button>
                </div>
                {finalizeFormValues.holders.map((holder: string, idx: number) => (
                  <div key={idx} className="flex gap-2 mb-1 items-center">
                    <input type="text" placeholder="Holder address" className="bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 flex-1 focus:outline-none focus:ring-2 focus:ring-cyan-400" value={holder} onChange={e => handleFinalizeHoldersChange(idx, e.target.value)} />
                    <input type="text" placeholder="Amount" className="bg-neutral-800 border border-cyan-700 rounded px-2 py-1 text-xs font-mono text-cyan-200 w-24 focus:outline-none focus:ring-2 focus:ring-cyan-400" value={finalizeFormValues.amounts[idx]} onChange={e => handleFinalizeAmountsChange(idx, e.target.value)} />
                    <button onClick={() => removeHolderAmountRow(idx)} className="text-red-400 text-xs font-bold px-2 py-0.5 rounded hover:bg-red-900/30">Remove</button>
                  </div>
                ))}
              </div>
              {finalizeError && <div className="text-red-400 text-xs font-mono mt-1">{finalizeError}</div>}
              {finalizeSuccess && <div className="text-green-400 text-xs font-mono mt-1">{finalizeSuccess}</div>}
              <div className="flex justify-end mt-2">
                <button onClick={handleFinalizeSubmit} disabled={finalizeLoading} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-1 px-4 rounded shadow text-xs font-mono disabled:opacity-60 disabled:cursor-not-allowed">
                  {finalizeLoading ? 'Finalizing...' : 'Finalize'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* style jsx global block is fine where it is, or can be moved to a global css file */}
      <style jsx global>{`
        .usdc-flash {
          animation: usdcFlashAnim 0.25s;
        }
        @keyframes usdcFlashAnim {
          0% { background-color: #164e63; }
          100% { background-color: transparent; }
        }
      `}</style>
    </div >
  );
};

export default DAODashboard; 