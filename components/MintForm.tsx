// @ts-nocheck
'use client';
import Image from 'next/image';
import { ethers } from 'ethers';
// import axios from 'axios'; // Commented out, was for Reservoir
import { useActiveAccount, ConnectEmbed, useActiveWallet } from 'thirdweb/react';
import { useState, useEffect, ChangeEvent, useRef, useCallback } from 'react';
// import FiatMinting from './fiatMintButton'; // Comment out if not used in this flow

import * as TSPABI from './core/TSPABI'; // Import all as TSPABI
import { prepareContractCall, sendAndConfirmTransaction, getContractEvents, prepareEvent, readContract, getContract } from 'thirdweb'; // getBlock is top-level
import { getBuyWithFiatQuote, getBuyWithFiatStatus } from 'thirdweb/pay'; // Added Pay imports
// getEvents will be called via TSPABI.contract.events.getEvents

import MinusIcon from '@heroicons/react/24/outline/MinusIcon';
import PlusIcon from '@heroicons/react/24/outline/PlusIcon';
import ArrowPathIcon from '@heroicons/react/24/outline/ArrowPathIcon'; // Import Refresh Icon
import RedemptionPriceChart, { PriceDataPoint } from './RedemptionPriceChart'; // Restore chart import

const CONTRACT_ADDRESS = process.env.MINT_CONTRACT; // RENSNCE Diamond Address
const USDC_DECIMALS = 6; // Standard for USDC
const MIN_USDC_PRICE_PER_TOKEN_DISPLAY = 1.11; // For display and comparison
const MIN_USDC_PRICE_PER_TOKEN_SMALLEST_UNIT = BigInt(Math.floor(MIN_USDC_PRICE_PER_TOKEN_DISPLAY * (10 ** USDC_DECIMALS))); // For contract interaction
const mintOpeningSoon = process.env.MINT_SOON === 'true';

// TODO: Ensure this env variable is set with the correct USDC contract address
const USDC_CONTRACT_ADDRESS_MAIN = process.env.USDC_CONTRACT_ADDRESS || "";
const USDC_CONTRACT_ADDRESS_TEST = process.env.USDC_CONTRACT_ADDRESS_TESTNET || "";
const USDC_CONTRACT_ADDRESS = (TSPABI.contract.chain.id === 84532 ? USDC_CONTRACT_ADDRESS_TEST : USDC_CONTRACT_ADDRESS_MAIN);
const MKVLI_TOKEN_ADDRESS_MAIN = process.env.MKVLI_TOKEN_ADDRESS || "";
const MKVLI_TOKEN_ADDRESS_TEST = process.env.MKVLI_TOKEN_ADDRESS_TESTNET || "";
// Decide which MKVLI contract to use based on the chain currently selected by TSPABI
const MKVLI_TOKEN_ADDRESS = (TSPABI.contract.chain.id === 84532 ? MKVLI_TOKEN_ADDRESS_TEST : MKVLI_TOKEN_ADDRESS_MAIN);

// No RPC URLs are embedded in the client bundle. We'll ask the chain object for its public RPC at runtime.

// Define parts for the main formula and the Sigma (Circulating Supply) calculation
const MAIN_FORMULA_SYMBOLS = {
  price: { symbol: 'Ψ', name: 'Redemption Price' },   // Was Ω, now Ψ
  reserve: { symbol: 'Ω', name: 'USDC Reserve' },     // Was Ψ, now Ω
  supply: { symbol: 'Σ', name: 'Circulating MKVLI' },
};

const SIGMA_COMPONENTS = {
  T: { symbol: 'T', name: 'Total MKVLI Supply' },
  Rt: { symbol: 'R' + '<sub>♢</sub>', name: 'Diamond MKVLI Reserve' },
  B: { symbol: 'B', name: 'Burned MKVLI Tokens' },
};
const SIGMA_CALCULATION_FORMULA_STRING = `${MAIN_FORMULA_SYMBOLS.supply.symbol} = ${SIGMA_COMPONENTS.T.symbol} - ${SIGMA_COMPONENTS.Rt.symbol} - ${SIGMA_COMPONENTS.B.symbol}`;
const SYMBOLIC_REDEMPTION_PRICE_FORMULA_STRING = `${MAIN_FORMULA_SYMBOLS.price.symbol} = ${MAIN_FORMULA_SYMBOLS.reserve.symbol} / ${MAIN_FORMULA_SYMBOLS.supply.symbol}`;

const STATS_CACHE_KEY = 'mint_form_live_stats';

// Cache Helper Types
interface LiveStatsCache {
  timestamp: number;
  actualUsdcInContract: string; // BigInt as string
  mkvliInReserve: string;       // BigInt as string
  price: string;                // BigInt as string
}

function getStatsCache(): LiveStatsCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STATS_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to parse live stats cache", e);
    return null;
  }
}

function setStatsCache(data: LiveStatsCache) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STATS_CACHE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save live stats cache", e);
  }
}

// Constants from mintButton.tsx that might be useful
const MAX_USDC_PER_TX = 2500;

// Corrected MintStep type to use underscores consistently
type MintStep =
  | 'idle'
  | 'referral_api_start'
  | 'checking_balance'
  | 'insufficient_balance' // User needs more funds
  | 'awaiting_onramp'      // Onramp link provided, user action needed
  | 'polling_onramp_status'// Actively polling after user indicates completion
  // | 'onramp_chunk_complete' // Removed for simplified single onramp attempt per click
  | 'onramp_complete'      // Polling successful
  | 'checking_allowance'
  | 'needs_approval'
  | 'approving'
  | 'ready_to_mint'
  | 'minting'
  | 'referral_api_success'
  | 'success'
  | 'error';

const MINIMAL_ERC20_ABI_FOR_BALANCE = [
  { "type": "function", "name": "balanceOf", "inputs": [{ "name": "account", "type": "address" }], "outputs": [{ "name": "", "type": "uint256" }], "stateMutability": "view" }
] as const;

const PRICE_HISTORY_CACHE_KEY = "mkvliPriceHistoryCache_v2"; // Added version in case structure changes

// Cache Helper Functions
const getPriceHistoryCache = (): { priceHistory: PriceDataPoint[]; lastFetchedBlock: bigint | null } | null => {
  try {
    const cached = localStorage.getItem(PRICE_HISTORY_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      // Convert lastFetchedBlock back to BigInt if it exists
      if (parsed.lastFetchedBlock) {
        parsed.lastFetchedBlock = BigInt(parsed.lastFetchedBlock);
      }
      return parsed;
    }
  } catch (error) {
    console.error("Error reading price history from cache:", error);
    localStorage.removeItem(PRICE_HISTORY_CACHE_KEY); // Clear corrupted cache
  }
  return null;
};

const setPriceHistoryCache = (data: { priceHistory: PriceDataPoint[]; lastFetchedBlock: bigint | null }) => {
  try {
    // Convert lastFetchedBlock to string for JSON compatibility
    const cacheableData = {
      ...data,
      lastFetchedBlock: data.lastFetchedBlock ? data.lastFetchedBlock.toString() : null,
    };
    localStorage.setItem(PRICE_HISTORY_CACHE_KEY, JSON.stringify(cacheableData));
  } catch (error) {
    console.error("Error saving price history to cache:", error);
  }
};

// ---------------------------------------------------------------------------
// Serverless price-history APIs (Base Sepolia vs Base Mainnet)
// ---------------------------------------------------------------------------

const PRICE_API_ENDPOINT_TESTNET = process.env.PRICE_API_ENDPOINT_TEST ??
  "https://rensnce-redemption-fn.azurewebsites.net/api/getAllPrices"; // Sepolia default

const PRICE_API_ENDPOINT_MAINNET = process.env.PRICE_API_ENDPOINT_MAIN ??
  "https://rensncemn-redemption-fn.azurewebsites.net/api/getAllPrices"; // Mainnet default

const fetchPriceHistoryFromAPI = async (): Promise<PriceDataPoint[]> => {
  const isTestnetChain = TSPABI.contract?.chain?.id === 84532; // Base-Sepolia
  const endpoint = isTestnetChain ? PRICE_API_ENDPOINT_TESTNET : PRICE_API_ENDPOINT_MAINNET;
  try {
    const res = await fetch(endpoint, { next: { revalidate: 0 } as any } as RequestInit);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data as any[]).map((row) => {
      const timestamp = Math.floor(
        new Date(row.ts ?? row.evt_timestamp ?? row.timestamp).getTime() / 1000
      );

      const point: Record<string, number> = { timestamp };

      const indexMap = [
        'totalSupply',
        'mkvliInReserve',
        'mkvliBurned',
        'mkvliCirculatingSupply',
        'actualUsdcInContract',
        'usdcDeployedInVRDIs',
        'effectiveUsdcReserve',
        'redemptionPrice',
      ] as const;

      const skip = new Set(["ts", "evt_timestamp", "timestamp", "id", "block", "tx"]);

      for (const [kRaw, v] of Object.entries(row)) {
        if (skip.has(kRaw)) continue;

        // Map numeric indices to names if necessary
        let k = kRaw;
        if (/^\d+$/.test(kRaw)) {
          const idx = parseInt(kRaw, 10);
          if (idx >= 0 && idx < indexMap.length) k = indexMap[idx];
        }

        // Normalise key names – map legacy aliases to canonical ones
        if (k === "price") k = "redemptionPrice";
        if (k === "reserveTokens") k = "mkvliInReserve";
        if (k === "burnTokens") k = "mkvliBurned";
        if (k === "circulatingSupply") k = "mkvliCirculatingSupply";
        if (k === "ethReserve") k = "actualUsdcInContract";

        if (/^\d+$/.test(k)) continue; // ignore numeric index keys

        let num = typeof v === "string" ? parseFloat(v) : (v as number);

        // Fix: Scale raw contract values from API if they appear unscaled (heuristically > 1M for small token counts, or just apply strictly)
        // Strictly applying based on key is safer.
        if (['actualUsdcInContract', 'usdcDeployedInVRDIs', 'effectiveUsdcReserve'].includes(k)) {
          // If the value is huge (e.g. > 1000000), assume it is unscaled wei/units
          if (num > 100000) num = num / (10 ** 6);
        } else if (['totalSupply', 'mkvliInReserve', 'mkvliBurned', 'mkvliCirculatingSupply'].includes(k)) {
          if (num > 100000) num = num / (10 ** 18);
        }

        if (!isNaN(num)) point[k] = num;
      }

      return point as PriceDataPoint;
    });
  } catch (err) {
    console.error("[PriceAPI] fetch failed", err);
    return [];
  }
};

// Re-define USDC_ABI for ERC20 operations within this form
const USDC_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Helper to fetch first available RPC URL from the Chain object (no env exposure)
const getRpcUrl = (): string | null => {
  const chain: any = TSPABI.contract?.chain;
  const rpcField = chain?.rpc;
  const rpcFromDirect = typeof rpcField === 'string' ? rpcField : Array.isArray(rpcField) ? rpcField[0] : undefined;
  return (
    rpcFromDirect ||
    (Array.isArray(chain?.rpc) ? chain.rpc[0] : undefined) ||
    chain?.rpcUrls?.default?.http?.[0] ||
    chain?.rpcUrls?.public?.http?.[0] ||
    null
  );
};

