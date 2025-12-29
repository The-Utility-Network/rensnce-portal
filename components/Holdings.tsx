import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CircularProgress,
  Modal,
  IconButton as MuiIconButton,
  Chip,
  Divider,
  Fade,
  Grow,
  Tooltip
} from '@mui/material';
import { CardProps } from '@mui/material/Card';
import { styled, useTheme, alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import GridViewIcon from '@mui/icons-material/GridView';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewStreamIcon from '@mui/icons-material/ViewStream'; // For Details view
import SortIcon from '@mui/icons-material/Sort';
import FilterListIcon from '@mui/icons-material/FilterList';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ShowChartIcon from '@mui/icons-material/ShowChart';

import { useActiveWallet } from 'thirdweb/react';
import { getContract, readContract } from 'thirdweb';
import { baseSepolia, base } from 'thirdweb/chains';
import { client, diamondAddress, default as diamondAbi } from './core/TSPABI';
import { ethers } from 'ethers';

const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

// --- GENERATIVE GRADIENT LOGIC (Amber -> Dark Red/Brown) ---
const generateDynamicColor = (index: number, total: number) => {
  if (total <= 1) return `rgba(245, 158, 11, 0.8)`; // Default Amber

  const position = index / (total - 1);

  // START: Amber (Orange-Gold) -> END: Dark Red / Burnt Orange
  const r = Math.round(255 - (155 * position));
  const g = Math.round(165 - (145 * position));
  const b = Math.round(0 + (20 * position));

  return `rgba(${r}, ${g}, ${b}, 0.85)`;
};

// --- STYLED COMPONENTS ---

const PanelContainer = styled(Box)(({ theme }) => ({
  fontFamily: MONO_FONT_FAMILY,
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: 'transparent',
  padding: theme.spacing(4),
  overflow: 'hidden', // Contain scroll
}));

const TitleBar = styled(Box)(({ theme }) => ({
  width: '100%',
  marginBottom: theme.spacing(3),
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}));

const Title = styled('h1')(({ theme }) => ({
  fontFamily: MONO_FONT_FAMILY,
  fontWeight: 700,
  fontSize: '2rem',
  color: '#f59e0b', // Amber text
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  textShadow: '0 0 20px rgba(245, 158, 11, 0.4)',
  margin: 0,
}));

const ContentWrapper = styled(Box)(({ theme }) => ({
  flexGrow: 1,
  overflowY: 'auto',
  paddingRight: theme.spacing(1),
  position: 'relative',
  '&::-webkit-scrollbar': { width: '4px' },
  '&::-webkit-scrollbar-track': { background: 'transparent' },
  '&::-webkit-scrollbar-thumb': { background: '#f59e0b', borderRadius: '4px' },
}));

// --- ANALYTICS DASHBOARD ---
const StatCard = styled(Box)(({ theme }) => ({
  borderRadius: '16px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  transition: 'transform 0.2s',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)'
  }
}));

// --- CONTROL BAR ---
const ControlBar = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: theme.spacing(3),
  borderRadius: '12px',
  padding: '8px 16px',
}));


// --- GRID CARD ---
const GridCard = styled(Card, {
  shouldForwardProp: (prop) => prop !== '$cardColor',
})<{ $cardColor: string }>(({ theme, $cardColor }) => ({
  fontFamily: MONO_FONT_FAMILY,
  background: $cardColor, // Solid gradient color
  borderRadius: '24px',
  position: 'relative',
  overflow: 'visible',
  aspectRatio: '1',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.3s ease',
  cursor: 'pointer',
  boxShadow: '0 10px 20px rgba(0,0,0,0.5)',
  border: '1px solid rgba(255,255,255,0.1)',
  '&:hover': {
    transform: 'translateY(-5px)',
    boxShadow: `0 20px 40px rgba(0,0,0,0.6), 0 0 20px ${$cardColor}`,
    zIndex: 10,
  },
  '&::after': { // Tab
    content: '""',
    position: 'absolute',
    bottom: '-25px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    background: $cardColor,
    boxShadow: '0 10px 20px rgba(0,0,0,0.3)',
    zIndex: 1,
    border: '1px solid rgba(255,255,255,0.1)',
  }
}));

