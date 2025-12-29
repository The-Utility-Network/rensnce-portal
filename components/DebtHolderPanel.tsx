import React, { useEffect, useState, useMemo } from 'react';
import { ethers } from 'ethers';
import * as TSPABI from '../primitives/TSPABI';
import { readContract, prepareContractCall, sendAndConfirmTransaction, getContract } from 'thirdweb';
import { useActiveWallet } from 'thirdweb/react';
import Slider from '@mui/material/Slider';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import { baseSepolia, base } from 'thirdweb/chains';
import { client, diamondAddress, default as diamondAbi } from './core/TSPABI';

const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

interface VRDIPhase {
  amount: string;
  isActive: boolean;
  isComplete: boolean;
  evidenceLink?: string;
  completionTimestamp?: string;
  withdrawnAmount: string;
}

interface VRDIData {
  id: string;
  details: any;
  phases: VRDIPhase[];
  status: string;
  canRepay: boolean;
}

const USDC_DECIMALS = 6;

// Helper to safely handle BigNumberish values
function safeBigNumberish(val: any): bigint {
  if (val === null || val === undefined || val === false || val === true || val === '' || typeof val === 'object') return 0n;
  try {
    if (typeof val === 'bigint') return val;
    if (typeof val === 'number') return BigInt(val);
    if (typeof val === 'string' && val !== '') return BigInt(val);
  } catch { }
  return 0n;
}

interface AmortizationPayment {
  date: Date;
  paymentNumber: number;
  principalPayment: bigint;
  interestPayment: bigint;
  totalPayment: bigint;
  cumulativeAmountAfterPayment: bigint;
  remainingBalance: bigint;
}

interface AmortizationSchedule {
  startDate: Date;
  deferralEndDate: Date;
  amortizationStartDate: Date;
  amortizationEndDate: Date;
  monthlyPayment: bigint;
  totalPayments: number;
  scheduledPayments: AmortizationPayment[];
  isCurrentlyInDeferral: boolean;
  totalInterestPaid?: bigint;
}

// Amortization Calculation Helper
const calculateAmortizationSchedule = (vrdiDetails: any): AmortizationSchedule | null => {
  if (!vrdiDetails ||
    !vrdiDetails.startTimestamp ||
    // Allow deferralPeriod to be 0 or undefined (will default to 0n)
    vrdiDetails.deferralPeriod === null || // Explicitly disallow null if it should always be present or 0
    !vrdiDetails.amortizationDuration ||
    !vrdiDetails.totalRepaymentAmount ||
    !vrdiDetails.principalUSDC ||
    !vrdiDetails.interestRate) {
    console.warn("calculateAmortizationSchedule: Missing one or more core vrdiDetails fields required for calculation.", vrdiDetails);
    return null;
  }

  try {
    const startTimestampSec = safeBigNumberish(vrdiDetails.startTimestamp);
    const deferralPeriodSec = safeBigNumberish(vrdiDetails.deferralPeriod); // Defaults to 0n if undefined/null/empty
    const amortizationDurationSec = safeBigNumberish(vrdiDetails.amortizationDuration);
    const totalRepaymentAmountSmallestUnit = safeBigNumberish(vrdiDetails.totalRepaymentAmount);
    const principalUSDCSmallestUnit = safeBigNumberish(vrdiDetails.principalUSDC);

    if (amortizationDurationSec === 0n && totalRepaymentAmountSmallestUnit > 0n) {
      console.warn("Amortization duration is zero but total repayment is expected. Check VRDI data.");
      // Decide how to handle this: maybe 1 payment, or return null if invalid state
      // For now, we let totalPayments become 1 later, but this might be an issue.
    }
    if (totalRepaymentAmountSmallestUnit === 0n && principalUSDCSmallestUnit > 0n) {
      // This might be a valid scenario if it's an interest-only period not captured by deferral, or error in data.
      // This might be a valid scenario if it's an interest-only period not captured by deferral, or error in data.
    }

    const startDate = new Date(Number(startTimestampSec) * 1000);
    const deferralEndDate = new Date(startDate.getTime() + Number(deferralPeriodSec) * 1000);
    const amortizationStartDate = new Date(deferralEndDate.getTime());
    const amortizationEndDate = new Date(amortizationStartDate.getTime() + Number(amortizationDurationSec) * 1000);

    const now = new Date();
    const isCurrentlyInDeferral = now < deferralEndDate;

    const approxMonthInSeconds = 30.4375 * 24 * 60 * 60;
    let totalPayments = 0;
    if (amortizationDurationSec > 0n) {
      totalPayments = Math.max(1, Math.round(Number(amortizationDurationSec) / approxMonthInSeconds));
    } else if (totalRepaymentAmountSmallestUnit > 0n) {
      // If no amortization duration but there's an amount to repay, assume 1 immediate payment after deferral.
      totalPayments = 1;
    } else {
      totalPayments = 0; // No payments if no duration and no amount
    }

    let monthlyPayment = 0n;
    if (totalPayments > 0 && totalRepaymentAmountSmallestUnit > 0n) {
      monthlyPayment = totalRepaymentAmountSmallestUnit / BigInt(totalPayments);
    } else if (totalPayments === 1 && totalRepaymentAmountSmallestUnit > 0n) {
      monthlyPayment = totalRepaymentAmountSmallestUnit; // Entire amount in one payment
    }

    const scheduledPayments: AmortizationPayment[] = [];
    let cumulativePaymentDate = new Date(amortizationStartDate);
    let cumulativeAmountPaid = 0n;
    let remainingPrincipalForInterestCalc = principalUSDCSmallestUnit; // For more detailed future interest calculations

    // Simplified: for now, we don't calculate per-payment interest/principal breakdown here based on interestRate.
    // We assume the totalRepaymentAmount already factors in all interest and derive equal payments.
    // A full amortization table would require iterative calculation of interest on remaining balance.

    for (let i = 1; i <= totalPayments; i++) {
      // Advance payment date by approx one month for each payment
      // This is a simplification; loans often have exact day-of-month payments.
      if (i > 1) {
        cumulativePaymentDate.setMonth(cumulativePaymentDate.getMonth() + 1);
      }
      // Ensure payment date doesn't exceed amortization end date if last payment adjustment is needed.
      const paymentDate = new Date(Math.min(cumulativePaymentDate.getTime(), amortizationEndDate.getTime()));

      let currentPaymentAmount = monthlyPayment;
      // Adjust last payment to exactly match totalRepaymentAmount
      if (i === totalPayments) {
        const amountPaidSoFar = cumulativeAmountPaid + (monthlyPayment * BigInt(totalPayments - 1)); // What would be paid before this last one normally
        // Re-calculate based on total paid so far to ensure exact match
        const totalPaidBeforeThisLastOne = scheduledPayments.reduce((sum, p) => sum + p.totalPayment, 0n);
        currentPaymentAmount = totalRepaymentAmountSmallestUnit - totalPaidBeforeThisLastOne;
        if (currentPaymentAmount < 0n) currentPaymentAmount = 0n; // Should not happen if logic is right
      }

      cumulativeAmountPaid += currentPaymentAmount;

      scheduledPayments.push({
        date: paymentDate,
        paymentNumber: i,
        principalPayment: 0n, // Placeholder
        interestPayment: 0n,  // Placeholder
        totalPayment: currentPaymentAmount,
        cumulativeAmountAfterPayment: cumulativeAmountPaid,
        remainingBalance: totalRepaymentAmountSmallestUnit - cumulativeAmountPaid
      });
    }
    // This loop replaces the post-loop adjustment for the last payment, making it more integrated.

    return {
      startDate,
      deferralEndDate,
      amortizationStartDate,
      amortizationEndDate,
      monthlyPayment,
      totalPayments,
      scheduledPayments,
      isCurrentlyInDeferral,
    };
  } catch (e) {
    console.error("Error calculating amortization schedule:", e);
    return null;
  }
};