export default function Form() {
  const activeAccount = useActiveAccount();
  const wallet = useActiveWallet();
  const thirdwebClient = TSPABI.client;
  const accountDisplay = activeAccount
    ? `${activeAccount.address.slice(0, 4)}...${activeAccount.address.slice(-4)}`
    : '';

  const [tokens, setTokens] = useState<number>(1);
  const [fetchedPriceSmallestUnit, setFetchedPriceSmallestUnit] = useState<bigint | null>(null);
  const [finalPricePerTokenSmallestUnit, setFinalPricePerTokenSmallestUnit] = useState<bigint>(MIN_USDC_PRICE_PER_TOKEN_SMALLEST_UNIT);
  const [totalUsdcCost, setTotalUsdcCost] = useState<bigint>(BigInt(0));
  const [mkvliDecimals, setMkvliDecimals] = useState<number>(0);
  const [userMkvliBalance, setUserMkvliBalance] = useState<bigint | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [usdcAllowance, setUsdcAllowance] = useState<bigint>(BigInt(0));
  const [currentTotalSupplySmallestUnit, setCurrentTotalSupplySmallestUnit] = useState<bigint | null>(null); // NEW BigInt state for calculations
  const [currentSupplyDisplay, setCurrentSupplyDisplay] = useState<string>('0'); // NEW String state for display
  const [usdcReserveInContract, setUsdcReserveInContract] = useState<bigint>(BigInt(0));
  const [diamondMkvliReserve, setDiamondMkvliReserve] = useState<bigint | null>(null);
  const [latestBurnedTokens, setLatestBurnedTokens] = useState<bigint | null>(null);
  const [isLoadingMkvliData, setIsLoadingMkvliData] = useState<boolean>(true);
  const [isLoadingPrice, setIsLoadingPrice] = useState<boolean>(true);
  const [isLoadingPriceHistory, setIsLoadingPriceHistory] = useState<boolean>(true);
  const [isLoadingTransaction, setIsLoadingTransaction] = useState<boolean>(false); // General loading for button
  const [error, setError] = useState<string>('');
  const [priceHistory, setPriceHistory] = useState<PriceDataPoint[]>([]);
  const [hoveredMainSymbol, setHoveredMainSymbol] = useState<string | null>(null);
  const [hoveredSigmaCalcSymbol, setHoveredSigmaCalcSymbol] = useState<string | null>(null);
  const [isSigmaPinned, setIsSigmaPinned] = useState<boolean>(false);
  const [latestActualReserve, setLatestActualReserve] = useState<number | null>(null);
  const [latestEffectiveReserve, setLatestEffectiveReserve] = useState<number | null>(null);
  const [totalProposals, setTotalProposals] = useState<number>(0);
  const [passedProposals, setPassedProposals] = useState<number>(0);
  const [activeLoans, setActiveLoans] = useState<number>(0);
  const [closedLoans, setClosedLoans] = useState<number>(0);
  const [totalLended, setTotalLended] = useState<number>(0);
  const [totalRepaid, setTotalRepaid] = useState<number>(0);
  const [mkvliReserve, setMkvliReserve] = useState<number>(0);

  const [mintStep, setMintStep] = useState<MintStep>('idle');
  const [stepError, setStepError] = useState<string>('');
  const [showOnrampModal, setShowOnrampModal] = useState<boolean>(false); // For a modal explaining onramp
  const [onrampUrl, setOnrampUrl] = useState<string>("");
  const [onrampIntentId, setOnrampIntentId] = useState<string>("");
  const [onrampProgress, setOnrampProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState<boolean>(false);
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null);
  const isMounted = useRef(true);

  const tapSoundEffectRef = useRef<HTMLAudioElement | null>(null);

  // Add new state for redeem
  const [redeemAmount, setRedeemAmount] = useState<number>(1); // Amount of MKVLI to redeem
  const [isRedeeming, setIsRedeeming] = useState<boolean>(false);
  // const [redeemError, setRedeemError] = useState<string>(''); // To be replaced by error modal
  // const [redeemSuccessMessage, setRedeemSuccessMessage] = useState<string>(''); // To be replaced by success modal
  const [showRedeemSuccessModal, setShowRedeemSuccessModal] = useState<boolean>(false);
  const [redeemSuccessTxHash, setRedeemSuccessTxHash] = useState<string | null>(null);

  // New state for generic error modal
  const [showErrorModal, setShowErrorModal] = useState<boolean>(false);
  const [errorModalTitle, setErrorModalTitle] = useState<string>("Error");
  const [errorModalMessage, setErrorModalMessage] = useState<string>("");

  // Add the new state variables for DIO confirmation here
  const [showRedeemDIOConfirmModal, setShowRedeemDIOConfirmModal] = useState<boolean>(false);
  const [dioConfirmDetails, setDioConfirmDetails] = useState<{ amount: number; subtext: string; tokenIdsWithMarkers?: string[] } | null>(null);

  // UX State
  const [mode, setMode] = useState<'MINT' | 'REDEEM'>('MINT');
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [showChart, setShowChart] = useState<boolean>(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null); // Ref for the timeout

  const calculatedSigma = () => { // Helper to get current circulating supply as BigInt
    const T = currentTotalSupplySmallestUnit ?? BigInt(0); // Use new BigInt state
    const Rd = diamondMkvliReserve ?? BigInt(0);
    const B = latestBurnedTokens ?? BigInt(0);
    const sigma = T - Rd - B;
    return sigma > 0n ? sigma : 0n;
  };

  // Define fetchAllContractData as a useCallback to stabilize its reference if passed as prop or used in many useEffects,
  // or just define as const if only called from one useEffect and event handlers.
  // For simplicity here, just defining as async const.
  const fetchAllContractData = useCallback(async (forceRefresh = false) => {
    console.log("fetchAllContractData called. forceRefresh:", forceRefresh);

    // 1. Check Cache for Live Stats (if not forcing refresh)
    if (!forceRefresh) {
      const cachedStats = getStatsCache();
      if (cachedStats) {
        // Hydrate from cache immediately for speed
        if (cachedStats.actualUsdcInContract) setLatestActualReserve(BigInt(cachedStats.actualUsdcInContract));
        if (cachedStats.mkvliInReserve) setMkvliReserve(BigInt(cachedStats.mkvliInReserve));
        // We still fetch history/events in background or if needed, but this gives instant "Live" numbers
      }
    }

    setIsLoadingMkvliData(true);
    setIsLoadingPrice(true);
    setIsLoadingPriceHistory(true);

    let initialPriceHistoryFromCache: PriceDataPoint[] = [];
    const MIN_SCAN_BLOCK_FALLBACK = 25579353n;
    let fromBlockForNewEvents: bigint;

    const cachedData = getPriceHistoryCache();
    const rpcUrl = getRpcUrl();
    if (!rpcUrl) { throw new Error("No RPC URL available for current chain"); }
    const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);
    const latestChainBlockNumber = BigInt(await ethersProvider.getBlockNumber());

    if (cachedData && cachedData.lastFetchedBlock) {
      initialPriceHistoryFromCache = cachedData.priceHistory || [];
      fromBlockForNewEvents = cachedData.lastFetchedBlock + 1n;
    } else {
      const DESIRED_HISTORY_DAYS = 7;
      const BLOCKS_PER_DAY_BASE = (60n / 2n) * 60n * 24n;
      const blocksToScanBack = BLOCKS_PER_DAY_BASE * BigInt(DESIRED_HISTORY_DAYS);
      let calculatedStartBlock = latestChainBlockNumber - blocksToScanBack;
      if (calculatedStartBlock < MIN_SCAN_BLOCK_FALLBACK) {
        calculatedStartBlock = MIN_SCAN_BLOCK_FALLBACK;
      }
      fromBlockForNewEvents = calculatedStartBlock;
    }
    setPriceHistory(initialPriceHistoryFromCache.sort((a, b) => a.timestamp - b.timestamp));

    try {
      const apiHistory = await fetchPriceHistoryFromAPI();
      if (apiHistory.length) {
        initialPriceHistoryFromCache = apiHistory;
        setPriceHistory(apiHistory);
        fromBlockForNewEvents = latestChainBlockNumber + 1n;
        setPriceHistoryCache({ priceHistory: apiHistory, lastFetchedBlock: latestChainBlockNumber });
      }
    } catch (apiErr) {
      console.error("[MintForm] price API error", apiErr);
    }

    let latestEventTotalSupplyBigInt: bigint | null = null;
    let fetchedDiamondMkvliReserve: bigint | null = null;

    try {
      const metadata = await TSPABI.getTokenMetadata();
      let decimalsForFormatting = 18;

      if (metadata && typeof metadata.decimals === 'number') {
        setMkvliDecimals(metadata.decimals);
        decimalsForFormatting = metadata.decimals;
      } else {
        setMkvliDecimals(0);
        decimalsForFormatting = 0;
      }

      const usdcReserveVal = await TSPABI.getUSDCReserve();
      if (usdcReserveVal !== null) setUsdcReserveInContract(usdcReserveVal as bigint);

      const dynamicPrice = await TSPABI.calculateRedemptionPrice();
      if (dynamicPrice !== null) {
        setFetchedPriceSmallestUnit(dynamicPrice);
        setFinalPricePerTokenSmallestUnit(dynamicPrice > MIN_USDC_PRICE_PER_TOKEN_SMALLEST_UNIT ? dynamicPrice : MIN_USDC_PRICE_PER_TOKEN_SMALLEST_UNIT);
      } else {
        setFinalPricePerTokenSmallestUnit(MIN_USDC_PRICE_PER_TOKEN_SMALLEST_UNIT);
      }

      if (activeAccount?.address && TSPABI.contract) {
        try {
          const balance = await readContract({ contract: TSPABI.contract, method: "balanceOf", params: [activeAccount.address] });
          setUserMkvliBalance(balance as bigint);
        } catch (e) {
          console.error("Failed to fetch user MKVLI balance", e);
          setUserMkvliBalance(null);
        }
      }

      if (TSPABI.contract && getRpcUrl()) {
        const preparedEventOld = prepareEvent({ signature: "event DebugRedemptionComponents(uint256 totalSupply, uint256 reserveTokens, uint256 burnTokens, uint256 circulatingSupply, uint256 ethReserve, uint256 redemptionPrice)" });
        const preparedEventNew = prepareEvent({ signature: "event DebugRedemptionComponents(uint256 totalSupply, uint256 mkvliInReserve, uint256 mkvliBurned, uint256 mkvliCirculatingSupply, uint256 actualUsdcInContract, uint256 usdcDeployedInVRDIs, uint256 effectiveUsdcReserve, uint256 redemptionPrice)" });
        const preparedVRDICreated = prepareEvent({ signature: "event VRDICreated(uint256 vrId, uint256 dioId, address debtor, uint256 totalRepaymentAmount)" });
        const preparedVRDIPayment = prepareEvent({ signature: "event VRDIPaymentDeposited(uint256 vrId, uint256 amountUSDC, uint256 depositedUSDC)" });
        const preparedVRDIClosed = prepareEvent({ signature: "event VRDIClosed(uint256 vrId, bool withinTimeline)" });
        const preparedProposalSubmitted = prepareEvent({ signature: "event ProposalSubmitted(uint256 proposalId, address submitter, string documentLink)" });

        const eventSignatures = [
          preparedEventNew,
          preparedEventOld,
          preparedVRDICreated,
          preparedVRDIPayment,
          preparedVRDIClosed,
          preparedProposalSubmitted
        ];

        let rollingTotalRepaid = 0;
        let rollingTotalProposals = 0;
        let rollingPassedProposals = 0;
        let rollingActiveLoans = 0;
        let rollingClosedLoans = 0;

        const newlyFetchedEventsData: PriceDataPoint[] = [];
        let lastSuccessfullyProcessedBlockInThisRun = fromBlockForNewEvents - 1n;
        let anErrorOccurredInChunking = false;

        if (fromBlockForNewEvents <= latestChainBlockNumber) {
          let currentEventChunkFromBlock = fromBlockForNewEvents;
          const chunkSize = 1000n;
          const delayBetweenChunks = 250;

          while (currentEventChunkFromBlock <= latestChainBlockNumber && !anErrorOccurredInChunking) {
            let currentEventChunkToBlock = currentEventChunkFromBlock + chunkSize - 1n;
            if (currentEventChunkToBlock > latestChainBlockNumber) currentEventChunkToBlock = latestChainBlockNumber;

            try {
              const eventsChunk = await getContractEvents({
                contract: TSPABI.contract,
                events: eventSignatures,
                fromBlock: currentEventChunkFromBlock,
                toBlock: currentEventChunkToBlock,
              });

              for (const event of eventsChunk) {
                const args = event.args as any;
                if (event.topics[0] === preparedEventNew.signature || event.topics[0] === preparedEventOld.signature) {
                  const block = await ethersProvider.getBlock(Number(event.blockNumber));
                  if (block && block.timestamp && args && typeof args.redemptionPrice === 'bigint') {
                    const priceVal = parseFloat(ethers.formatUnits(args.redemptionPrice, USDC_DECIMALS));
                    const point: Record<string, number> = {
                      timestamp: block.timestamp,
                      redemptionPrice: priceVal,
                    };
                    Object.entries(args).forEach(([kRaw, v]) => {
                      if (/^\d+$/.test(kRaw)) return;
                      if (kRaw === 'redemptionPrice') return;
                      let k = kRaw;
                      if (kRaw === 'reserveTokens') k = 'mkvliInReserve';
                      if (kRaw === 'burnTokens') k = 'mkvliBurned';
                      if (kRaw === 'circulatingSupply') k = 'mkvliCirculatingSupply';
                      if (kRaw === 'ethReserve') k = 'actualUsdcInContract';
                      if (typeof v === 'bigint') {
                        if (['actualUsdcInContract', 'usdcDeployedInVRDIs', 'effectiveUsdcReserve'].includes(k)) {
                          point[k] = parseFloat(ethers.formatUnits(v, USDC_DECIMALS));
                        } else if (['totalSupply', 'mkvliInReserve', 'mkvliBurned', 'mkvliCirculatingSupply'].includes(k)) {
                          point[k] = parseFloat(ethers.formatUnits(v, decimalsForFormatting));
                        } else {
                          point[k] = Number(ethers.formatUnits(v, 18));
                        }
                      }
                    });
                    newlyFetchedEventsData.push(point as PriceDataPoint);
                    if (args.totalSupply) latestEventTotalSupplyBigInt = args.totalSupply;
                    if (args.mkvliInReserve) fetchedDiamondMkvliReserve = args.mkvliInReserve;
                    else if (args.reserveTokens) fetchedDiamondMkvliReserve = args.reserveTokens;
                  }
                } else if (event.topics[0] === preparedVRDICreated.signature) {
                  // rollingPassedProposals++;
                  // rollingActiveLoans++;
                } else if (event.topics[0] === preparedVRDIPayment.signature) {
                  if (args && args.amountUSDC) {
                    // rollingTotalRepaid += parseFloat(ethers.formatUnits(args.amountUSDC, USDC_DECIMALS));
                  }
                } else if (event.topics[0] === preparedVRDIClosed.signature) {
                  // rollingActiveLoans = Math.max(0, rollingActiveLoans - 1);
                  // rollingClosedLoans++;
                } else if (event.topics[0] === preparedProposalSubmitted.signature) {
                  // rollingTotalProposals++;
                }
                lastSuccessfullyProcessedBlockInThisRun = event.blockNumber;
              }
            } catch (chunkError: any) {
              console.error("Chunk Error:", chunkError);
              anErrorOccurredInChunking = true;
            }
            if (currentEventChunkToBlock >= latestChainBlockNumber || anErrorOccurredInChunking) break;
            currentEventChunkFromBlock = currentEventChunkToBlock + 1n;
            await new Promise(resolve => setTimeout(resolve, delayBetweenChunks));
          }

          const combinedHistory = [...initialPriceHistoryFromCache, ...newlyFetchedEventsData];
          const uniqueHistoryMap = new Map<number, PriceDataPoint>();
          combinedHistory.forEach(item => uniqueHistoryMap.set(item.timestamp, item));
          const finalSortedHistory = Array.from(uniqueHistoryMap.values()).sort((a, b) => a.timestamp - b.timestamp);

          setPriceHistory(finalSortedHistory);
          // Governance stats are now fetched directly below
          // setTotalRepaid(rollingTotalRepaid); // Disabled to prevent overwrite
          // setTotalProposals(rollingTotalProposals);
          // setPassedProposals(rollingPassedProposals);
          // setActiveLoans(rollingActiveLoans);
          // setClosedLoans(rollingClosedLoans);

          if (finalSortedHistory.length > 0) {
            const lastPoint = finalSortedHistory[finalSortedHistory.length - 1];
            if (lastPoint.usdcDeployedInVRDIs !== undefined) setTotalLended(lastPoint.usdcDeployedInVRDIs);
            if (lastPoint.actualUsdcInContract !== undefined) setLatestActualReserve(lastPoint.actualUsdcInContract);
            if (lastPoint.effectiveUsdcReserve !== undefined) setLatestEffectiveReserve(lastPoint.effectiveUsdcReserve);
            if (lastPoint.mkvliInReserve !== undefined) setMkvliReserve(lastPoint.mkvliInReserve);
          }

          const blockToCache = anErrorOccurredInChunking ? lastSuccessfullyProcessedBlockInThisRun : latestChainBlockNumber;
          if (blockToCache >= (fromBlockForNewEvents - 1n)) {
            setPriceHistoryCache({ priceHistory: finalSortedHistory, lastFetchedBlock: blockToCache });
          }
        }
      }

      const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
      let actualBurnedTokens: bigint | null = null;
      if (TSPABI.contract && ethers.isAddress(BURN_ADDRESS)) {
        try {
          const burnedBalance = await readContract({ contract: TSPABI.contract, method: "balanceOf", params: [BURN_ADDRESS] });
          actualBurnedTokens = burnedBalance as bigint;
        } catch (e) {
          console.error("Failed to fetch MKVLI balance of burn address:", e);
        }
      }
      setLatestBurnedTokens(actualBurnedTokens);

      // --- EXPLICIT LIVE DATA FETCH (Primary Source of Truth) ---
      // Fetch accurate Governance/Loan counts (Index 0 inclusion fix)
      if (TSPABI.contract) {
        try {
          // Proposals
          const nextPropId = await readContract({ contract: TSPABI.contract, method: "getNextProposalId", params: [] });
          const countProps = Number(nextPropId);
          // console.log("RSRV DEBUG: nextPropId raw:", nextPropId, "Count:", countProps);

          if (countProps > 0 || countProps === 0) { // Check even if 0, loop to 2 just in case
            const limit = Math.min(countProps, 500); // Scan ahead
            const propPromises = [];
            for (let i = 0; i < limit; i++) {
              propPromises.push(
                readContract({ contract: TSPABI.contract, method: "getProposalDetails", params: [BigInt(i)] })
                  .then(res => {
                    // if (i === 0) console.log("RSRV DEBUG: Proposal 0 fetched:", res);
                    return res;
                  })
                  .catch(err => {
                    // console.error("RSRV DEBUG: Error fetching Proposal", i, err);
                    return null;
                  })
              );
            }
            const propsResults = await Promise.all(propPromises);
            const validProposals = propsResults.filter(p => p !== null);
            setTotalProposals(validProposals.length); // Use ACTUAL found count

            let passed = 0;
            validProposals.forEach((p: any) => {
              // Index 3 is highTableApproved
              if (p && p[3] === true) passed++;
            });
            setPassedProposals(passed);
          } else {
            setTotalProposals(0);
            setPassedProposals(0);
          }

          // VRDIs (Loans)
          const nextVrdiId = await readContract({ contract: TSPABI.contract, method: "getNextVRDIId", params: [] });
          const countVrdis = Number(nextVrdiId);
          // console.log("RSRV DEBUG: nextVrdiId raw:", nextVrdiId, "Count:", countVrdis);

          if (countVrdis > 0 || countVrdis === 0) {
            const limitV = Math.min(countVrdis, 500); // Scan ahead
            const vrdiPromises = [];
            for (let i = 0; i < limitV; i++) {
              vrdiPromises.push(
                readContract({ contract: TSPABI.contract, method: "getVRDIDetails", params: [BigInt(i)] })
                  .then(res => {
                    // if (i === 0) console.log("RSRV DEBUG: VRDI 0 fetched:", res);
                    return res;
                  })
                  .catch(err => {
                    // console.error("RSRV DEBUG: Error fetching VRDI", i, err);
                    return null;
                  })
              );
            }
            const vrdiResults = await Promise.all(vrdiPromises);
            const validVrdis = vrdiResults.filter(v => v !== null); // Valid items found

            let active = 0;
            let closed = 0;
            let calculatedTotalLended = 0;
            let calculatedTotalRepaid = 0;

            for (const v of validVrdis) {
              if (v) {
                const isClosed = v.isClosed;
                const principal = v.principalUSDC ? Number(ethers.formatUnits(v.principalUSDC, 6)) : 0;
                const repayment = v.totalRepaymentAmount ? Number(ethers.formatUnits(v.totalRepaymentAmount, 6)) : 0;
                const deposited = v.depositedUSDC ? Number(ethers.formatUnits(v.depositedUSDC, 6)) : (isClosed ? repayment : 0);

                calculatedTotalLended += principal;
                calculatedTotalRepaid += deposited;

                if (isClosed) {
                  closed++;
                } else {
                  active++;
                }
              }
            }

            setActiveLoans(active);
            setClosedLoans(closed);
            setTotalLended(calculatedTotalLended);
            setTotalRepaid(calculatedTotalRepaid);
          } else {
            setActiveLoans(0);
            setClosedLoans(0);
            setTotalLended(0);
            setTotalRepaid(0);
          }



        } catch (govStatsErr) {
          console.error("Error fetching live governance stats:", govStatsErr);
        }
      }

      // Events are great for history, but for the "Header Stats", we want the absolute latest balance.
      // Fetch these directly from the contract now.

      let liveUsdcReserve: bigint | null = null;
      let liveMkvliReserve: bigint | null = null;
      let livePrice: bigint | null = dynamicPrice; // Start with what we fetched earlier

      if (TSPABI.contract && TSPABI.diamondAddress && USDC_CONTRACT_ADDRESS) {
        try {
          // 1. Get Actual USDC Balance of Diamond
          // Use generic read for USDC contract
          // Note: We need a direct read utility or use the diamond if it has a getter-like function for generic token balance?
          // Since we don't have a generic `readContract` for USDC defined easily here without an ABI, we can rely on TSPABI.getUSDCReserve() which we already called as 'usdcReserveVal'.
          // If TSPABI.getUSDCReserve() returns the actual balance, then we are good.
          // If we really want to be safe, we can use the provider to get balance.

          if (usdcReserveVal !== null) {
            // usdcReserveVal comes from TSPABI.getUSDCReserve()
            // Assuming that function does the right thing (balanceOf(diamond)).
            liveUsdcReserve = usdcReserveVal as bigint;
            setLatestActualReserve(liveUsdcReserve);
          }

          // 2. Get Diamond MKVLI Balance (Reserve)
          // We can use the thirdweb readContract since we have the contract instance (it's the Diamond).
          // But wait, MKVLI token is the Diamond itself (usually) or a separate token? 
          // If MKVLI is the Diamond/Facet token, checking balanceOf(this) or balanceOf(diamondAddress) on itself is valid.
          const diamondMkvliBal = await readContract({ contract: TSPABI.contract, method: "balanceOf", params: [TSPABI.diamondAddress] });
          if (typeof diamondMkvliBal === 'bigint') {
            liveMkvliReserve = diamondMkvliBal;
            setMkvliReserve(liveMkvliReserve);
            setDiamondMkvliReserve(liveMkvliReserve);
          }

          // 2b. Explicit Proposal & Loan Counts (Live) - REMOVED redundant buggy block
          // The block above (lines 586-X) already handles this more accurately.

          // 3. Cache the live stats
          if (liveUsdcReserve !== null && liveMkvliReserve !== null) {
            const cacheData: LiveStatsCache = {
              timestamp: Date.now(),
              actualUsdcInContract: liveUsdcReserve.toString(),
              mkvliInReserve: liveMkvliReserve.toString(),
              price: livePrice ? livePrice.toString() : '0'
            };
            setStatsCache(cacheData);
          }

        } catch (liveFetchErr) {
          console.error("Failed to fetch explicit live stats", liveFetchErr);
        }
      }







      const directTotalSupplyBigIntFallback = await TSPABI.getCurrentSupply();
      let finalTotalSupplyToStoreAsBigInt: bigint = 0n;
      let finalDisplaySupplyString: string = '0';

      if (latestEventTotalSupplyBigInt !== null) {
        finalTotalSupplyToStoreAsBigInt = latestEventTotalSupplyBigInt;
        finalDisplaySupplyString = ethers.formatUnits(latestEventTotalSupplyBigInt, decimalsForFormatting);
      } else if (directTotalSupplyBigIntFallback) {
        finalTotalSupplyToStoreAsBigInt = directTotalSupplyBigIntFallback;
        finalDisplaySupplyString = ethers.formatUnits(directTotalSupplyBigIntFallback, decimalsForFormatting);
      }
      setCurrentTotalSupplySmallestUnit(finalTotalSupplyToStoreAsBigInt);
      setCurrentSupplyDisplay(finalDisplaySupplyString);

      if (fetchedDiamondMkvliReserve !== null) {
        setDiamondMkvliReserve(fetchedDiamondMkvliReserve);
      } else if (TSPABI.diamondAddress && TSPABI.contract) {
        try {
          const diamondBalanceValue = await readContract({ contract: TSPABI.contract, method: "balanceOf", params: [TSPABI.diamondAddress] });
          if (typeof diamondBalanceValue === 'bigint') {
            setDiamondMkvliReserve(diamondBalanceValue);
          }
        } catch (e) {
          console.error("Fallback: Failed to fetch Diamond MKVLI Reserve", e);
          setDiamondMkvliReserve(null);
        }
      }
    } catch (err: any) {
      console.error('Error in fetchAllContractData:', err);
      setError('Failed to load initial contract data.');
      setMintStep('error');
    } finally {
      setIsLoadingMkvliData(false);
      setIsLoadingPrice(false);
      setIsLoadingPriceHistory(false);
    }
  }, [activeAccount]); // Add dependencies as needed or keep minimal if stable

  // NEW: Initial data load trigger
  useEffect(() => {
    fetchAllContractData();
  }, [fetchAllContractData]);

  const incrementTokens = () => {
    tapSoundEffectRef.current?.play().catch(console.error);
    setTokens((prevTokens) => prevTokens + 1);
  };

  const decrementTokens = () => {
    tapSoundEffectRef.current?.play().catch(console.error);
    setTokens((prevTokens) => Math.max(1, prevTokens - 1));
  };

  const formatUsdcDisplay = (amountInSmallestUnit: bigint) => {
    return ethers.formatUnits(amountInSmallestUnit, USDC_DECIMALS);
  };



  const formatMkvliDisplay = (amountInSmallestUnit: bigint | null) => {
    if (amountInSmallestUnit === null) return 'N/A';
    return ethers.formatUnits(amountInSmallestUnit, mkvliDecimals);
  };

  const calculateMkvliValueInUsdc = () => {
    // console.log("Calculating MKVLI Value in USDC (mkvliDecimals is intentionally 0 based on contract):");
    // console.log("  userMkvliBalance:", userMkvliBalance?.toString());
    // console.log("  fetchedPriceSmallestUnit (raw from contract):", fetchedPriceSmallestUnit?.toString());
    // console.log("  finalPricePerTokenSmallestUnit (used for mint cost):", finalPricePerTokenSmallestUnit.toString());
    // console.log("  mkvliDecimals (confirmed from contract as 0):", mkvliDecimals);

    let priceToUseForValuation = fetchedPriceSmallestUnit;
    if (priceToUseForValuation === null || priceToUseForValuation === BigInt(0)) {
      // console.log("  Fetched price is null or zero, falling back to finalPricePerTokenSmallestUnit for valuation.");
      priceToUseForValuation = finalPricePerTokenSmallestUnit;
    }

    if (userMkvliBalance === null || priceToUseForValuation === BigInt(0)) {
      // console.log("  Condition for N/A met (balance null or price zero). Returning N/A.");
      return 'N/A';
    }

    const readableMkvliBalance = parseFloat(ethers.formatUnits(userMkvliBalance, mkvliDecimals));
    const readablePriceForValuation = parseFloat(ethers.formatUnits(priceToUseForValuation, USDC_DECIMALS));
    const totalValue = readableMkvliBalance * readablePriceForValuation;
    // console.log("  Calculated Value with price:", priceToUseForValuation.toString(), "is", totalValue.toFixed(2));
    return totalValue.toFixed(2);
  };

  // Calculate Total USDC Cost when tokens or price changes
  useEffect(() => {
    if (finalPricePerTokenSmallestUnit && tokens > 0) {
      setTotalUsdcCost(finalPricePerTokenSmallestUnit * BigInt(tokens));
    } else {
      setTotalUsdcCost(BigInt(0));
    }
  }, [tokens, finalPricePerTokenSmallestUnit]);

  // useEffect for resetting mintStep from 'error' after a delay
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (mintStep === 'error') {
      // console.log("MintForm: mintStep is 'error', setting timeout to reset to 'idle'.");
      timeoutRef.current = setTimeout(() => {
        if (isMounted.current && mintStep === 'error') {
          // console.log("MintForm: Timeout reached, resetting mintStep from 'error' to 'idle'.");
          setMintStep('idle');
        }
      }, 3000);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [mintStep]); // Only re-run if mintStep changes

  // NEW Refined useEffect for determining mintStep based on balances/allowances
  useEffect(() => {
    // Don't override these transient or definitive states immediately by balance/allowance checks below,
    // unless conditions for that state are no longer met.
    if (['success', 'approving', 'minting', 'ready_to_mint', 'awaiting_onramp', 'polling_onramp_status', 'checking_balance'].includes(mintStep)) {
      if (mintStep === 'ready_to_mint') {
        // If it became ready_to_mint, but conditions are no longer met (e.g., user changed token amount after approval, increasing cost)
        // then allow it to fall through and be re-evaluated.
        // Otherwise, if conditions for ready_to_mint still hold, keep it.
        if (usdcAllowance >= totalUsdcCost && usdcBalance >= totalUsdcCost && totalUsdcCost > BigInt(0)) {
          return; // Conditions for ready_to_mint are still met
        }
        // If not, let it fall through to re-evaluate (e.g. to insufficient_balance or needs_approval)
      } else {
        // For other protected states like 'approving', 'minting', 'success', etc., don't change them here.
        return;
      }
    }

    // Default to idle if no active account, or zero cost/tokens (unless it's a specific non-idle state from above)
    if (!activeAccount || (tokens === 0 && totalUsdcCost <= BigInt(0))) {
      setMintStep('idle');
      return;
    }
    // Also idle if cost is zero but tokens are selected (e.g. price not loaded yet, but user selected tokens)
    if (totalUsdcCost <= BigInt(0) && tokens > 0) {
      setMintStep('idle');
      return;
    }

    // Standard evaluation order based on current state of balance and allowance
    if (usdcBalance < totalUsdcCost) {
      setMintStep('insufficient_balance');
    } else if (usdcAllowance < totalUsdcCost) {
      setMintStep('needs_approval');
    } else {
      // This is the desired state if all conditions pass (balance & allowance are sufficient for the cost)
      setMintStep('ready_to_mint');
    }
  }, [activeAccount, totalUsdcCost, usdcBalance, usdcAllowance, tokens, mintStep]);

  const executeApproval = async () => {
    if (!activeAccount?.address || !CONTRACT_ADDRESS || !USDC_CONTRACT_ADDRESS || !ethers.isAddress(USDC_CONTRACT_ADDRESS)) {
      setErrorModalTitle("Configuration Error");
      setErrorModalMessage("Required contract addresses are not set up correctly for approval.");
      setShowErrorModal(true);
      setMintStep('error');
      return false;
    }
    if (!wallet || !activeAccount) { // Check for thirdweb wallet and account
      setErrorModalTitle("Wallet Not Connected");
      setErrorModalMessage("Please connect your wallet to approve USDC spend.");
      setShowErrorModal(true);
      setMintStep('error');
      return false;
    }

    setMintStep('approving');
    setIsLoadingTransaction(true);
    setStepError("");
    try {
      const usdcThirdwebContract = getContract({
        client: thirdwebClient, // from const thirdwebClient = TSPABI.client;
        address: USDC_CONTRACT_ADDRESS,
        chain: TSPABI.contract.chain, // Assuming USDC is on the same chain as the main TSPABI contract
        abi: USDC_ABI, // Your existing USDC_ABI
      });

      const transactionToPrepare = prepareContractCall({
        contract: usdcThirdwebContract,
        method: "approve",
        params: [CONTRACT_ADDRESS, totalUsdcCost], // spender, amount
      });

      const { transactionHash } = await sendAndConfirmTransaction({
        transaction: transactionToPrepare,
        account: activeAccount // from useActiveAccount()
      });

      // console.log("USDC Approval successful, txHash:", transactionHash);

      // Re-fetch allowance after approval
      const allowance = await readContract({
        contract: usdcThirdwebContract,
        method: "allowance",
        params: [activeAccount.address, CONTRACT_ADDRESS]
      });
      setUsdcAllowance(allowance as bigint);
      setMintStep('ready_to_mint');
      return true;
    } catch (err: any) {
      console.error("Approval failed:", err);
      // Using the enhanced error parsing from previous work
      let detailedMessage = "An unexpected error occurred during approval.";
      if (err.reason) { detailedMessage = err.reason; }
      else if (err.message) { detailedMessage = err.message; }
      else if (err.data && err.data.message) { detailedMessage = err.data.message; }
      else if (typeof err.error?.message === 'string') { detailedMessage = err.error.message; }
      else if (typeof err === 'string') { detailedMessage = err; }
      if (err.code) detailedMessage += ` (Code: ${err.code})`;
      if (err.name && err.name !== "Error") detailedMessage = `${err.name}: ${detailedMessage}`;
      if (err.details) detailedMessage += ` Details: ${err.details}`;

      setErrorModalTitle(err.code === 4001 ? "Approval Rejected" : "Approval Failed");
      setErrorModalMessage(detailedMessage);
      setShowErrorModal(true);
      setMintStep('error');
      return false;
    } finally {
      setIsLoadingTransaction(false);
    }
  };

  // Modified handleMint for stepped flow
  const executeMint = async () => {
    if (!activeAccount?.address || !CONTRACT_ADDRESS) {
      setErrorModalTitle("Wallet Not Connected");
      setErrorModalMessage("Please connect your wallet to mint MKVLI.");
      setShowErrorModal(true);
      setMintStep('error');
      return false;
    }
    if (usdcAllowance < totalUsdcCost) {
      setErrorModalTitle("Insufficient Allowance");
      setErrorModalMessage("Insufficient USDC allowance. Please approve first.");
      setShowErrorModal(true);
      setMintStep('error');
      return false;
    }
    setMintStep('minting');
    setStepError("");
    try {
      const mintAmountInSmallestUnit = BigInt(tokens) * BigInt(10 ** mkvliDecimals);
      const transactionToPrepare = prepareContractCall({
        contract: TSPABI.contract,
        method: "mint",
        params: [activeAccount.address, mintAmountInSmallestUnit],
      });
      const { transactionHash: txHash } = await sendAndConfirmTransaction({ transaction: transactionToPrepare, account: activeAccount });
      // console.log("Mint successful, txHash:", txHash);

      setTransactionHash(txHash);
      setSuccessTxHash(txHash);
      setShowSuccessModal(true);
      setMintStep('success');

      fetchAllContractData();
      return true;
    } catch (err: any) {
      // Log the raw error for debugging, but use warn for common user rejections
      const errObj = err as { code?: number; message?: string; reason?: string };
      if (errObj.code === 4001 ||
        (errObj.message &&
          typeof errObj.message === 'string' &&
          (errObj.message.toLowerCase().includes("user rejected") ||
            errObj.message.toLowerCase().includes("user denied") ||
            errObj.message.toLowerCase().includes("transaction rejected")))) {
        // console.warn("Mint transaction rejected by user in wallet:", err); 
      } else {
        // console.error("Minting transaction error object (unexpected):", err);
      }

      let title = "Minting Failed";
      let determinedMessage: string | undefined;

      if (typeof err === 'object' && err !== null) { // Redundant check if using errObj, but safe
        if (errObj.code === 4001) {
          title = "Transaction Rejected";
          determinedMessage = "You rejected the mint transaction in your wallet.";
        } else if (errObj.message && typeof errObj.message === 'string' &&
          (errObj.message.toLowerCase().includes("user rejected") ||
            errObj.message.toLowerCase().includes("user denied") ||
            errObj.message.toLowerCase().includes("transaction rejected"))) {
          title = "Transaction Rejected";
          determinedMessage = "You rejected the mint transaction in your wallet.";
        } else if (typeof errObj.reason === 'string' && errObj.reason.trim() !== '') {
          determinedMessage = errObj.reason;
        } else if (typeof errObj.message === 'string' && errObj.message.trim() !== '') {
          determinedMessage = errObj.message;
        }
      }

      const finalMessage = determinedMessage || "An unexpected error occurred during mint. Please check the console for details.";

      setErrorModalTitle(title);
      setErrorModalMessage(finalMessage);
      setShowErrorModal(true);
      setMintStep('error');
      return false;
    }
  };

  const handleUnifiedMintAction = async () => {
    setError(""); // Clear main form error
    setStepError("");

    if (!activeAccount || !activeAccount.address || !wallet) {
      setErrorModalTitle("No Wallet Detected");
      setErrorModalMessage("Please connect a wallet using the wallet connection button.");
      setShowErrorModal(true);
      return;
    }
    if (totalUsdcCost <= BigInt(0)) {
      setError("Please enter a valid amount to mint.");
      return;
    }

    setMintStep('checking_balance');
    setIsLoadingTransaction(true);
    try {
      const usdcContract = getContract({
        client: thirdwebClient,
        address: USDC_CONTRACT_ADDRESS,
        chain: TSPABI.contract.chain,
        abi: TSPABI.contractABI,
      });
      const currentEthBalance = null; // Not used, can be removed or replaced if needed
      if (!activeAccount || !activeAccount.address) return;
      const currentUsdcBal = await readContract({ contract: usdcContract, method: "balanceOf", params: [activeAccount.address] });
      setUsdcBalance(currentUsdcBal as bigint);
      const currentAllowance = await readContract({ contract: usdcContract, method: "allowance", params: [(activeAccount.address || ""), (CONTRACT_ADDRESS || "")] });
      setUsdcAllowance(currentAllowance as bigint);
      setIsLoadingTransaction(false);

      if ((currentUsdcBal as bigint) < totalUsdcCost) {
        setMintStep('insufficient_balance');
        setShowOnrampModal(true);
        return;
      }
      if ((currentAllowance as bigint) < totalUsdcCost) {
        await executeApproval();
        return;
      }
      await executeMint();

    } catch (checkError: any) {
      console.error("Error during pre-action checks:", checkError);
      setStepError(checkError.message || "Failed to verify balances.");
      setMintStep('error');
      setIsLoadingTransaction(false);
    }
  };

  const getButtonTextAndState = () => {
    let text = "Mint MKVLI";
    let disabled = !activeAccount || isLoadingPrice || isLoadingMkvliData || totalUsdcCost <= BigInt(0);
    // General loading/busy states for the button
    if (['checking_balance', 'awaiting_onramp', 'polling_onramp_status', 'approving', 'minting'].includes(mintStep)) {
      disabled = true;
    }

    switch (mintStep) {
      case 'checking_balance': text = "Verifying Balance..."; break;
      case 'insufficient_balance': text = "Fund with USDC"; disabled = !activeAccount; break; // Enable to allow triggering onramp
      case 'awaiting_onramp': text = "Complete Onramp..."; break;
      case 'polling_onramp_status': text = "Confirming Funds..."; break;
      case 'onramp_complete': text = "Funds Added! Continue Mint Process"; disabled = !activeAccount; break;
      case 'needs_approval': text = "Approve USDC Spend"; disabled = disabled || isSigmaPinned; break;
      case 'approving': text = "Approving..."; break;
      case 'ready_to_mint': text = "Mint MKVLI"; disabled = disabled || isSigmaPinned; break;
      case 'minting': text = "Minting MKVLI..."; break;
      case 'success':
        text = "Mint Successful!";
        disabled = true; // Keep button disabled in success state until modal is closed
        break;
      case 'error':
        text = stepError.includes("User rejected") ? "Transaction Rejected - Retry" : "Error - Retry Process";
        disabled = isLoadingTransaction; // Use the more general loading state if it exists for retries
        break;
      default: text = "Mint MKVLI"; break;
    }
    return { text, disabled };
  };

  const { text: buttonText, disabled: buttonDisabled } = getButtonTextAndState();

  const handleSigmaSymbolClick = () => {
    const newPinnedState = !isSigmaPinned;
    setIsSigmaPinned(newPinnedState);
    if (newPinnedState) {
      setHoveredMainSymbol('supply'); // Keep Σ visually active when pinned
    } else {
      setHoveredMainSymbol(null); // Clear hover when unpinning
    }
  };

  const showSigmaDetails = hoveredMainSymbol === 'supply' || isSigmaPinned;

  // API Call function
  const makeAPICall = async (url: string, requestBody: any) => {
    try {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      console.error('Error making API call:', error);
    }
  };

  // Poll Status function
  const pollOnrampStatus = async (intentId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        if (!isMounted.current) {
          reject(new Error("Component unmounted during on-ramp polling."));
          return;
        }
        try {
          const fiatStatus = await getBuyWithFiatStatus({ client: thirdwebClient, intentId });
          // console.log("Onramp Polling Status:", fiatStatus);
          if (fiatStatus.status === "ON_RAMP_TRANSFER_COMPLETED") {
            resolve();
          } else if (fiatStatus.status === "PAYMENT_FAILED" || fiatStatus.status === "ON_RAMP_TRANSFER_FAILED") {
            reject(new Error(`Onramp failed: ${fiatStatus.status}`));
          } else {
            setTimeout(checkStatus, 5000);
          }
        } catch (error) {
          console.error("Error polling onramp status:", error);
          reject(error);
        }
      };
      checkStatus();
    });
  };

  const startTransactionProcess = async () => {
    if (!activeAccount?.address || !wallet) {
      setErrorModalTitle("Wallet Not Connected");
      setErrorModalMessage("Please connect your wallet to start the mint process.");
      setShowErrorModal(true);
      setMintStep('error');
      return;
    }
    if (totalUsdcCost <= BigInt(0)) {
      setErrorModalTitle("Invalid Amount");
      setErrorModalMessage("Please enter a valid amount to mint.");
      setShowErrorModal(true);
      setMintStep('error');
      return;
    }
    setIsLoadingTransaction(true);
    setStepError("");
    const referral = ""; // Assuming referralCode state is still available if used
    const confirmedURL = 'https://mint.thelochnessbotanicalsociety.com/referralPostback.php'; // Your URL

    try {
      if (referral) {
        setMintStep('referral_api_start');
        await makeAPICall(confirmedURL, { referralCode: referral, customerWallet: activeAccount.address, tokenAmount: tokens.toString(), status: "0" });
      }

      setMintStep('checking_balance');
      const usdcContract = getContract({
        client: thirdwebClient,
        address: USDC_CONTRACT_ADDRESS,
        chain: TSPABI.contract.chain,
        abi: TSPABI.contractABI,
      });
      if (!activeAccount || !activeAccount.address) return;
      let currentUsdcBal = await readContract({ contract: usdcContract, method: "balanceOf", params: [activeAccount.address] });
      setUsdcBalance(currentUsdcBal as bigint);

      const isTestnet = TSPABI.contract.chain.id === 84532; // Base Sepolia Chain ID

      if ((currentUsdcBal as bigint) < totalUsdcCost) {
        if (isTestnet) {
          // console.warn("On Base Sepolia (Testnet). Onramp skipped. Please fund with testnet USDC manually.");
          setErrorModalTitle("Testnet Error");
          setErrorModalMessage("Insufficient testnet USDC. Please acquire from a faucet.");
          setShowErrorModal(true);
          setMintStep('error');
          return;
        } else {
          setMintStep('insufficient_balance');
          const usdcNeeded = totalUsdcCost - (currentUsdcBal as bigint);
          const usdNeeded = parseFloat(ethers.formatUnits(usdcNeeded, USDC_DECIMALS));

          if (usdNeeded < 2) {
            setErrorModalTitle("Minimum On-Ramp Not Met");
            setErrorModalMessage("The minimum credit-card purchase is $2. Your additional requirement is less than this – please fund your wallet manually or mint more tokens so that at least $2 USDC is required.");
            setShowErrorModal(true);
            setMintStep('error');
            return;
          }

          // Build chunk array obeying the $2-min / $2500-max rule
          const usdChunks: number[] = [];
          let remaining = usdNeeded;
          while (remaining > 0) {
            const chunk = remaining > MAX_USDC_PER_TX ? MAX_USDC_PER_TX : remaining;
            usdChunks.push(parseFloat(chunk.toFixed(2))); // keep two decimals
            remaining -= chunk;
          }

          // If the last chunk ends up < $2 (possible when usdNeeded > $2500 but remainder < 2)
          if (usdChunks.length > 1 && usdChunks[usdChunks.length - 1] < 2) {
            const last = usdChunks.pop()!;
            usdChunks[usdChunks.length - 1] += last; // add it to previous chunk (will be <= 2500 + <2 -> maybe 2501 but avoid exceeding rule)
            if (usdChunks[usdChunks.length - 1] > MAX_USDC_PER_TX) {
              // fallback: push it back and inform user to top-up manually
              const overflow = usdChunks[usdChunks.length - 1] - MAX_USDC_PER_TX;
              usdChunks[usdChunks.length - 1] = MAX_USDC_PER_TX;
              usdChunks.push(overflow);
            }
          }

          setOnrampProgress({ current: 0, total: usdChunks.length });
          setShowOnrampModal(true);
          setMintStep('awaiting_onramp');

          for (let i = 0; i < usdChunks.length; i++) {
            const chunkUSD = usdChunks[i];
            const chunkUSDC = ethers.parseUnits(chunkUSD.toFixed(2), USDC_DECIMALS);

            const quote = await getBuyWithFiatQuote({
              client: thirdwebClient,
              toChainId: TSPABI.contract.chain.id,
              toTokenAddress: USDC_CONTRACT_ADDRESS,
              toAddress: activeAccount.address,
              fromAddress: activeAccount.address,
              fromCurrencySymbol: "USD",
              toAmount: ethers.formatUnits(chunkUSDC, USDC_DECIMALS),
            });

            if (!quote || !quote.onRampLink) {
              throw new Error("Could not obtain on-ramp quote for $" + chunkUSD.toFixed(2));
            }

            try {
              window.open(quote.onRampLink, "_blank");
            } catch { }

            setOnrampUrl(quote.onRampLink);
            setOnrampIntentId(quote.intentId);

            // Wait for this chunk to complete before proceeding to next
            await pollOnrampStatus(quote.intentId);
            setOnrampProgress(prev => ({ ...prev, current: prev.current + 1 }));
          }

          // All chunks completed, continue the flow (balance will be re-checked in executeApprovalFlow)
          setShowOnrampModal(false);
          setMintStep('onramp_complete');
          await executeApprovalFlow();
          return;
        }
      }
      // If balance is sufficient or onramp was skipped for testnet, proceed to approval flow
      await executeApprovalFlow();

    } catch (error: any) {
      console.error("Transaction process error:", error);
      setErrorModalTitle("Transaction Error");
      setErrorModalMessage(error.message || "An error occurred during the process.");
      setShowErrorModal(true);
      setMintStep('error');
    } finally {
      setIsLoadingTransaction(false); // Ensure this is always set false
    }
  };

  // New function to handle post-onramp logic and then approval/mint
  const handlePostOnrampAndContinue = async () => {
    setShowOnrampModal(false);
    setMintStep('polling_onramp_status');
    if (!wallet) {
      setErrorModalTitle("No Wallet Detected");
      setErrorModalMessage("Please connect a wallet using the wallet connection button.");
      setShowErrorModal(true);
      setMintStep('error');
      return;
    }
    try {
      await pollOnrampStatus(onrampIntentId);
      // console.log("Onramp confirmed!");
      setMintStep('onramp_complete');
      // Re-check balance
      const usdcContract = getContract({
        client: thirdwebClient,
        address: USDC_CONTRACT_ADDRESS,
        chain: TSPABI.contract.chain,
        abi: TSPABI.contractABI,
      });
      if (!activeAccount || !activeAccount.address) return;
      const currentUsdcBal = await readContract({ contract: usdcContract, method: "balanceOf", params: [activeAccount.address] });
      setUsdcBalance(currentUsdcBal as bigint);
      if ((currentUsdcBal as bigint) < totalUsdcCost) {
        setErrorModalTitle("Insufficient Balance");
        setErrorModalMessage("Still insufficient USDC after onramp.");
        setShowErrorModal(true);
        setMintStep('insufficient_balance');
        return;
      }
      await executeApprovalFlow();
    } catch (error: any) {
      console.error("Error after onramp or during polling:", error);
      setErrorModalTitle("Onramp Error");
      setErrorModalMessage(error.message || "Onramp process failed or was cancelled.");
      setShowErrorModal(true);
      setMintStep('error');
    }
  };

  async function executeApprovalFlow() {
    setMintStep('checking_allowance');
    if (!wallet) {
      setErrorModalTitle("No Wallet Detected");
      setErrorModalMessage("Please connect a wallet using the wallet connection button.");
      setShowErrorModal(true);
      setMintStep('error');
      return;
    }
    const usdcContract = getContract({
      client: thirdwebClient,
      address: USDC_CONTRACT_ADDRESS,
      chain: TSPABI.contract.chain,
      abi: TSPABI.contractABI,
    });
    if (!activeAccount || !activeAccount.address) return;
    const currentAllowance = await readContract({ contract: usdcContract, method: "allowance", params: [(activeAccount.address || ""), (CONTRACT_ADDRESS || "")] });
    setUsdcAllowance(currentAllowance as bigint);

    if ((currentAllowance as bigint) < totalUsdcCost) {
      if (!(await executeApproval())) return; // executeApproval now returns boolean
    }
    // If approval was needed and successful, or not needed, proceed to mint
    await executeMint();
  }

  // Calculate displayed Sigma value on the fly
  const calculatedSigmaForDisplay = () => {
    if (isLoadingMkvliData || currentTotalSupplySmallestUnit === null) return '...';
    const T = currentTotalSupplySmallestUnit;
    const Rd = diamondMkvliReserve ?? BigInt(0);
    const B = latestBurnedTokens ?? BigInt(0);
    // console.log("MintForm: calculatedSigmaForDisplay - Values: T=", T?.toString(), "Rd=", Rd?.toString(), "B=", B?.toString()); // DEBUG
    const sigma = T - Rd - B;
    // console.log("MintForm: calculatedSigmaForDisplay - Calculated sigma:", sigma?.toString()); // DEBUG
    return sigma >= BigInt(0) ? sigma.toString() : 'Error';
  };

  // --- New handlers for Redeem functionality ---
  const incrementRedeemAmount = () => {
    tapSoundEffectRef.current?.play().catch(console.error);
    setRedeemAmount(prev => prev + 1);
  };

  const decrementRedeemAmount = () => {
    tapSoundEffectRef.current?.play().catch(console.error);
    setRedeemAmount(prev => Math.max(1, prev - 1)); // Min 1 to redeem
  };

  const estimatedUsdcToReceive = () => {
    const sigmaCirculatingSupply = calculatedSigma(); // In whole MKVLI units (since decimals = 0)
    const currentRedeemAmountBigInt = BigInt(redeemAmount); // redeemAmount is whole MKVLI tokens

    // Scenario 1: User is trying to redeem the entire circulating supply
    if (sigmaCirculatingSupply > 0n && currentRedeemAmountBigInt === sigmaCirculatingSupply && usdcReserveInContract) {
      // If redeeming the entire effective supply, the estimated receive MUST be the entire reserve
      return ethers.formatUnits(usdcReserveInContract, USDC_DECIMALS);
    }

    // Scenario 2: Partial redeem or other cases (original logic)
    // fetchedPriceSmallestUnit is likely Ω/Σ (USDC reserve / Circulating Supply),
    // which is the price per 1 whole MKVLI token, in smallest USDC units.
    if (fetchedPriceSmallestUnit && fetchedPriceSmallestUnit > 0n && redeemAmount > 0) {
      // Since mkvliDecimals is 0, redeemAmount directly represents the units.
      const totalUsdcValueSmallest = currentRedeemAmountBigInt * fetchedPriceSmallestUnit;
      return ethers.formatUnits(totalUsdcValueSmallest, USDC_DECIMALS);
    }

    return '0.00';
  };

  // This function will now contain the core logic for the redeem transaction
  const executeActualRedeem = async (amountToRedeem: number) => {
    if (!activeAccount?.address || !TSPABI.contract) {
      setErrorModalTitle("Wallet Not Connected");
      setErrorModalMessage("Please connect your wallet to redeem tokens.");
      setShowErrorModal(true);
      return;
    }
    if (amountToRedeem <= 0) {
      setErrorModalTitle("Invalid Amount");
      setErrorModalMessage("Please enter a valid amount to redeem.");
      setShowErrorModal(true);
      return;
    }
    const redeemAmountSmallestUnits = BigInt(amountToRedeem) * BigInt(10 ** mkvliDecimals);
    if (userMkvliBalance === null || redeemAmountSmallestUnits > userMkvliBalance) {
      setErrorModalTitle("Insufficient Balance");
      setErrorModalMessage("You do not have enough MKVLI to redeem this amount.");
      setShowErrorModal(true);
      return;
    }

    setIsRedeeming(true);
    setShowRedeemDIOConfirmModal(false); // Close confirmation modal if it was open

    try {
      const transactionToPrepare = prepareContractCall({
        contract: TSPABI.contract,
        method: "redeemTokens",
        params: [BigInt(amountToRedeem) * BigInt(10 ** mkvliDecimals)],
      });
      const { transactionHash: txHash } = await sendAndConfirmTransaction({ transaction: transactionToPrepare, account: activeAccount });

      // console.log("Redeem successful, txHash:", txHash);
      setRedeemSuccessTxHash(txHash);
      setShowRedeemSuccessModal(true);

      fetchAllContractData();
      setRedeemAmount(1);
    } catch (err: any) {
      console.error("Redeem transaction error object:", err);

      let title = "Redemption Failed";
      let determinedMessage: string | undefined; // Use a temporary variable

      if (typeof err === 'object' && err !== null) {
        const errObj = err as { code?: number; message?: string; reason?: string }; // Cast once

        if (errObj.code === 4001) {
          title = "Transaction Rejected";
          determinedMessage = "You rejected the transaction in your wallet.";
        } else if (errObj.message && typeof errObj.message === 'string' &&
          (errObj.message.toLowerCase().includes("user rejected") ||
            errObj.message.toLowerCase().includes("user denied") ||
            errObj.message.toLowerCase().includes("transaction rejected"))) {
          title = "Transaction Rejected";
          determinedMessage = "You rejected the transaction in your wallet.";
        } else if (typeof errObj.reason === 'string' && errObj.reason.trim() !== '') {
          determinedMessage = errObj.reason;
        } else if (typeof errObj.message === 'string' && errObj.message.trim() !== '') {
          determinedMessage = errObj.message;
        }
      }

      // Ensure message is always a string, falling back to a default.
      const finalMessage = determinedMessage || "An unexpected error occurred. Please check the console for details.";

      setErrorModalTitle(title);
      setErrorModalMessage(finalMessage);
      setShowErrorModal(true);
    } finally {
      setIsRedeeming(false);
    }
  };

  const checkSpecificTokensForDIOMarkers = async (userAddress: string, numberOfTokensToRedeem: number): Promise<{ shouldWarn: boolean; offendingTokenIds: string[] }> => {
    // console.warn("DIO Marker check: Verifying `getOwnedTokens` and `getDIOMarkers` method names from ABI.");
    if (numberOfTokensToRedeem <= 0) {
      // console.log("checkSpecificTokensForDIOMarkers: numberOfTokensToRedeem is 0 or less. Returning no warning.");
      return { shouldWarn: false, offendingTokenIds: [] };
    }

    const collectedMarkedTokenIds: string[] = [];

    try {
      const ownedTokenIdsResult = await readContract({ contract: TSPABI.contract, method: "getOwnedTokens", params: [userAddress] });
      const allOwnedTokenIds = (Array.isArray(ownedTokenIdsResult) ? ownedTokenIdsResult : []) as (string | number | bigint)[];

      if (allOwnedTokenIds.length === 0) {
        // console.log("checkSpecificTokensForDIOMarkers: User owns no specific token IDs. Returning no warning.");
        return { shouldWarn: false, offendingTokenIds: [] };
      }

      const tokensToCheckCount = Math.min(numberOfTokensToRedeem, allOwnedTokenIds.length);
      const tokenIdsToCheck = allOwnedTokenIds.slice(0, tokensToCheckCount);

      if (tokenIdsToCheck.length === 0) {
        // console.log("checkSpecificTokensForDIOMarkers: No tokens to check after slice. Returning no warning.");
        return { shouldWarn: false, offendingTokenIds: [] };
      }

      // console.log(`Checking DIO markers for the first ${tokenIdsToCheck.length} token(s) to be redeemed:`, tokenIdsToCheck);

      for (const tokenIdValue of tokenIdsToCheck) {
        let paramTokenId: bigint;
        try { paramTokenId = BigInt(tokenIdValue); }
        catch (conversionError) {
          console.error(`Failed to convert tokenId '${tokenIdValue}' to BigInt. Skipping this token.`, conversionError);
          continue;
        }

        const dioIdsForTokenResult = await readContract({ contract: TSPABI.contract, method: "getDIOMarkers", params: [paramTokenId] });
        const dioIdsForToken = (Array.isArray(dioIdsForTokenResult) ? dioIdsForTokenResult : []) as (string | number | bigint)[];

        if (dioIdsForToken.length > 0) {
          // console.log(`Token ID ${tokenIdValue} (as BigInt: ${paramTokenId}) has DIO markers.`);
          collectedMarkedTokenIds.push(paramTokenId.toString());
        }
      }

      if (collectedMarkedTokenIds.length > 0) {
        // console.log("checkSpecificTokensForDIOMarkers: Returning shouldWarn: true, offendingTokenIds:", collectedMarkedTokenIds);
        return { shouldWarn: true, offendingTokenIds: collectedMarkedTokenIds };
      }
      // console.log("checkSpecificTokensForDIOMarkers: None of the specific tokens had DIO markers. Returning no warning.");
      return { shouldWarn: false, offendingTokenIds: [] };
    } catch (error) {
      // console.error("Error during checkSpecificTokensForDIOMarkers:", error);
      setErrorModalTitle("DIO Check Failed");
      setErrorModalMessage("Could not verify DIO status for the tokens to be redeemed. Please try again or proceed with caution.");
      setShowErrorModal(true);
      // console.log("checkSpecificTokensForDIOMarkers: Error caught. Returning shouldWarn: true with error token.");
      return { shouldWarn: true, offendingTokenIds: ["Error during check"] };
    }
  };

  const handleRedeem = async () => {
    if (!activeAccount?.address || !TSPABI.contract) {
      setErrorModalTitle("Wallet Not Connected");
      setShowErrorModal(true);
      return;
    }
    // Initial checks (can also be in executeActualRedeem to avoid duplication)
    if (redeemAmount <= 0) {
      setErrorModalTitle("Invalid Amount");
      setErrorModalMessage("Please enter a valid amount to redeem.");
      setShowErrorModal(true);
      return;
    }
    const amountToRedeemSmallestUnits = BigInt(redeemAmount) * BigInt(10 ** mkvliDecimals);
    if (userMkvliBalance === null || amountToRedeemSmallestUnits > userMkvliBalance) {
      setErrorModalTitle("Insufficient Balance");
      setErrorModalMessage("You do not have enough MKVLI to redeem this amount.");
      setShowErrorModal(true);
      return;
    }

    // --- Updated DIO Marker Check Logic --- 
    // console.log("handleRedeem: Initiating DIO marker check...");
    setIsLoadingTransaction(true);
    let checkResult = { shouldWarn: false, offendingTokenIds: [] as string[] };
    try {
      checkResult = await checkSpecificTokensForDIOMarkers(activeAccount.address, redeemAmount);
      // console.log("handleRedeem: Result from DIO check:", checkResult);
    } catch (checkSystemError) {
      // console.error("Unexpected error invoking DIO marker check system:", checkSystemError);
      setErrorModalTitle("DIO Check System Error");
      setErrorModalMessage("A system error occurred while checking token DIO status. Please try again.");
      setShowErrorModal(true);
      setIsLoadingTransaction(false);
      return;
    }
    setIsLoadingTransaction(false);

    if (checkResult.shouldWarn) {
      // console.log("handleRedeem: shouldWarn is true. Setting dioConfirmDetails and showing modal.");
      setDioConfirmDetails({
        amount: redeemAmount,
        subtext: "You may be surrendering valuable benefits from a perpetual returns clause in a DIO for which your token(s) were staked.",
        tokenIdsWithMarkers: checkResult.offendingTokenIds
      });
      setShowRedeemDIOConfirmModal(true);
    } else {
      // console.log("handleRedeem: shouldWarn is false. Proceeding to executeActualRedeem.");
      console.log("handleRedeem: shouldWarn is false. Proceeding to executeActualRedeem.");
      executeActualRedeem(redeemAmount);
    }
  };

  // Uncomment these for comprehensive debugging if needed:
  // console.log("Form render cycle. dioConfirmDetails:", dioConfirmDetails);
  // console.log("Form render cycle. showRedeemDIOConfirmModal:", showRedeemDIOConfirmModal);

  const handleReviewOrder = () => {
    if (totalUsdcCost <= BigInt(0)) {
      setError("Please enter a valid amount.");
      return;
    }
    setShowReviewModal(true);
  };

  const handleConfirmOrder = () => {
    setShowReviewModal(false);
    handleUnifiedMintAction();
  };

  return (
    <div className="w-full h-full font-sans tracking-wide text-zinc-300 select-none flex flex-col animate-in fade-in duration-500">

      {/* Header Row */}
      <div className="flex flex-wrap items-center gap-2 px-1 mb-2">
        {/* System Online Status */}
        <div className="flex items-center space-x-2 glass-card-light px-3 py-1.5 rounded-full border border-white/5">
          <div className={`h-1.5 w-1.5 rounded-full ${isLoadingPrice ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}></div>
          <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-500/80">
            {isLoadingPrice ? 'Syncing Network...' : 'System Online'}
          </span>
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => {
            tapSoundEffectRef.current?.play().catch(console.error);
            fetchAllContractData(true);
          }}
          className="p-1.5 rounded-full glass-card-light border border-white/5 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/30 transition-all active:scale-95 group"
          title="Refresh Live Data"
        >
          <ArrowPathIcon className={`w-3 h-3 ${isLoadingMkvliData ? 'animate-spin text-emerald-500' : ''}`} />
        </button>

        {/* Coverage Stat */}
        {latestActualReserve && latestEffectiveReserve && (
          <div className="flex items-center space-x-2 glass-card-light px-3 py-1.5 rounded-full border border-white/5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">Coverage</span>
            <span className={`font-mono text-[9px] font-bold tracking-widest ${latestActualReserve >= latestEffectiveReserve ? 'text-emerald-400' : 'text-amber-400'}`}>
              {((latestActualReserve / latestEffectiveReserve) * 100).toFixed(1)}%
            </span>
          </div>
        )}

        {/* Reserve Stats */}
        <div className="flex items-center space-x-3 glass-card-light px-3 py-1.5 rounded-full border border-white/5">
          <div className="flex items-center space-x-1.5">
            <span className="font-mono text-[9px] text-zinc-500 uppercase">Vault</span>
            <span className="font-mono text-[9px] text-zinc-200 font-bold tracking-tight">
              ${(latestActualReserve !== null ? formatUsdcDisplay(BigInt(latestActualReserve)) : '0')} <span className="text-[8px] text-zinc-500">USDC</span>
            </span>
          </div>
          <div className="w-[1px] h-3 bg-white/10"></div>
          <div className="flex items-center space-x-1.5">
            <span className="font-mono text-[9px] text-zinc-500 uppercase">Σ</span>
            <span className="font-mono text-[9px] text-fuchsia-400 font-bold tracking-tight">
              {(mkvliReserve || 0).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Governance/Loan Stats */}
        <div className="flex items-center space-x-3 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5">
          <div className="flex items-center space-x-1.5">
            <span className="font-mono text-[9px] text-zinc-500 uppercase">Proposals</span>
            <span className="font-mono text-[9px] text-zinc-200 font-bold tracking-tight">
              <span className="text-zinc-500">Pending:</span> {totalProposals - passedProposals} <span className="text-zinc-500 mx-0.5">|</span> <span className="text-zinc-500">Approved:</span> {passedProposals}
            </span>
          </div>
          <div className="w-[1px] h-3 bg-white/10"></div>
          <div className="flex items-center space-x-1.5">
            <span className="font-mono text-[9px] text-zinc-500 uppercase">Loans</span>
            <span className="font-mono text-[9px] text-zinc-200 font-bold tracking-tight">
              <span className="text-zinc-500">Open:</span> {activeLoans} <span className="text-zinc-500 mx-0.5">|</span> <span className="text-zinc-500">Repaid:</span> {closedLoans}
            </span>
          </div>
        </div>

        {/* Finance Stats */}
        <div className="flex items-center space-x-3 glass-card-light px-3 py-1.5 rounded-full border border-white/5">
          <div className="flex items-center space-x-1.5">
            <span className="font-mono text-[9px] text-zinc-500 uppercase">Lent</span>
            <span className="font-mono text-[9px] text-blue-400 font-bold tracking-tight">
              ${(totalLended || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-[1px] h-3 bg-white/10"></div>
          <div className="flex items-center space-x-1.5">
            <span className="font-mono text-[9px] text-zinc-500 uppercase">Repaid</span>
            <span className="font-mono text-[9px] text-emerald-400 font-bold tracking-tight">
              ${(totalRepaid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              {totalLended > 0 && (
                (() => {
                  const roi = ((totalRepaid - totalLended) / totalLended) * 100;
                  const isPositive = roi >= 0;
                  return (roi !== 0) ? (
                    <span className={`ml-1 text-[8px] font-bold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      ({isPositive ? '+' : ''}{roi.toFixed(2)}%)
                    </span>
                  ) : null;
                })()
              )}
            </span>
          </div>
        </div>

      </div>

      {/* ============================================= */}
      {/* PREMIUM DASHBOARD - 3 ROW LAYOUT */}
      {/* ============================================= */}
      <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto pb-4">

        {/* ROW 1: THREE STAT CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {/* Price */}
          <div className="rounded-xl py-4 px-5 glass-card group hover:border-emerald-500/30 transition-colors">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Price</span>
            <div className="font-mono text-2xl font-light text-white">
              {isLoadingPrice ? '---' : `$${Number(ethers.formatUnits(finalPricePerTokenSmallestUnit, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
          </div>
          {/* MKVLI Balance */}
          <div className="rounded-xl py-4 px-5 glass-card group hover:border-purple-500/30 transition-colors">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">MKVLI Balance</span>
            <div className="font-mono text-2xl font-light text-white">
              {activeAccount && !isLoadingMkvliData ? formatMkvliDisplay(userMkvliBalance) : '---'}
            </div>
          </div>
          {/* USDC Balance */}
          <div className="rounded-xl py-4 px-5 glass-card group hover:border-cyan-500/30 transition-colors">
            <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">USDC Balance</span>
            <div className="font-mono text-2xl font-light text-white">
              ${activeAccount && !isLoadingMkvliData ? Number(ethers.formatUnits(usdcBalance, USDC_DECIMALS)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---'}
            </div>
          </div>
        </div>

        {/* ROW 2: FULL-WIDTH CHART */}
        <div className="rounded-2xl p-4 md:p-6 relative overflow-hidden ultra-glass shadow-xl flex flex-col min-h-[450px] sm:min-h-[350px] md:min-h-[280px] flex-1">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1">MKVLI Redemption Metrics</span>
              <div className="text-sm sm:text-base text-white font-mono">{isLoadingMkvliData ? '...' : currentSupplyDisplay} <span className="text-[10px] sm:text-xs text-zinc-500">Circulating</span></div>
            </div>
          </div>
          <div className="flex-1 min-h-[300px] sm:min-h-[200px]">
            <RedemptionPriceChart priceHistory={priceHistory} usdcDecimals={USDC_DECIMALS} />
          </div>
        </div>

        {/* ROW 3: EQUATION (LEFT) + ACTION (RIGHT) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* FORMULA CARD */}
          <div className="rounded-2xl p-5 relative overflow-hidden ultra-glass shadow-2xl">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-white/[0.02] pointer-events-none" />

            <div className="relative z-10">
              {/* Header */}
              <div className="text-center mb-6">
                <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">Redemption Formula</span>
                <p className="text-[10px] text-zinc-600 mt-2 font-mono leading-relaxed max-w-xs mx-auto">
                  The immutable law governing value. A self-balancing constant ensuring perpetual solvency. Unlike fiat, MKVLI is not decreed—it is derived.
                </p>
              </div>

              {/* Main Equation: Ψ = Ω / Σ with descriptions */}
              <div className="flex items-start justify-center space-x-2 sm:space-x-4 text-2xl sm:text-4xl font-mono">
                {/* Ψ */}
                <div
                  className="relative cursor-default flex flex-col items-center"
                  onMouseEnter={() => !isSigmaPinned && setHoveredMainSymbol('price')}
                  onMouseLeave={() => !isSigmaPinned && setHoveredMainSymbol(null)}
                >
                  <span className={`transition-all duration-300 ${isSigmaPinned ? 'text-zinc-600' :
                    hoveredMainSymbol === 'price' ? 'text-white scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]' :
                      hoveredMainSymbol ? 'text-zinc-700 opacity-30' : 'text-zinc-400'
                    }`}>{MAIN_FORMULA_SYMBOLS.price.symbol}</span>
                  <span className="text-[8px] text-zinc-600 mt-1 uppercase tracking-wider">Price</span>
                </div>

                <span className="text-zinc-600 mt-1">=</span>

                {/* Ω */}
                <div
                  className="relative cursor-default flex flex-col items-center"
                  onMouseEnter={() => !isSigmaPinned && setHoveredMainSymbol('reserve')}
                  onMouseLeave={() => !isSigmaPinned && setHoveredMainSymbol(null)}
                >
                  <span className={`transition-all duration-300 ${isSigmaPinned ? 'text-zinc-600' :
                    hoveredMainSymbol === 'reserve' ? 'text-white scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]' :
                      hoveredMainSymbol ? 'text-zinc-700 opacity-30' : 'text-zinc-400'
                    }`}>{MAIN_FORMULA_SYMBOLS.reserve.symbol}</span>
                  <span className="text-[8px] text-zinc-600 mt-1 uppercase tracking-wider">Reserve</span>
                </div>

                <span className="text-zinc-600 mt-1">/</span>

                {/* Σ - Clickable */}
                <div
                  className="relative cursor-pointer flex flex-col items-center"
                  onMouseEnter={() => setHoveredMainSymbol('supply')}
                  onMouseLeave={() => !isSigmaPinned && setHoveredMainSymbol(null)}
                  onClick={() => setIsSigmaPinned(!isSigmaPinned)}
                >
                  <span className={`font-bold transition-all duration-300 ${isSigmaPinned ? 'text-emerald-400 scale-110 drop-shadow-[0_0_12px_rgba(52,211,153,0.6)]' :
                    hoveredMainSymbol === 'supply' ? 'text-white scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]' :
                      hoveredMainSymbol ? 'text-zinc-700 opacity-30' : 'text-zinc-400'
                    }`}>{MAIN_FORMULA_SYMBOLS.supply.symbol}</span>
                  <span className={`text-[8px] mt-1 uppercase tracking-wider ${isSigmaPinned ? 'text-emerald-400' : 'text-zinc-600'}`}>Supply</span>
                </div>
              </div>

              {/* Live Values Row */}
              <div className="flex items-center justify-center gap-6 mt-4 text-[10px] font-mono text-zinc-500">
                <div className="flex flex-col items-center">
                  <span className="text-zinc-400">${formatUsdcDisplay(finalPricePerTokenSmallestUnit)}</span>
                </div>
                <div className="text-zinc-700">=</div>
                <div className="flex flex-col items-center">
                  <span className="text-zinc-400">${!isLoadingMkvliData ? formatUsdcDisplay(usdcReserveInContract) : '...'}</span>
                </div>
                <div className="text-zinc-700">/</div>
                <div className="flex flex-col items-center">
                  <span className="text-zinc-400">{calculatedSigmaForDisplay()}</span>
                </div>
              </div>

              {/* Hover Label */}
              <div className="h-6 flex items-center justify-center mt-2">
                <span className={`text-[10px] uppercase tracking-widest transition-opacity duration-200 ${hoveredSigmaCalcSymbol || hoveredMainSymbol || isSigmaPinned ? 'opacity-100' : 'opacity-0'} ${hoveredSigmaCalcSymbol || hoveredMainSymbol === 'supply' || isSigmaPinned ? 'text-emerald-400' : 'text-zinc-400'}`}>
                  {hoveredSigmaCalcSymbol === 'T' ? 'ISSUED: The total quantity of tokens brought into existence.' :
                    hoveredSigmaCalcSymbol === 'Rt' ? 'RESERVED: Tokens held within the Diamond Standard contract.' :
                      hoveredSigmaCalcSymbol === 'B' ? 'BURNED: Tokens permanently removed from the ledger.' :
                        hoveredMainSymbol === 'price' && !isSigmaPinned ? 'THE TRUTH: Mathematical certainty. The precise claim on the treasury.' :
                          hoveredMainSymbol === 'reserve' && !isSigmaPinned ? 'THE VAULT: Transparent, on-chain USDC backing. Auditable & Immutable.' :
                            isSigmaPinned ? 'THE CIRCULATION: Dynamically adjusting supply. Click to unpin.' :
                              hoveredMainSymbol === 'supply' ? 'THE CIRCULATION: The living economy. Click to analyze.' : ''}
                </span>
              </div>

              {/* Layout: Toggle between Supply Breakdown and Elegant Footer to maintain height */}
              <div className="h-[64px] relative mt-2">
                {(isSigmaPinned || hoveredMainSymbol === 'supply') ? (
                  <div className="bg-black/30 rounded-lg px-2 border border-emerald-500/20 animate-in fade-in duration-200 h-full flex flex-col justify-center">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center space-x-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mr-2">Supply:</span>

                        <div className="flex items-center cursor-default group" onMouseEnter={() => setHoveredSigmaCalcSymbol('T')} onMouseLeave={() => setHoveredSigmaCalcSymbol(null)}>
                          <span className={`group-hover:text-white transition-colors ${hoveredSigmaCalcSymbol === 'T' ? 'text-white' : 'text-zinc-400'}`}>T</span>
                          <span className="text-[10px] text-zinc-500 ml-0.5">({!isLoadingMkvliData ? currentSupplyDisplay : '...'})</span>
                        </div>

                        <span className="text-zinc-600 mx-1">-</span>

                        <div className="flex items-center cursor-default group" onMouseEnter={() => setHoveredSigmaCalcSymbol('Rt')} onMouseLeave={() => setHoveredSigmaCalcSymbol(null)}>
                          <span className={`group-hover:text-white transition-colors ${hoveredSigmaCalcSymbol === 'Rt' ? 'text-white' : 'text-zinc-400'}`}>R<sub className="text-zinc-500">♢</sub></span>
                          <span className="text-[10px] text-zinc-500 ml-0.5">({!isLoadingMkvliData && diamondMkvliReserve !== null ? formatMkvliDisplay(diamondMkvliReserve) : '0'})</span>
                        </div>

                        <span className="text-zinc-600 mx-1">-</span>

                        <div className="flex items-center cursor-default group" onMouseEnter={() => setHoveredSigmaCalcSymbol('B')} onMouseLeave={() => setHoveredSigmaCalcSymbol(null)}>
                          <span className={`group-hover:text-white transition-colors ${hoveredSigmaCalcSymbol === 'B' ? 'text-white' : 'text-zinc-400'}`}>B</span>
                          <span className="text-[10px] text-zinc-500 ml-0.5">({latestBurnedTokens !== null ? formatMkvliDisplay(latestBurnedTokens) : '0'})</span>
                        </div>
                      </div>

                      <div className="flex items-center pl-2 border-l border-white/5">
                        <span className="text-emerald-400 font-bold mr-1">Σ =</span>
                        <span className="text-white">{calculatedSigmaForDisplay()}</span>
                      </div>
                    </div>
                  </div>
                ) : !hoveredMainSymbol ? (
                  <div className="animate-in fade-in duration-300 h-full flex flex-col justify-center">
                    <div className="border-t border-white/5 pt-2 text-center w-full">
                      <p className="text-[8px] text-zinc-500 font-mono uppercase tracking-wider mb-1">Mastery of Value</p>
                      <p className="text-[9px] text-zinc-600 italic leading-snug max-w-sm mx-auto">
                        "By binding token supply directly to reserves via this immutable equation, RENSNCE eliminates the run on the bank. Liquidity is not provided—it is intrinsic."
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full" />
                )}
              </div>
            </div>
          </div>

          {/* ACTION CARD */}
          <div className="rounded-2xl p-5 relative overflow-hidden ultra-glass shadow-xl flex flex-col">
            {/* Background Glow */}
            <div className={`absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl ${mode === 'MINT' ? 'from-emerald-500/10' : 'from-red-500/10'} to-transparent rounded-full blur-3xl pointer-events-none -mr-10 -mt-10 transition-colors duration-500`} />

            {/* MKVLI Medallion */}
            <div className="flex justify-center mb-3 relative z-10">
              <img src="/Medallions/MKVLI.png" alt="MKVLI" className="h-12 w-12 object-contain opacity-80" />
            </div>

            {/* Mode Toggle */}
            <div className="flex justify-center mb-4 relative z-10">
              <div className="flex space-x-1 rounded-full p-1 glass-card-light">
                <button
                  onClick={() => setMode('MINT')}
                  className={`px-6 py-2 text-[9px] font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${mode === 'MINT' ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Deposit
                </button>
                <button
                  onClick={() => setMode('REDEEM')}
                  className={`px-6 py-2 text-[9px] font-bold uppercase tracking-wider rounded-full transition-all duration-300 ${mode === 'REDEEM' ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  Withdraw
                </button>
              </div>
            </div>

            {/* ERROR INDICATOR */}
            {error && (
              <div className="mb-3 rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-center animate-in fade-in slide-in-from-top-2">
                <p className="text-[9px] text-red-400 font-mono">{error}</p>
              </div>
            )}

            {mode === 'MINT' ? (
              <div className="flex flex-col justify-center space-y-4 relative z-10 flex-1">
                <div className="text-center">
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Quantity to Deposit</label>
                  <div className="flex items-center justify-center space-x-4">
                    <button onClick={decrementTokens} className="h-10 w-10 flex items-center justify-center rounded-full bg-black/30 border border-zinc-700 text-zinc-500 hover:text-white hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all active:scale-95">
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <div className="w-28 text-center">
                      <input type="number" value={tokens} onChange={(e) => { const val = Number(e.target.value); if (val >= 1) setTokens(val); }} className="custom-number-input w-full bg-transparent text-center font-mono text-4xl font-light text-white outline-none focus:text-emerald-400 transition-colors" />
                    </div>
                    <button onClick={incrementTokens} className="h-10 w-10 flex items-center justify-center rounded-full bg-black/30 border border-zinc-700 text-zinc-500 hover:text-white hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all active:scale-95">
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-3 font-mono text-sm text-zinc-500">≈ ${formatUsdcDisplay(totalUsdcCost)} USDC</p>
                </div>

                <button onClick={handleReviewOrder} disabled={buttonDisabled || isLoadingTransaction} className="w-full group relative overflow-hidden rounded-xl bg-white px-4 py-4 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:grayscale disabled:pointer-events-none shadow-lg shadow-emerald-900/20">
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                  <span className="relative font-mono text-sm font-bold tracking-[0.15em] text-black uppercase flex items-center justify-center z-10">
                    {buttonDisabled ? buttonText : "Review Order"}
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col justify-center space-y-4 relative z-10 flex-1">
                <div className="text-center">
                  <label className="block text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Quantity to Withdraw</label>
                  <div className="flex items-center justify-center space-x-4">
                    <button onClick={decrementRedeemAmount} className="h-10 w-10 flex items-center justify-center rounded-full bg-black/30 border border-zinc-700 text-zinc-500 hover:text-white hover:border-red-500/50 hover:bg-red-500/10 transition-all active:scale-95">
                      <MinusIcon className="h-4 w-4" />
                    </button>
                    <div className="w-28 text-center">
                      <input type="number" value={redeemAmount} onChange={(e) => { const val = Number(e.target.value); if (val >= 1) setRedeemAmount(val); }} className="custom-number-input w-full bg-transparent text-center font-mono text-4xl font-light text-white outline-none focus:text-red-400 transition-colors" />
                    </div>
                    <button onClick={incrementRedeemAmount} className="h-10 w-10 flex items-center justify-center rounded-full bg-black/30 border border-zinc-700 text-zinc-500 hover:text-white hover:border-red-500/50 hover:bg-red-500/10 transition-all active:scale-95">
                      <PlusIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-3 font-mono text-sm text-zinc-500">Est. Receive: <span className="text-zinc-300">${estimatedUsdcToReceive()}</span></p>
                </div>

                <button onClick={handleRedeem} disabled={!activeAccount || isRedeeming || redeemAmount <= 0} className="w-full relative overflow-hidden rounded-xl bg-zinc-900 border border-red-500/30 px-4 py-4 transition-all duration-300 hover:bg-red-950/30 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-red-900/10">
                  <span className="relative font-mono text-sm font-bold tracking-[0.15em] text-red-500 uppercase">
                    {isRedeeming ? 'Processing...' : 'Execute Withdrawal'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {
        showReviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl">
              <div className="p-6">
                <h3 className="text-lg font-sans font-medium text-white mb-6 text-center tracking-wide">Review Order</h3>

                <div className="space-y-4 font-mono text-xs">
                  <div className="flex justify-between text-zinc-400">
                    <span>Amount to Mint</span>
                    <span className="text-white">{tokens} MKVLI</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Price per Token</span>
                    <span className="text-white">${formatUsdcDisplay(finalPricePerTokenSmallestUnit)}</span>
                  </div>
                  <div className="h-px bg-white/10 my-4" />
                  <div className="flex justify-between text-zinc-200 font-bold text-sm">
                    <span>Total Usdc Cost</span>
                    <span>${formatUsdcDisplay(totalUsdcCost)}</span>
                  </div>
                </div >

                <div className="mt-8 space-y-3">
                  <button
                    onClick={handleConfirmOrder}
                    className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black py-3 font-mono text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Confirm & Pay
                  </button>
                  <button
                    onClick={() => setShowReviewModal(false)}
                    className="w-full rounded-lg bg-transparent hover:bg-white/5 text-zinc-500 py-3 font-mono text-xs font-bold uppercase tracking-widest transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div >
            </div >
          </div >
        )
      }

      {/* OTHER MODALS (Success, Error, Onramp) - Retaining styles adjusted for new aesthetic */}

      {/* Success Modal */}
      {
        showSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-emerald-500/30 p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-4 text-emerald-500">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-mono tracking-wide">ACQUISITION COMPLETE</h3>
              <p className="text-xs text-zinc-400 mb-6 font-mono">
                Transaction Hash: <span className="text-zinc-500">{successTxHash?.slice(0, 10)}...</span>
              </p>
              <button onClick={() => { setShowSuccessModal(false); setSuccessTxHash(null); setTokens(1); }} className="w-full rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white py-3 font-mono text-xs uppercase transition-colors">
                Close
              </button>
            </div>
          </div>
        )
      }

      {/* Error Modal */}
      {
        showErrorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-red-500/30 p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
              <h3 className="text-lg font-bold text-red-500 mb-2 font-mono tracking-wide uppercase">{errorModalTitle}</h3>
              <p className="text-xs text-zinc-400 mb-6 font-mono leading-relaxed">{errorModalMessage}</p>
              <button onClick={() => { setShowErrorModal(false); setMintStep('idle'); }} className="w-full rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white py-3 font-mono text-xs uppercase transition-colors">
                Dismiss
              </button>
            </div>
          </div>
        )
      }

      {/* Onramp Modal */}
      {
        showOnrampModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/90 z-[100] p-4 backdrop-blur-md">
            <div className="bg-zinc-900 p-8 rounded-2xl border border-white/10 max-w-md text-center">
              <h3 className="text-white font-sans text-lg mb-4">Insufficient Funds</h3>
              <p className="text-zinc-400 text-sm mb-6">Complete the purchase in the new window to continue.</p>
              <div className="space-y-3">
                <a href={onrampUrl} target="_blank" className="block w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-mono text-xs uppercase tracking-wider">Open Payment Window</a>
                <button onClick={handlePostOnrampAndContinue} className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs uppercase tracking-wider">I Have Completed Payment</button>
                <button onClick={() => setShowOnrampModal(false)} className="w-full py-3 rounded-lg bg-transparent text-zinc-500 hover:text-white font-mono text-xs uppercase tracking-wider">Cancel</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Redeem Success Modal */}
      {
        showRedeemSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-sky-500/30 p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center">
              <h3 className="text-lg font-bold text-sky-400 mb-2 font-mono tracking-wide">REDEMPTION COMPLETE</h3>
              <p className="text-xs text-zinc-400 mb-6 font-mono">Funds returned to reserve.</p>
              <button
                onClick={() => {
                  setShowRedeemSuccessModal(false);
                  setRedeemSuccessTxHash(null);
                }}
                className="w-full rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white py-3 font-mono text-xs uppercase transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )
      }

      {/* DIO Confirm Modal */}
      {
        showRedeemDIOConfirmModal && dioConfirmDetails && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-yellow-500/30 p-8 rounded-2xl shadow-2xl w-full max-w-md text-center">
              <h3 className="text-lg font-bold text-yellow-400 mb-4 font-mono tracking-wide">WARNING: DIO MARKERS DETECTED</h3>
              <p className="text-xs text-zinc-300 mb-4 font-mono leading-relaxed bg-yellow-500/10 p-4 rounded-lg border border-yellow-500/20">
                {dioConfirmDetails.subtext}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { executeActualRedeem(dioConfirmDetails.amount); }}
                  className="rounded-lg bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 border border-yellow-600/50 py-3 font-mono text-xs uppercase transition-colors"
                >
                  Start Redemption
                </button>
                <button
                  onClick={() => {
                    setShowRedeemDIOConfirmModal(false);
                    setDioConfirmDetails(null);
                    setIsRedeeming(false);
                  }}
                  className="rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white py-3 font-mono text-xs uppercase transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      }

      <style jsx global>{`
        .custom-number-input::-webkit-outer-spin-button,
        .custom-number-input::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .custom-number-input[type=number] {
          -moz-appearance: textfield;
        }
      `}</style>
    </div>
  );
}