const MedallionWrapper = styled(Box)({
  position: 'absolute',
  bottom: '-20px', // Perfectly centered in the 60px tab at -25px
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 5,
  width: '50px',
  height: '50px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

const MedallionImage = styled('img')({
  width: '100%',
  height: '100%',
  borderRadius: '50%',
  border: '2px solid rgba(255,255,255,0.2)',
  boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
});

// --- LIST ROW ---
const ListRowKey = styled(Box)({
  display: 'grid',
  gridTemplateColumns: '80px 1fr 1fr 1fr 80px',
  padding: '12px 24px',
  margin: '0 0 8px 0',
  background: 'rgba(255,255,255,0.03)',
  borderRadius: '12px',
  alignItems: 'center',
  border: '1px solid rgba(255,255,255,0.05)',
});

const ListRow = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '80px 1fr 1fr 1fr 80px',
  padding: '16px 24px',
  marginBottom: '8px',
  background: 'rgba(0,0,0,0.4)',
  borderRadius: '16px',
  alignItems: 'center',
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.05)',
  transition: 'all 0.2s',
  '&:hover': {
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    transform: 'translateX(4px)'
  }
}));

// --- TYPES ---
interface VRDIDetailFromContract {
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
}

interface FormattedVRDIDetail {
  id: string; // dioId
  principalUSDC: string;
  principalMKVLI20: string;
  interestRate: string;
  totalRepaymentAmount: string;
  debtor: string;
  isFrozen: boolean;
  isClosed: boolean;
  statusText: string;
  perpetualReturns?: string;
  depositedUSDC?: string;
  startTimestamp?: string;
  amortizationDurationDays?: string;
  deferralPeriodDays?: string;
  activePhaseIndex?: number;
}

interface TokenHolding {
  tokenId: string;
  dioMarkers: string[];
  vrdiDetails?: FormattedVRDIDetail[];
  isLoadingDetails: boolean;
}

// --- HELPER COMPONENTS ---
const IconButton = ({ children, active, onClick, title }: any) => (
  <Tooltip title={title}>
    <MuiIconButton
      onClick={onClick}
      sx={{
        color: active ? '#f59e0b' : 'rgba(255,255,255,0.4)',
        background: active ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
        borderRadius: '8px',
        padding: '8px',
        marginLeft: '8px',
        border: active ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent',
        transition: 'all 0.2s',
        '&:hover': {
          background: 'rgba(255,255,255,0.05)',
          color: '#fff',
        }
      }}
    >
      {children}
    </MuiIconButton>
  </Tooltip>
);

const CustomSelect = ({ value, onChange, options, icon }: any) => (
  <div className="relative group">
    <div className="flex items-center gap-2 px-3 py-2 bg-black/40 border border-white/10 rounded-lg group-hover:border-amber-500/50 transition-colors cursor-pointer">
      {icon && <span className="text-zinc-500 group-hover:text-amber-500 transition-colors">{icon}</span>}
      <select
        value={value}
        onChange={onChange}
        className="bg-transparent text-xs font-mono text-zinc-300 focus:outline-none appearance-none pr-8 cursor-pointer"
        style={{ WebkitAppearance: 'none' }}
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-300">{opt.label}</option>
        ))}
      </select>
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px]">▼</div>
    </div>
  </div>
);