// Shared style for input/button group
const controlGroupClass = "flex items-center gap-1 w-full";
const inputClass = "px-2 py-1 rounded text-xs bg-neutral-700 text-white border border-neutral-600 font-mono w-28";
const buttonClass = "px-2 py-1 w-28 bg-cyan-600 text-white rounded text-xs font-mono hover:bg-cyan-700";
const maxButtonClass = "absolute right-1 top-1/2 -translate-y-1/2 px-1 py-0.5 bg-cyan-800 text-white rounded text-xs font-mono hover:bg-cyan-900 z-10";

const DebtHolderPanel: React.FC = () => {
  const [vrdis, setVRDIs] = useState<VRDIData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null); // vrdiId:phaseIndex or vrdiId:repay
  const [evidenceInputs, setEvidenceInputs] = useState<{ [key: string]: string }>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [withdrawInputs, setWithdrawInputs] = useState<{ [key: string]: string }>({});

  // New state for Repayment Modal
  const [showRepayModalForVRDI, setShowRepayModalForVRDI] = useState<VRDIData | null>(null);
  const [repayAmountInput, setRepayAmountInput] = useState<string>("");

  // New state for Amortization data
  const [amortizationSchedule, setAmortizationSchedule] = useState<AmortizationSchedule | null>(null);
  const [isLoadingAmortization, setIsLoadingAmortization] = useState<boolean>(false);
  const [showDeferralConfirm, setShowDeferralConfirm] = useState<boolean>(false);

  const wallet = useActiveWallet();
  const accountObj = wallet?.getAccount();
  const account = accountObj?.address;

  // Determine network based on localStorage flag
  const isTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';

  // Memoized contract instance for the correct chain
  const diamondContract = useMemo(() => getContract({
    client,
    chain: isTestnet ? baseSepolia : base,
    address: diamondAddress,
    abi: diamondAbi,
  }), [isTestnet, diamondAddress]);

  // Calculate HUD data using useMemo
  const hudData = useMemo(() => {
    if (!vrdis || vrdis.length === 0) {
      return {
        totalVRDIs: 0,
        totalPrincipalUSDC: 0n,
        totalPrincipalMKVLI: 0n,
        totalRepaidUSDC: 0n,
        totalPhases: 0,
        completedPhases: 0,
        remainingUSDC: 0n,
      };
    }

    let totalPrincipalUSDC = 0n;
    let totalPrincipalMKVLI = 0n;
    let totalRepaidUSDC = 0n;
    let totalPhases = 0;
    let completedPhases = 0;
    let totalObligationUSDC = 0n;

    vrdis.forEach(vrdi => {
      if (vrdi.details) {
        totalPrincipalUSDC += safeBigNumberish(vrdi.details.principalUSDC);
        totalPrincipalMKVLI += safeBigNumberish(vrdi.details.principalMKVLI20);
        totalRepaidUSDC += safeBigNumberish(vrdi.details.depositedUSDC);
        totalObligationUSDC += safeBigNumberish(vrdi.details.totalRepaymentAmount);
      }
      if (vrdi.phases) {
        totalPhases += vrdi.phases.length;
        vrdi.phases.forEach(phase => {
          if (phase.isComplete) {
            completedPhases++;
          }
        });
      }
    });

    const remainingUSDC = totalObligationUSDC > totalRepaidUSDC ? totalObligationUSDC - totalRepaidUSDC : 0n;

    return {
      totalVRDIs: vrdis.length,
      totalPrincipalUSDC,
      totalPrincipalMKVLI,
      totalRepaidUSDC,
      totalPhases,
      completedPhases,
      remainingUSDC,
    };
  }, [vrdis]);

  useEffect(() => {
    const fetchVRDIs = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get all VRDIs (look back up to 50)
        const nextVRDIIdBigInt = await readContract({
          contract: diamondContract,
          method: 'getNextVRDIId',
          params: []
        });
        const nextVRDIId = Number(nextVRDIIdBigInt);
        const lookback = Math.min(nextVRDIId > 0 ? nextVRDIId : 0, 50);
        const found: VRDIData[] = [];
        for (let i = 0; i < lookback; i++) {
          const vrdiId = BigInt(nextVRDIId - 1 - i);
          if (vrdiId < 0n) break;
          try {
            const details = await readContract({
              contract: diamondContract,
              method: 'getVRDIDetails',
              params: [vrdiId]
            });
            // Debug logs (optional, can remove if not needed)
            // console.log('VRDI details:', details);
            // console.log('details.debtor:', details.debtor, 'account:', String(account));
            if (details && details.debtor && account && details.debtor.toLowerCase() === String(account).toLowerCase()) {
              // Fetch phases
              const phasesTuple = await readContract({
                contract: diamondContract,
                method: 'getVRDIPhases',
                params: [vrdiId]
              });
              // Final defensive: check phasesTuple itself
              let phaseAmountsUSDC: any[] = [], isActiveArr: any[] = [], isCompleteArr: any[] = [],
                evidenceLinksArr: any[] = [], withdrawnAmountsArr: any[] = [], completionTimestampsArr: any[] = [];
              if (Array.isArray(phasesTuple) && phasesTuple.length >= 6) {
                phaseAmountsUSDC = Array.isArray(phasesTuple[0]) ? phasesTuple[0] : [];
                isActiveArr = Array.isArray(phasesTuple[1]) ? phasesTuple[1] : [];
                isCompleteArr = Array.isArray(phasesTuple[2]) ? phasesTuple[2] : [];
                evidenceLinksArr = Array.isArray(phasesTuple[3]) ? phasesTuple[3] : [];
                withdrawnAmountsArr = Array.isArray(phasesTuple[4]) ? phasesTuple[4] : [];
                completionTimestampsArr = Array.isArray(phasesTuple[5]) ? phasesTuple[5] : [];
              }
              const phases: VRDIPhase[] = Array.isArray(phaseAmountsUSDC) ? phaseAmountsUSDC.map((_, idx) => ({
                amount: ethers.formatUnits(safeBigNumberish(phaseAmountsUSDC?.[idx]), USDC_DECIMALS),
                isActive: isActiveArr?.[idx] ?? false,
                isComplete: isCompleteArr?.[idx] ?? false,
                evidenceLink: evidenceLinksArr?.[idx] ?? '',
                completionTimestamp: (completionTimestampsArr?.[idx] && completionTimestampsArr?.[idx] !== 0n)
                  ? new Date(Number(completionTimestampsArr[idx]) * 1000).toLocaleString()
                  : undefined,
                withdrawnAmount: ethers.formatUnits(safeBigNumberish(withdrawnAmountsArr?.[idx]), USDC_DECIMALS),
              })) : [];
              // Determine status and repay eligibility
              const allPhasesComplete = isCompleteArr.every(Boolean);
              const canRepay = allPhasesComplete && !details.isClosed;
              let status = 'Active';
              if (details.isClosed) status = 'Closed';
              else if (allPhasesComplete) status = 'Ready for Repayment';
              else if (isActiveArr.some(Boolean)) status = 'Disbursing';
              else status = 'Pending';
              found.push({ id: vrdiId.toString(), details, phases, status, canRepay });
            }
          } catch (err) { /* skip VRDI on error */ }
        }
        setVRDIs(found);
      } catch (err: any) {
        setError('Failed to fetch VRDIs.');
      }
      setLoading(false);
    };
    fetchVRDIs();
  }, [account, diamondContract]);

  // Action handlers (now with real contract calls)
  const handleWithdraw = async (vrdiId: string, phaseIdx: number) => {
    setActionLoading(`${vrdiId}:withdraw:${phaseIdx}`);
    setSuccessMessage(null);
    setErrorMessage(null);
    if (!account) {
      setErrorMessage('No connected wallet account.');
      setActionLoading(null);
      return;
    }
    try {
      // Find the correct VRDI and phase amount
      const vrdi = vrdis.find(v => v.id === vrdiId);
      const phase = vrdi?.phases[phaseIdx];
      const maxWithdraw = Math.max(0, Number(phase?.amount) - Number(phase?.withdrawnAmount));
      const inputKey = `${vrdiId}:${phaseIdx}`;
      let withdrawAmount = Number(withdrawInputs[inputKey]);
      if (isNaN(withdrawAmount) || withdrawAmount <= 0) withdrawAmount = maxWithdraw;
      if (withdrawAmount > maxWithdraw) withdrawAmount = maxWithdraw;
      const amountUSDC = BigInt(Math.floor(withdrawAmount * 10 ** USDC_DECIMALS));
      const call = prepareContractCall({
        contract: diamondContract,
        method: 'withdrawVRDIFunds',
        params: [BigInt(vrdiId), amountUSDC]
      });
      await sendAndConfirmTransaction({ account: accountObj, transaction: call });
      setSuccessMessage(`Withdrawal successful for VRDI ${vrdiId}, phase ${phaseIdx + 1}`);
      setWithdrawInputs(inputs => ({ ...inputs, [inputKey]: '' })); // Clear input after withdraw
    } catch (err: any) {
      setErrorMessage(`Withdraw failed: ${err.message || err}`);
    } finally {
      setActionLoading(null);
    }
  };
  const handleSubmitEvidence = async (vrdiId: string, phaseIdx: number) => {
    setActionLoading(`${vrdiId}:evidence:${phaseIdx}`);
    setSuccessMessage(null);
    setErrorMessage(null);
    if (!account) {
      setErrorMessage('No connected wallet account.');
      setActionLoading(null);
      return;
    }
    try {
      const evidence = evidenceInputs[`${vrdiId}:${phaseIdx}`] || '';
      const call = prepareContractCall({
        contract: diamondContract,
        method: 'submitPhaseCompletion',
        params: [BigInt(vrdiId), BigInt(phaseIdx), evidence]
      });
      await sendAndConfirmTransaction({ account: accountObj, transaction: call });
      setSuccessMessage(`Evidence submitted for VRDI ${vrdiId}, phase ${phaseIdx + 1}`);
    } catch (err: any) {
      setErrorMessage(`Submit evidence failed: ${err.message || err}`);
    } finally {
      setActionLoading(null);
    }
  };
  const handleRepay = async (vrdiId: string) => {
    // This function will now likely be handleRepayDebtConfirm or similar
    // and called from the modal. The button will call handleOpenRepayModal.
    const vrdiToRepay = vrdis.find(v => v.id === vrdiId);
    if (vrdiToRepay) {
      setShowRepayModalForVRDI(vrdiToRepay);
      const remainingDebt = BigInt(vrdiToRepay.details.totalRepaymentAmount) - BigInt(vrdiToRepay.details.depositedUSDC);
      setRepayAmountInput(ethers.formatUnits(remainingDebt > 0n ? remainingDebt : 0n, USDC_DECIMALS));

      // Calculate and set amortization schedule
      setIsLoadingAmortization(true);
      const schedule = calculateAmortizationSchedule(vrdiToRepay.details);
      setAmortizationSchedule(schedule);
      setIsLoadingAmortization(false);

    } else {
      setErrorMessage("Could not find VRDI details to initiate repayment.");
    }
  };

  const handleRepayDebtConfirm = async (confirmOverrideDeferral: boolean = false) => {
    if (!showRepayModalForVRDI || !accountObj) {
      setErrorMessage("VRDI details or wallet not available for repayment.");
      return;
    }

    // Deferral Period Check
    if (amortizationSchedule?.isCurrentlyInDeferral && !confirmOverrideDeferral) {
      setShowDeferralConfirm(true);
      return; // Wait for user confirmation from the deferral dialog
    }
    setShowDeferralConfirm(false); // Close deferral dialog if open

    const vrdiId = showRepayModalForVRDI.id;
    const amountToRepay = parseFloat(repayAmountInput);

    if (isNaN(amountToRepay) || amountToRepay <= 0) {
      setErrorMessage("Please enter a valid positive amount to repay.");
      return;
    }

    const amountUSDCsmallestUnits = ethers.parseUnits(repayAmountInput, USDC_DECIMALS);

    // Check against remaining debt to prevent overpayment if desired, though contract might handle this.
    const remainingDebtSmallestUnits = BigInt(showRepayModalForVRDI.details.totalRepaymentAmount) - BigInt(showRepayModalForVRDI.details.depositedUSDC);
    if (amountUSDCsmallestUnits > remainingDebtSmallestUnits) {
      setErrorMessage("Repayment amount exceeds remaining debt. Please adjust.");
      // Optionally, cap it: amountUSDCsmallestUnits = remainingDebtSmallestUnits;
      return;
    }

    setActionLoading(`${vrdiId}:repay_confirm`);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const call = prepareContractCall({
        contract: diamondContract,
        method: "depositVRDIPayment",
        params: [BigInt(vrdiId), amountUSDCsmallestUnits]
      });
      await sendAndConfirmTransaction({ account: accountObj, transaction: call });
      setSuccessMessage(`Successfully deposited ${repayAmountInput} USDC for VRDI ${vrdiId}.`);
      setShowRepayModalForVRDI(null);
      setRepayAmountInput("");
      // Trigger data refresh by re-fetching VRDIs
      // This requires fetchVRDIs to be accessible or to have a refresh mechanism
      // For now, assuming a refresh function or manual page refresh by user after success.
      // To implement auto-refresh: wrap fetchVRDIs in useCallback and pass it as dependency or use a counter.
      const updatedVRDIs = vrdis.map(v => v.id === vrdiId ? { ...v, details: { ...v.details, depositedUSDC: BigInt(v.details.depositedUSDC) + amountUSDCsmallestUnits } } : v);
      // More robust: re-fetch the specific VRDI or all VRDIs.
      setVRDIs(updatedVRDIs); // Optimistic update, ideally re-fetch from contract.

    } catch (err: any) {
      setErrorMessage(`Repayment failed: ${err.message || err}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCloseRepayModal = () => {
    setShowRepayModalForVRDI(null);
    setRepayAmountInput("");
  };

  // Close VRDI Handler (placeholder for now)
  const handleCloseVRDI = async (vrdiId: string) => {
    setActionLoading(`${vrdiId}:close`);
    setSuccessMessage(null);
    setErrorMessage(null);
    if (!accountObj) {
      setErrorMessage('No connected wallet account.');
      setActionLoading(null);
      return;
    }
    try {
      const call = prepareContractCall({
        contract: diamondContract,
        method: 'closeVRDI',
        params: [BigInt(vrdiId)]
      });
      await sendAndConfirmTransaction({ account: accountObj, transaction: call });
      setSuccessMessage(`VRDI ${vrdiId} successfully closed.`);
      // Refresh data - optimistic update or re-fetch
      setVRDIs(prevVRDIs => prevVRDIs.map(v => v.id === vrdiId ? { ...v, details: { ...v.details, isClosed: true }, status: "Closed", canRepay: false } : v));
    } catch (err: any) {
      setErrorMessage(`Failed to close VRDI ${vrdiId}: ${err.message || err}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (!account) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm"><div className="p-4 text-neutral-300 font-mono">Connect your wallet to view your VRDIs.</div></div>;
  if (loading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm"><div className="p-4 text-neutral-300 font-mono">Loading VRDIs...<CircularProgress size={20} sx={{ ml: 2 }} /></div></div>;
  if (error) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-sm"><div className="p-4 text-red-400 bg-neutral-800/20 backdrop-blur-md rounded shadow-xl">{error}</div></div>;

  return (
    <div
      className="relative w-full h-full flex flex-col ultra-glass border-none text-zinc-300 text-xs font-sans rounded-3xl overflow-hidden"
    >
      {/* Title Bar */}
      <div className="w-full h-12 flex items-center justify-between px-6 border-b border-white/5 bg-zinc-950/40 backdrop-blur-md flex-shrink-0">
        <h2 className="text-sm font-medium text-zinc-100 tracking-tight flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"></span>
          Debt Holder Oversight
        </h2>
        {/* Close button handled by parent, but we could add a minimizer here if needed, for distinctness we just show title */}
      </div>

      {/* Sticky HUD Area */}
      <Box
        sx={{
          p: 1.5,
          bgcolor: 'rgba(9, 9, 11, 0.4)', // zinc-950/40
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {vrdis.length === 0 && !loading ? (
          <Typography sx={{ fontFamily: 'sans-serif', fontSize: '0.75rem', textAlign: 'center', color: '#a1a1aa' }}>
            No active VRDIs found for this account.
          </Typography>
        ) : (
          <Grid container spacing={2} alignItems="center" justifyContent="center" sx={{ textAlign: 'center' }}>
            <Grid item xs={4} sm>
              <Typography variant="caption" sx={{ display: 'block', color: '#71717a', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total VRDIs</Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#f4f4f5', fontWeight: 600, fontFamily: MONO_FONT_FAMILY }}>{hudData.totalVRDIs}</Typography>
            </Grid>
            <Grid item xs={4} sm>
              <Typography variant="caption" sx={{ display: 'block', color: '#71717a', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Principal (USDC)</Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#f4f4f5', fontWeight: 600, fontFamily: MONO_FONT_FAMILY }}>{ethers.formatUnits(hudData.totalPrincipalUSDC, USDC_DECIMALS)}</Typography>
            </Grid>
            <Grid item xs={4} sm>
              <Typography variant="caption" sx={{ display: 'block', color: '#71717a', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Principal (MKVLI)</Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#f4f4f5', fontWeight: 600, fontFamily: MONO_FONT_FAMILY }}>{hudData.totalPrincipalMKVLI.toString()}</Typography>
            </Grid>
            <Grid item xs={4} sm>
              <Typography variant="caption" sx={{ display: 'block', color: '#71717a', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Repaid (USDC)</Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#34d399', fontWeight: 600, fontFamily: MONO_FONT_FAMILY }}>{ethers.formatUnits(hudData.totalRepaidUSDC, USDC_DECIMALS)}</Typography>
            </Grid>
            <Grid item xs={4} sm>
              <Typography variant="caption" sx={{ display: 'block', color: '#71717a', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Remaining (USDC)</Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#fbbf24', fontWeight: 600, fontFamily: MONO_FONT_FAMILY }}>{ethers.formatUnits(hudData.remainingUSDC, USDC_DECIMALS)}</Typography>
            </Grid>
            <Grid item xs={4} sm>
              <Typography variant="caption" sx={{ display: 'block', color: '#71717a', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Progress</Typography>
              <Typography sx={{ fontSize: '0.9rem', color: '#22d3ee', fontWeight: 600, fontFamily: MONO_FONT_FAMILY }}>{hudData.completedPhases} / {hudData.totalPhases}</Typography>
            </Grid>
          </Grid>
        )}
      </Box>

      {/* Scrollable Content Area */}
      <div className="overflow-y-auto flex-grow styled-scrollbar p-6 bg-transparent">
        {successMessage && <div className="mb-4 p-3 bg-emerald-900/20 text-emerald-300 rounded border border-emerald-900/30 text-xs font-mono">{successMessage}</div>}
        {errorMessage && <div className="mb-4 p-3 bg-red-900/20 text-red-300 rounded border border-red-900/30 text-xs font-mono">{errorMessage}</div>}

        {vrdis.map((vrdi) => {
          const principalFormatted = ethers.formatUnits(safeBigNumberish(vrdi.details.principalUSDC), USDC_DECIMALS);
          const interestRaw = vrdi.details.interestRate;
          const interestPercent = interestRaw ? (Number(interestRaw) / 100).toFixed(2) + '%' : '-';
          const repaidFormatted = ethers.formatUnits(safeBigNumberish(vrdi.details.depositedUSDC), USDC_DECIMALS);
          const totalRepaymentFormatted = ethers.formatUnits(safeBigNumberish(vrdi.details.totalRepaymentAmount), USDC_DECIMALS);
          return (
            <div key={vrdi.id} className="ultra-glass ultra-glass-hover mb-4 p-6 group">
              <div className="mb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:flex lg:gap-8 gap-y-2 text-xs">
                  <div>
                    <span className="block text-zinc-500 uppercase tracking-wider text-[10px] mb-0.5">VRDI ID</span>
                    <span className="font-mono text-zinc-200 text-sm">#{vrdi.id}</span>
                  </div>
                  <div>
                    <span className="block text-zinc-500 uppercase tracking-wider text-[10px] mb-0.5">Principal</span>
                    <span className="font-mono text-cyan-300">{principalFormatted} USDC</span>
                  </div>
                  <div>
                    <span className="block text-zinc-500 uppercase tracking-wider text-[10px] mb-0.5">Total Owed</span>
                    <span className="font-mono text-zinc-300">{totalRepaymentFormatted} USDC</span>
                  </div>
                  <div>
                    <span className="block text-zinc-500 uppercase tracking-wider text-[10px] mb-0.5">Repaid</span>
                    <span className="font-mono text-emerald-400">{repaidFormatted} USDC</span>
                  </div>
                  <div>
                    <span className="block text-zinc-500 uppercase tracking-wider text-[10px] mb-0.5">Interest</span>
                    <span className="font-mono text-zinc-400">{interestPercent}</span>
                  </div>
                  <div>
                    <span className="block text-zinc-500 uppercase tracking-wider text-[10px] mb-0.5">Status</span>
                    <span className="font-sans font-medium text-cyan-400">{vrdi.status}</span>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  {vrdi.canRepay && (
                    <button
                      className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-sm text-[11px] font-bold uppercase tracking-wide transition-colors shadow-lg shadow-cyan-900/20 flex items-center"
                      disabled={actionLoading === `${vrdi.id}:repay`}
                      onClick={() => handleRepay(vrdi.id)}
                    >
                      {actionLoading === `${vrdi.id}:repay` ? <CircularProgress size={12} color="inherit" sx={{ mr: 1 }} /> : null} Repay Debt
                    </button>
                  )}
                  {BigInt(vrdi.details.depositedUSDC) >= BigInt(vrdi.details.totalRepaymentAmount) && !vrdi.details.isClosed && (
                    <button
                      className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600 rounded-sm text-[11px] font-bold uppercase tracking-wide transition-colors flex items-center"
                      disabled={actionLoading === `${vrdi.id}:close`}
                      onClick={() => handleCloseVRDI(vrdi.id)}
                    >
                      {actionLoading === `${vrdi.id}:close` ? <CircularProgress size={12} color="inherit" sx={{ mr: 1 }} /> : null} Close VRDI
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-zinc-950/50 rounded border border-white/5 p-3">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 font-medium">Phases Breakdown</div>
                <div className="space-y-2">
                  {vrdi.phases.map((phase, idx) => (
                    <div key={idx} className="p-3 bg-zinc-900/50 rounded border border-white/5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs">
                      <div className="flex-grow grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                        <div className="font-mono text-zinc-400">Phase {idx + 1}</div>
                        <div>
                          <span className="text-zinc-500 mr-2 text-[10px] uppercase">Allocated</span>
                          <span className="font-mono text-zinc-200">{phase.amount}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500 mr-2 text-[10px] uppercase">Withdrawn</span>
                          <span className="font-mono text-zinc-300">{phase.withdrawnAmount}</span>
                        </div>
                        <div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide border ${phase.isComplete ? 'border-emerald-900/50 bg-emerald-950/30 text-emerald-400' : phase.isActive ? 'border-amber-900/50 bg-amber-950/30 text-amber-400' : 'border-zinc-800 bg-zinc-900 text-zinc-500'}`}>
                            {phase.isComplete ? 'Complete' : phase.isActive ? 'Active' : 'Pending'}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end min-w-[200px]">
                        {phase.evidenceLink && (
                          <a href={phase.evidenceLink} target="_blank" rel="noopener noreferrer" className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 hover:text-cyan-300 text-[10px] rounded border border-zinc-700 transition-colors">
                            View Evidence
                          </a>
                        )}
                        {phase.isActive && !phase.isComplete && Number(phase.withdrawnAmount) < Number(phase.amount) && (
                          <div className="flex items-center gap-1">
                            <div className="relative w-24">
                              <input
                                type="number"
                                min="0"
                                step="0.000001"
                                max={Math.max(0, Number(phase.amount) - Number(phase.withdrawnAmount))}
                                className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-[10px] font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/50 pr-8"
                                placeholder="Amt"
                                value={withdrawInputs[`${vrdi.id}:${idx}`] || ''}
                                onChange={e => {
                                  let val = e.target.value;
                                  if (Number(val) > Math.max(0, Number(phase.amount) - Number(phase.withdrawnAmount))) val = String(Math.max(0, Number(phase.amount) - Number(phase.withdrawnAmount)));
                                  setWithdrawInputs(inputs => ({ ...inputs, [`${vrdi.id}:${idx}`]: val }));
                                }}
                              />
                              <button
                                className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] uppercase font-bold text-cyan-600 hover:text-cyan-400"
                                onClick={() => setWithdrawInputs(inputs => ({ ...inputs, [`${vrdi.id}:${idx}`]: String(Math.max(0, Number(phase.amount) - Number(phase.withdrawnAmount))) }))}
                              >
                                Max
                              </button>
                            </div>
                            <button
                              className="px-3 py-1 bg-zinc-100 hover:bg-white text-zinc-900 rounded-sm text-[10px] font-bold uppercase tracking-wide transition-colors disabled:opacity-50"
                              disabled={actionLoading === `${vrdi.id}:withdraw:${idx}`}
                              onClick={() => handleWithdraw(vrdi.id, idx)}
                            >
                              {actionLoading === `${vrdi.id}:withdraw:${idx}` ? <CircularProgress size={10} color="inherit" /> : 'Withdraw'}
                            </button>
                          </div>
                        )}
                        {phase.isActive && !phase.isComplete && (
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              className="w-32 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-[10px] font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                              placeholder="Evidence link..."
                              value={evidenceInputs[`${vrdi.id}:${idx}`] || ''}
                              onChange={e => setEvidenceInputs(inputs => ({ ...inputs, [`${vrdi.id}:${idx}`]: e.target.value }))}
                            />
                            <button
                              className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-600 rounded-sm text-[10px] font-medium transition-colors disabled:opacity-50"
                              disabled={actionLoading === `${vrdi.id}:evidence:${idx}` || !(evidenceInputs[`${vrdi.id}:${idx}`] && evidenceInputs[`${vrdi.id}:${idx}`].length > 0)}
                              onClick={() => handleSubmitEvidence(vrdi.id, idx)}
                            >
                              {actionLoading === `${vrdi.id}:evidence:${idx}` ? <CircularProgress size={10} color="inherit" /> : 'Submit'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showRepayModalForVRDI && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900/95 p-6 rounded-xl shadow-2xl w-full max-w-md border border-white/10 font-sans">
            <div className="flex justify-between items-center mb-6 border-b border-white/5 pb-4">
              <h3 className="text-sm font-medium text-zinc-100 tracking-tight">Repay Debt <span className="font-mono text-zinc-500 ml-2">#{showRepayModalForVRDI.id}</span></h3>
              <button onClick={handleCloseRepayModal} className="text-zinc-500 hover:text-white transition-colors text-lg">&times;</button>
            </div>

            <div className="text-xs text-zinc-400 space-y-2 mb-6 bg-zinc-950/50 p-4 rounded border border-white/5 font-mono">
              <div className="flex justify-between"><span>Principal:</span> <span className="text-zinc-200">{ethers.formatUnits(safeBigNumberish(showRepayModalForVRDI.details.principalUSDC), USDC_DECIMALS)} USDC</span></div>
              <div className="flex justify-between"><span>Total Obligation:</span> <span className="text-zinc-200">{ethers.formatUnits(safeBigNumberish(showRepayModalForVRDI.details.totalRepaymentAmount), USDC_DECIMALS)} USDC</span></div>
              <div className="flex justify-between"><span>Paid:</span> <span className="text-emerald-400">{ethers.formatUnits(safeBigNumberish(showRepayModalForVRDI.details.depositedUSDC), USDC_DECIMALS)} USDC</span></div>
              <div className="flex justify-between pt-2 border-t border-white/5 mt-2"><span>Remaining:</span> <span className="text-amber-400 font-bold">
                {ethers.formatUnits(
                  BigInt(showRepayModalForVRDI.details.totalRepaymentAmount) > BigInt(showRepayModalForVRDI.details.depositedUSDC) ?
                    BigInt(showRepayModalForVRDI.details.totalRepaymentAmount) - BigInt(showRepayModalForVRDI.details.depositedUSDC) : 0n,
                  USDC_DECIMALS
                )} USDC
              </span></div>
            </div>

            <div className="text-xs text-zinc-500 my-2">
              {isLoadingAmortization ? (
                <div className="flex items-center justify-center py-8"><CircularProgress size={24} color="inherit" /></div>
              ) : amortizationSchedule ? (
                <Box sx={{ px: 1, mt: 2, mb: 3 }}>
                  <Typography variant="caption" sx={{ color: '#71717a', mb: 1, display: 'block' }}>Select Repayment Amount</Typography>
                  <Slider
                    aria-label="Repayment Amount"
                    value={parseFloat(repayAmountInput) || 0}
                    onChange={(event, newValue) => setRepayAmountInput(newValue.toString())}
                    valueLabelFormat={(value) => `${value.toFixed(USDC_DECIMALS)} USDC`}
                    valueLabelDisplay="auto"
                    step={0.000001}
                    min={0}
                    max={Number(ethers.formatUnits(BigInt(showRepayModalForVRDI.details.totalRepaymentAmount), USDC_DECIMALS))}
                    marks={amortizationSchedule.scheduledPayments.map((p, index) => ({
                      value: Number(ethers.formatUnits(p.cumulativeAmountAfterPayment - BigInt(showRepayModalForVRDI.details.depositedUSDC), USDC_DECIMALS)),
                      label: '', // Hiding labels for cleaner look in small modal
                    }))}
                    sx={{
                      color: amortizationSchedule.isCurrentlyInDeferral ? '#f59e0b' : '#06b6d4',
                      height: 4,
                      '& .MuiSlider-thumb': {
                        width: 12,
                        height: 12,
                        backgroundColor: '#fff',
                        border: '2px solid currentColor',
                        '&:hover, &.Mui-focusVisible': {
                          boxShadow: 'none',
                        },
                      },
                      '& .MuiSlider-rail': {
                        opacity: 0.2,
                        backgroundColor: '#fff',
                      },
                      '& .MuiSlider-track': {
                        border: 'none',
                      },
                      '& .MuiSlider-mark': {
                        height: 4,
                        width: 4,
                        borderRadius: '50%',
                        backgroundColor: '#52525b',
                      },
                      '& .MuiSlider-markActive': {
                        backgroundColor: '#fff',
                      }
                    }}
                  />
                  <div className="text-center mt-4 p-3 bg-zinc-800/50 rounded border border-white/5">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">Payment Amount</div>
                    <div className="text-lg font-mono font-bold text-zinc-100">{parseFloat(repayAmountInput).toFixed(USDC_DECIMALS)} <span className="text-sm text-zinc-500 font-sans">USDC</span></div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] text-zinc-500 font-mono">
                    <div>Next Payment: {amortizationSchedule.monthlyPayment ? ethers.formatUnits(amortizationSchedule.monthlyPayment, USDC_DECIMALS) : '0'} USDC</div>
                    <div className="text-right">{amortizationSchedule.totalPayments} Installments</div>
                  </div>

                  {amortizationSchedule.isCurrentlyInDeferral &&
                    <div className="mt-3 p-2 bg-amber-900/20 text-amber-500 text-[10px] border border-amber-900/30 rounded flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      In Deferral Period ({amortizationSchedule.deferralEndDate.toLocaleDateString()})
                    </div>}
                </Box>
              ) : (
                <p className="py-8 text-center text-zinc-600">Amortization details unavailable.</p>
              )}
            </div>

            <Dialog open={showDeferralConfirm} onClose={() => setShowDeferralConfirm(false)} PaperProps={{ sx: { bgcolor: '#18181b', color: '#e4e4e7', border: '1px solid #27272a', borderRadius: '12px' } }}>
              <DialogTitle sx={{ fontFamily: 'sans-serif', color: '#fbbf24', fontSize: '1rem' }}>Deferral Period Active</DialogTitle>
              <DialogContent>
                <DialogContentText sx={{ fontFamily: 'sans-serif', color: '#a1a1aa', fontSize: '0.875rem' }}>
                  This VRDI is currently in its deferral period. Are you sure you want to make a repayment now?
                </DialogContentText>
              </DialogContent>
              <DialogActions sx={{ p: 2 }}>
                <Button onClick={() => setShowDeferralConfirm(false)} sx={{ color: '#71717a', textTransform: 'none' }}>Cancel</Button>
                <Button onClick={() => handleRepayDebtConfirm(true)} variant="contained" sx={{ bgcolor: '#fbbf24', color: '#000', textTransform: 'none', '&:hover': { bgcolor: '#f59e0b' } }} autoFocus>
                  Yes, Repay Now
                </Button>
              </DialogActions>
            </Dialog>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={handleCloseRepayModal} className="px-4 py-2 text-zinc-400 hover:text-white text-xs font-medium transition-colors" disabled={actionLoading === `${showRepayModalForVRDI.id}:repay_confirm`}>
                Cancel
              </button>
              <button
                onClick={() => handleRepayDebtConfirm()}
                disabled={actionLoading === `${showRepayModalForVRDI.id}:repay_confirm`}
                className="px-6 py-2 bg-zinc-100 hover:bg-white text-zinc-900 font-bold rounded-sm shadow-xl text-xs tracking-wide uppercase transition-transform active:scale-95 disabled:opacity-50"
              >
                {actionLoading === `${showRepayModalForVRDI.id}:repay_confirm` ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtHolderPanel; 