// --- MAIN COMPONENT ---
const Holdings: React.FC = () => {
  const theme = useTheme();
  const wallet = useActiveWallet();
  const account = wallet?.getAccount();

  // State
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [isLoadingHoldings, setIsLoadingHoldings] = useState<boolean>(true);
  const [selectedToken, setSelectedToken] = useState<TokenHolding | null>(null);

  // UX State
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'details'>('grid');
  const [sortField, setSortField] = useState<string>('tokenId');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Cache
  const [dioMarkersLocalCache, setDioMarkersLocalCache] = useState<Record<string, string[]>>({});
  const DIO_MARKERS_CACHE_KEY = "holdingsDioMarkersCache_v1";

  const isTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';

  const diamondContract = useMemo(() => getContract({
    client,
    chain: isTestnet ? baseSepolia : base,
    address: diamondAddress,
    abi: diamondAbi,
  }), [isTestnet, diamondAddress]);

  // Initial Data Load
  useEffect(() => {
    try {
      const cached = localStorage.getItem(DIO_MARKERS_CACHE_KEY);
      if (cached) setDioMarkersLocalCache(JSON.parse(cached));
    } catch (e) { }
  }, []);

  useEffect(() => {
    let isActive = true;
    const loadTokens = async () => {
      if (!account?.address || !diamondContract) {
        setHoldings([]);
        setIsLoadingHoldings(false);
        return;
      }
      setIsLoadingHoldings(true);
      let cache = dioMarkersLocalCache;
      // Re-read cache if empty state
      if (Object.keys(cache).length === 0) {
        try {
          const c = localStorage.getItem(DIO_MARKERS_CACHE_KEY);
          if (c) cache = JSON.parse(c);
        } catch (e) { }
      }

      try {
        const idsBigInt = await readContract({
          contract: diamondContract,
          method: 'getOwnedTokens',
          params: [account.address]
        }) as bigint[];

        if (!isActive) return;

        const loaded = await Promise.all(idsBigInt.map(async (id) => {
          const tokenId = id.toString();
          let markers = cache[tokenId] || [];

          if (!cache[tokenId]) {
            try {
              const m = await readContract({ contract: diamondContract, method: 'getDIOMarkers', params: [id] }) as bigint[];
              markers = m.map(x => x.toString());
              cache[tokenId] = markers;
            } catch (e) {
              // console.warn("Marker fetch failed", e); 
            }
          }

          return { tokenId, dioMarkers: markers, isLoadingDetails: false, vrdiDetails: [] };
        }));

        if (isActive) {
          setHoldings(loaded);
          // Write back cache
          try { localStorage.setItem(DIO_MARKERS_CACHE_KEY, JSON.stringify(cache)); } catch (e) { }
        }
      } catch (e) {
        console.error("Fetch holdings failed", e);
      } finally {
        if (isActive) setIsLoadingHoldings(false);
      }
    };
    loadTokens();
    return () => { isActive = false; };
  }, [account?.address, diamondContract]);

  // Sorting
  const sortedHoldings = useMemo(() => {
    const sorted = [...holdings];
    sorted.sort((a, b) => {
      const valA = sortField === 'tokenId' ? parseInt(a.tokenId) : a.dioMarkers.length;
      const valB = sortField === 'tokenId' ? parseInt(b.tokenId) : b.dioMarkers.length;
      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });
    return sorted;
  }, [holdings, sortField, sortDirection]);

  // Analytics Calculation
  const analytics = useMemo(() => {
    const totalTokens = holdings.length;
    const activeLinks = holdings.reduce((acc, curr) => acc + curr.dioMarkers.length, 0);
    return { totalTokens, activeLinks };
  }, [holdings]);


  // Robust Fetch Details Logic
  const fetchDetails = async (token: TokenHolding) => {
    // Prevent double fetch
    if (token.isLoadingDetails) return;

    setHoldings(prev => prev.map(h => h.tokenId === token.tokenId ? { ...h, isLoadingDetails: true } : h));
    setSelectedToken(prev => prev?.tokenId === token.tokenId ? { ...prev, isLoadingDetails: true } : prev);

    console.log(`Holdings: Fetching details for token ${token.tokenId} with markers:`, token.dioMarkers);

    try {
      // 1. Get Limits
      const nextVRDIIdBigInt = await readContract({ contract: diamondContract, method: "getNextVRDIId", params: [] });
      const nextProposalIdBigInt = await readContract({ contract: diamondContract, method: "getNextProposalId", params: [] });

      const nextVRDIId = Number(nextVRDIIdBigInt);
      const nextProposalId = Number(nextProposalIdBigInt);

      // 2. Scan Proposals for Perpetual Returns info (Optional but nice to have)
      let allProposalsMap: Record<string, string> = {}; // dioId -> perpetualReturns text
      // Optimization: Only scan last 50 proposals or so to find potential matches if needed, 
      // or purely rely on VRDI data if that's sufficient. 
      // For now, let's just fetch VRDI details as that's the core request.

      // 3. Scan VRDIs
      // We only need to fetch VRDIs that math the token's dioMarkers
      const foundDetails: FormattedVRDIDetail[] = [];

      // Strategy: Iterate markers and find corresponding VRDIs. 
      // However, the contract doesn't have "getVRDIByDIOId". We must scan VRDIs or assume mapping.
      // The previous logic scanned the last N VRDIs to find matches. We will restore that.

      const scanDepth = Math.min(nextVRDIId, 50); // Scan last 50 VRDIs

      for (let i = 0; i < scanDepth; i++) {
        const vrdiId = BigInt(nextVRDIId - 1 - i);
        try {
          const d: any = await readContract({ contract: diamondContract, method: 'getVRDIDetails', params: [vrdiId] });

          // key check: d.dioId must match one of our markers
          if (d && d.dioId && token.dioMarkers.includes(d.dioId.toString())) {

            let statusText = 'Active';
            if (d.isClosed) statusText = 'Closed';
            else if (d.isFrozen) statusText = 'Frozen';

            foundDetails.push({
              id: d.dioId.toString(),
              debtor: d.debtor,
              statusText: statusText,
              principalUSDC: ethers.formatUnits(d.principalUSDC, 6),
              principalMKVLI20: d.principalMKVLI20.toString(),
              interestRate: (Number(d.interestRate) / 100).toFixed(2) + '%',
              totalRepaymentAmount: ethers.formatUnits(d.totalRepaymentAmount, 6),
              isFrozen: d.isFrozen,
              isClosed: d.isClosed,
              depositedUSDC: ethers.formatUnits(d.depositedUSDC, 6),
              startTimestamp: d.startTimestamp > 0n ? new Date(Number(d.startTimestamp) * 1000).toLocaleDateString() : 'N/A',
              amortizationDurationDays: d.amortizationDuration > 0n ? (Number(d.amortizationDuration) / 86400).toFixed(0) + ' days' : 'N/A',
              deferralPeriodDays: d.deferralPeriod > 0n ? (Number(d.deferralPeriod) / 86400).toFixed(0) + ' days' : 'N/A',
              activePhaseIndex: Number(d.activePhaseIndex)
            });
          }
        } catch (err) {
          console.warn(`Error fetching VRDI ${vrdiId}`, err);
        }
      }

      console.log(`Holdings: Found ${foundDetails.length} VRDI details for token ${token.tokenId}`);

      const updatedToken: TokenHolding = {
        ...token,
        vrdiDetails: foundDetails,
        isLoadingDetails: false
      };

      setHoldings(prev => prev.map(h => h.tokenId === token.tokenId ? updatedToken : h));
      setSelectedToken(prev => prev?.tokenId === token.tokenId ? updatedToken : prev);

    } catch (error) {
      console.error("Holdings: Detailed fetch failed", error);
      setHoldings(prev => prev.map(h => h.tokenId === token.tokenId ? { ...h, isLoadingDetails: false } : h));
      setSelectedToken(prev => prev?.tokenId === token.tokenId ? { ...prev, isLoadingDetails: false } : prev);
    }
  };

  const handleCardClick = (token: TokenHolding) => {
    setSelectedToken(token);
    if (!token.vrdiDetails || token.vrdiDetails.length === 0) fetchDetails(token);
  };

  // --- RENDERS ---

  return (
    <PanelContainer>

      {/* HEADER & ANALYTICS */}
      <TitleBar>
        <Box>
          <Title>MY TOKEN HOLDINGS</Title>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontFamily: MONO_FONT_FAMILY, letterSpacing: '2px' }}>
            TREASURY VAULT 0x...{account?.address.slice(-4)}
          </Typography>
        </Box>

        {/* ANALYTICS ROW FOR PC */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 2 }}>
          <StatCard className="glass-card-light">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Total Assets</span>
            <div className="flex items-center gap-2">
              <AccountBalanceWalletIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
              <span className="text-xl font-bold text-white">{analytics.totalTokens}</span>
            </div>
          </StatCard>
          <StatCard className="glass-card-light">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Active Links</span>
            <div className="flex items-center gap-2">
              <TrendingUpIcon sx={{ fontSize: 16, color: '#06b6d4' }} />
              <span className="text-xl font-bold text-white">{analytics.activeLinks}</span>
            </div>
          </StatCard>
          <StatCard className="glass-card-light">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Status</span>
            <div className="flex items-center gap-2">
              <ShowChartIcon sx={{ fontSize: 16, color: '#10b981' }} />
              <span className="text-xl font-bold text-white">SYNCED</span>
            </div>
          </StatCard>
        </Box>
      </TitleBar>

      <ControlBar className="glass-card-light">
        <Box sx={{ display: 'flex', gap: 2 }}>
          <CustomSelect
            value={sortField}
            onChange={(e: any) => setSortField(e.target.value)}
            options={[{ value: 'tokenId', label: 'Token ID' }, { value: 'dioLinks', label: 'DIO Count' }]}
            icon={<SortIcon fontSize="small" />}
          />
          <IconButton
            active={sortDirection === 'desc'}
            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
            title="Toggle Order"
          >
            <span className="font-mono text-[10px] font-bold">{sortDirection.toUpperCase()}</span>
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex' }}>
          <IconButton active={viewMode === 'grid'} onClick={() => setViewMode('grid')} title="Grid View">
            <GridViewIcon fontSize="small" />
          </IconButton>
          <IconButton active={viewMode === 'list'} onClick={() => setViewMode('list')} title="List View">
            <ViewListIcon fontSize="small" />
          </IconButton>
          <IconButton active={viewMode === 'details'} onClick={() => setViewMode('details')} title="Details View">
            <ViewStreamIcon fontSize="small" />
          </IconButton>
        </Box>
      </ControlBar>

      <ContentWrapper>
        {isLoadingHoldings ? (
          <div className="flex flex-col items-center justify-center h-64">
            <CircularProgress sx={{ color: '#f59e0b' }} size={40} thickness={4} />
            <span className="text-xs font-mono text-amber-500 tracking-widest animate-pulse mt-4">DECRYPTING VAULT...</span>
          </div>
        ) : (
          <>
            {/* --- GRID VIEW --- */}
            {viewMode === 'grid' && (
              <Grid container spacing={4} sx={{ pb: 8 }}>
                {sortedHoldings.map((token, index) => (
                  <Grid item xs={6} sm={4} md={3} lg={2} key={token.tokenId}>
                    <Fade in timeout={300 + (index * 50)}>
                      <GridCard
                        $cardColor={generateDynamicColor(index, sortedHoldings.length)}
                        onClick={() => handleCardClick(token)}
                      >
                        <Box sx={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                          <span className="text-[10px] font-mono text-white/70 uppercase tracking-widest">Token ID</span>
                          <span className="text-2xl font-bold text-white drop-shadow-sm">#{token.tokenId}</span>
                          <div className="flex items-center gap-1 bg-black/20 px-2 py-0.5 rounded-full border border-white/10 mt-1">
                            <span className="text-[9px] font-mono text-white/80">
                              {token.dioMarkers.length} Links
                            </span>
                          </div>
                        </Box>
                        <MedallionWrapper>
                          <MedallionImage src="/Medallions/MKVLI.png" alt="MKVLI" />
                        </MedallionWrapper>
                      </GridCard>
                    </Fade>
                  </Grid>
                ))}
              </Grid>
            )}

            {/* --- LIST VIEW --- */}
            {viewMode === 'list' && (
              <Box sx={{ maxWidth: '1000px', margin: '0 auto' }}>
                <ListRowKey>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">ICON</span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">TOKEN ID</span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">LINKS</span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase">STATUS</span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase text-right">ACTION</span>
                </ListRowKey>
                {sortedHoldings.map((token, index) => (
                  <Grow in timeout={300 + (index * 50)} key={token.tokenId}>
                    <ListRow onClick={() => handleCardClick(token)}>
                      <img src="/Medallions/MKVLI.png" className="w-8 h-8 rounded-full border border-white/20" alt="" />
                      <span className="text-sm font-bold text-white font-mono">#{token.tokenId}</span>
                      <span className="text-xs text-zinc-400 font-mono">{token.dioMarkers.length} Active Instruments</span>
                      <div>
                        <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[10px] border border-emerald-500/20 font-bold uppercase">SECURE</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-amber-500 underline cursor-pointer hover:text-white">VIEW</span>
                      </div>
                    </ListRow>
                  </Grow>
                ))}
              </Box>
            )}

            {/* --- DETAILS VIEW --- */}
            {viewMode === 'details' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                {sortedHoldings.map((token, index) => (
                  <SlideCardWithData key={token.tokenId} token={token} index={index} onClick={() => handleCardClick(token)} />
                ))}
              </Box>
            )}
          </>
        )}
      </ContentWrapper>


      {/* DETAILS MODAL (Shared across views) */}
      {selectedToken && (
        <Modal open={!!selectedToken} onClose={() => setSelectedToken(null)} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Box className="outline-none ultra-glass" sx={{
            width: '90%', maxWidth: '800px', maxHeight: '85vh',
            borderRadius: '24px', overflow: 'hidden',
            display: 'flex', flexDirection: 'column'
          }}>
            <div className="p-6 border-b border-white/10 bg-black/20 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">Token #{selectedToken.tokenId}</h2>
                <p className="text-xs text-zinc-500 font-mono mt-1">Instrument Detail View</p>
              </div>
              <button onClick={() => setSelectedToken(null)} className="text-zinc-500 hover:text-white transition-colors">
                <CloseIcon />
              </button>
            </div>

            <div className="flex-grow overflow-y-auto p-6 custom-scrollbar">
              <div className="text-center py-12 text-zinc-500 font-mono text-xs">
                <Typography sx={{ color: 'rgba(255,255,255,0.3)', mb: 2 }}>DEEP SCAN DETAILS</Typography>
                {/* Here we would render the VRDI details as usual */}
                {(selectedToken.vrdiDetails && selectedToken.vrdiDetails.length > 0) ? (
                  <div className="space-y-4">
                    {selectedToken.vrdiDetails.map((item, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-4 hover:border-amber-500/30 transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="px-2 py-0.5 rounded bg-amber-900/30 text-amber-400 text-[10px] uppercase font-bold border border-amber-500/20">VRDI #{item.id}</span>
                              <span className={`text-[10px] uppercase font-mono ${item.isClosed ? 'text-zinc-500' : 'text-emerald-400'}`}>• {item.statusText}</span>
                            </div>
                            <div className="text-xs text-zinc-400 mt-2">Debtor: <span className="text-zinc-300 font-mono block truncate max-w-[200px]">{item.debtor}</span></div>
                            <div className="flex gap-4 mt-3">
                              <div>
                                <span className="text-[9px] text-zinc-500 uppercase block">Start Date</span>
                                <span className="text-xs text-zinc-300 font-mono">{item.startTimestamp}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-zinc-500 uppercase block">Term</span>
                                <span className="text-xs text-zinc-300 font-mono">{item.amortizationDurationDays}</span>
                              </div>
                              <div>
                                <span className="text-[9px] text-zinc-500 uppercase block">Rate</span>
                                <span className="text-xs text-zinc-300 font-mono">{item.interestRate}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-white font-mono">${Number(item.principalUSDC).toLocaleString()}</div>
                            <div className="text-[10px] text-zinc-500 uppercase">Principal USDC</div>

                            <div className="mt-2 text-sm font-bold text-zinc-300 font-mono">{Number(item.totalRepaymentAmount).toLocaleString()}</div>
                            <div className="text-[10px] text-zinc-500 uppercase">Repayment</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-zinc-500 text-sm">No active instruments attached to this token.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 bg-black/40 border-t border-white/10 flex justify-end">
              <button onClick={() => setSelectedToken(null)} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-mono text-zinc-300">CLOSE</button>
            </div>
          </Box>
        </Modal>
      )}

    </PanelContainer>
  );
};

// --- SUB-COMPONENT FOR DETAILS VIEW ---
const SlideCardWithData = ({ token, index, onClick }: { token: TokenHolding, index: number, onClick: () => void }) => {
  return (
    <Fade in timeout={300 + (index * 50)}>
      <Box onClick={onClick} sx={{
        width: '100%', maxWidth: '800px',
        background: 'linear-gradient(90deg, rgba(20,20,20,0.8) 0%, rgba(0,0,0,0.6) 100%)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '20px',
        padding: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        transition: 'all 0.3s',
        '&:hover': {
          border: '1px solid rgba(245, 158, 11, 0.4)',
          background: 'linear-gradient(90deg, rgba(40,20,10,0.6) 0%, rgba(0,0,0,0.6) 100%)',
          transform: 'scale(1.01)'
        }
      }}>
        <Box sx={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
          <img src="/Medallions/MKVLI.png" className="w-full h-full rounded-full border-2 border-amber-500/20 shadow-lg" alt="" />
        </Box>
        <Box sx={{ flexGrow: 1 }}>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-2xl font-bold text-white font-mono">#{token.tokenId}</h3>
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Master Key</span>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-600 uppercase">Links</span>
              <span className="text-sm text-cyan-400 font-mono">{token.dioMarkers.length}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-600 uppercase">Est. Value</span>
              <span className="text-sm text-zinc-300 font-mono">---</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-zinc-600 uppercase">Status</span>
              <span className="text-sm text-emerald-500 font-mono">Active</span>
            </div>
          </div>
        </Box>
        <div className="flex items-center justify-center p-4 rounded-full bg-white/5">
          <TrendingUpIcon sx={{ color: 'rgba(255,255,255,0.2)' }} />
        </div>
      </Box>
    </Fade>
  );
};

export default Holdings;