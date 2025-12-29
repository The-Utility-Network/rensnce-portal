import React, { useState, useEffect } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Button,
  Box,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import {
  getContract,
  readContract,
  prepareContractCall,
  sendAndConfirmTransaction,
} from 'thirdweb';
import { useActiveWallet } from 'thirdweb/react';
import { base } from 'thirdweb/chains';
import { diamondAddress } from './core/Diamond';
import { getThirdwebClient } from '../src/utils/createThirdwebClient';

// Initialize the client
const client = getThirdwebClient();

// Contract address
const contractAddress = diamondAddress;

// Contract ABI (unchanged)
const abi: any = [
  { "inputs": [], "name": "EnumerableSet__IndexOutOfBounds", "type": "error" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "user", "type": "address" }, { "indexed": false, "internalType": "string", "name": "name", "type": "string" }, { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }], "name": "PrinciplesAccepted", "type": "event" },
  { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "user", "type": "address" }, { "indexed": false, "internalType": "string", "name": "oldName", "type": "string" }, { "indexed": false, "internalType": "string", "name": "newName", "type": "string" }], "name": "SignerNameUpdated", "type": "event" },
  { "inputs": [{ "internalType": "string", "name": "name", "type": "string" }], "name": "acceptPrinciples", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "getAcceptanceSignature", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "pure", "type": "function" },
  { "inputs": [], "name": "getAllPrinciples", "outputs": [{ "components": [{ "internalType": "string", "name": "japaneseName", "type": "string" }, { "internalType": "string", "name": "englishName", "type": "string" }, { "internalType": "string", "name": "description", "type": "string" }], "internalType": "struct TUCOperatingPrinciples.Principle[]", "name": "", "type": "tuple[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getAllSigners", "outputs": [{ "internalType": "address[]", "name": "", "type": "address[]" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "uint256", "name": "index", "type": "uint256" }], "name": "getPrinciple", "outputs": [{ "internalType": "string", "name": "", "type": "string" }, { "internalType": "string", "name": "", "type": "string" }, { "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getPrincipleCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "getSignerCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "signer", "type": "address" }], "name": "getSignerDetails", "outputs": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "uint256", "name": "timestamp", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "user", "type": "address" }], "name": "hasPrinciplesAccepted", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "initializePrinciples", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "isPrinciplesInitialized", "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "signer", "type": "address" }, { "internalType": "string", "name": "newName", "type": "string" }], "name": "updateSignerName", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
];

// Japanese Synthwave Palette
const synthwavePalette = {
  backgroundGradient: 'linear-gradient(135deg, #2a0b3d 0%, #ff4f7e 50%, #ffb86c 100%)',
  neonPink: '#ff4f7e',
  neonPurple: '#d400ff',
  softTeal: '#00c4cc',
  textGlow: '#f5f5f5',
  darkZen: '#1a0b2e',
};

// Styled Components
const Container = styled(Box)(({ theme }) => ({
  background: synthwavePalette.backgroundGradient,
  minHeight: '100vh',
  padding: theme.spacing(2),
  color: synthwavePalette.textGlow,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  position: 'relative',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(circle, rgba(255, 79, 126, 0.2) 0%, rgba(42, 11, 61, 0.9) 70%)',
    zIndex: 0,
  },
  [theme.breakpoints.up('sm')]: {
    overflowY: 'visible', // No scrolling on desktop
  },
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(1),
    overflowY: 'auto', // Scrollable on mobile
    height: '100vh', // Ensure it takes full viewport height
  },
}));

const StyledAccordion = styled(Accordion)(({ theme, expanded }: { theme: any, expanded?: boolean }) => ({
  background: 'rgba(255, 255, 255, 0.05)',
  border: `1px solid ${synthwavePalette.neonPurple}`,
  borderRadius: '12px',
  marginBottom: theme.spacing(2),
  color: synthwavePalette.textGlow,
  boxShadow: expanded ? `0 0 20px ${synthwavePalette.neonPink}` : '0 4px 12px rgba(0, 0, 0, 0.2)',
  backdropFilter: 'blur(8px)',
  transition: 'all 0.3s ease',
  '&::before': { display: 'none' },
  zIndex: 1,
  [theme.breakpoints.down('sm')]: {
    marginBottom: theme.spacing(1),
  },
}));

const StyledAccordionSummary = styled(AccordionSummary)(({ theme }) => ({
  background: 'rgba(26, 11, 46, 0.7)',
  borderRadius: '12px 12px 0 0',
  '& .MuiAccordionSummary-content': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  '& .MuiAccordionSummary-expandIconWrapper': {
    color: synthwavePalette.neonPink,
  },
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(1),
  },
}));

const StyledAccordionDetails = styled(AccordionDetails)(({ theme }) => ({
  background: 'rgba(26, 11, 46, 0.9)',
  borderRadius: '0 0 12px 12px',
  padding: theme.spacing(2),
  fontFamily: "'Noto Sans JP', sans-serif",
  lineHeight: 1.6,
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(1),
  },
}));

const StyledButton = styled(Button)(({ theme }) => ({
  background: synthwavePalette.neonPink,
  color: synthwavePalette.textGlow,
  borderRadius: '24px',
  padding: theme.spacing(1, 3),
  fontSize: '1rem',
  fontWeight: 'bold',
  textTransform: 'uppercase',
  boxShadow: `0 0 10px ${synthwavePalette.neonPink}`,
  '&:hover': {
    background: synthwavePalette.softTeal,
    boxShadow: `0 0 15px ${synthwavePalette.softTeal}`,
  },
  transition: 'all 0.3s ease',
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(0.75, 2),
    fontSize: '0.9rem',
  },
}));

const CustomInput = styled('input')(({ theme }) => ({
  background: 'rgba(255, 255, 255, 0.1)',
  border: `1px solid ${synthwavePalette.neonPurple}`,
  borderRadius: '8px',
  padding: theme.spacing(1.5, 2),
  width: '100%',
  maxWidth: '400px',
  color: synthwavePalette.textGlow,
  fontSize: '1rem',
  fontFamily: "'Noto Sans JP', sans-serif'",
  outline: 'none',
  transition: 'all 0.3s ease',
  '&:focus': {
    borderColor: synthwavePalette.neonPink,
    boxShadow: `0 0 10px ${synthwavePalette.neonPink}`,
  },
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(1, 1.5),
    fontSize: '0.9rem',
    maxWidth: '100%',
  },
}));

const StyledTypography = styled(Typography)(({ theme }) => ({
  color: synthwavePalette.textGlow,
  textShadow: `0 0 5px ${synthwavePalette.neonPurple}`,
  fontFamily: "'Noto Sans JP', sans-serif'",
  zIndex: 1,
  [theme.breakpoints.down('sm')]: {
    fontSize: '1.2rem',
  },
}));

const AcceptanceBox = styled(Box)(({ theme }) => ({
  background: 'rgba(26, 11, 46, 0.85)',
  borderRadius: '16px',
  padding: theme.spacing(3),
  maxWidth: '600px',
  width: '100%',
  textAlign: 'center',
  border: `2px solid ${synthwavePalette.neonPurple}`,
  boxShadow: `0 0 20px ${synthwavePalette.neonPurple}`,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: theme.spacing(2),
  [theme.breakpoints.down('sm')]: {
    padding: theme.spacing(2),
    marginTop: theme.spacing(2),
    maxWidth: '100%',
  },
}));

const OperatingPrinciples = () => {
  const [principles, setPrinciples] = useState<any[]>([]);
  const [signerCount, setSignerCount] = useState<number>(0);
  const [hasAccepted, setHasAccepted] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedIndex, setExpandedIndex] = useState<number | false>(false);

  const wallet = useActiveWallet()?.getAccount() as any;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    const fetchData = async () => {
      await Promise.all([
        fetchPrinciples(),
        fetchSignerCount(),
        wallet ? checkIfUserHasAccepted() : Promise.resolve(),
      ]);
      setLoading(false);
    };
    fetchData();
  }, [wallet]);

  const fetchPrinciples = async () => {
    try {
      const contract = getContract({ client, chain: base, address: contractAddress, abi });
      const result = await readContract({ contract, method: 'getAllPrinciples', params: [] });
      setPrinciples(result);
    } catch (error) {
      console.error('Error fetching principles:', error);
    }
  };

  const fetchSignerCount = async () => {
    try {
      const contract = getContract({ client, chain: base, address: contractAddress, abi });
      const count = await readContract({ contract, method: 'getSignerCount', params: [] });
      setSignerCount(Number(count));
    } catch (error) {
      console.error('Error fetching signer count:', error);
    }
  };

  const checkIfUserHasAccepted = async () => {
    try {
      const contract = getContract({ client, chain: base, address: contractAddress, abi });
      const accepted = await readContract({ contract, method: 'hasPrinciplesAccepted', params: [wallet.address] });
      setHasAccepted(accepted);
    } catch (error) {
      console.error('Error checking acceptance:', error);
    }
  };

  const handleAcceptPrinciples = async () => {
    if (!userName.trim()) {
      alert('Please enter your name before signing.');
      return;
    }
    try {
      const contract = getContract({ client, chain: base, address: contractAddress, abi });
      const transaction = await prepareContractCall({
        contract,
        method: 'acceptPrinciples',
        params: [userName.trim()],
        value: BigInt(0),
      });
      await sendAndConfirmTransaction({ transaction, account: wallet! });
      setHasAccepted(true);
      await fetchSignerCount();
    } catch (error) {
      console.error('Error accepting principles:', error);
    }
  };

  const handleAccordionChange = (index: number) => (event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedIndex(isExpanded ? index : false);
  };

  if (loading) {
    return (
      <Container>
        <StyledTypography variant="h6">Initializing Zen Principles...</StyledTypography>
      </Container>
    );
  }

  return (
    <Container>
      <StyledTypography variant={isMobile ? 'h5' : 'h3'} gutterBottom align="center">
        運営原則 - Operating Principles
      </StyledTypography>
      <StyledTypography variant="subtitle1" gutterBottom align="center">
        署名者数: {signerCount}
      </StyledTypography>

      <Box sx={{ width: '100%', maxWidth: isMobile ? '100%' : '900px', mt: 2 }}>
        {principles.map((principle, index) => (
          <StyledAccordion
            key={index}
            expanded={expandedIndex === index}
            onChange={handleAccordionChange(index)}
          >
            <StyledAccordionSummary expandIcon={<ExpandMoreIcon />}>
              <StyledTypography variant="h6">
                {principle.japaneseName} - {principle.englishName}
              </StyledTypography>
            </StyledAccordionSummary>
            <StyledAccordionDetails>
              <StyledTypography variant="body1">
                {principle.description}
              </StyledTypography>
            </StyledAccordionDetails>
          </StyledAccordion>
        ))}
      </Box>

      <AcceptanceBox mt={isMobile ? 2 : 6}>
        {!hasAccepted ? (
          <>
            <StyledTypography variant={isMobile ? 'h6' : 'h4'} gutterBottom>
              禅の誓い - The Oath of Zen
            </StyledTypography>
            <StyledTypography variant="body1" gutterBottom>
              By signing, you commit to embodying and upholding our company’s operating principles. Your dedication ensures excellence, integrity, and a harmonious environment.
            </StyledTypography>
            <StyledTypography variant="body2" gutterBottom sx={{ mt: 1 }}>
              Please enter your name below to signify your acceptance and commitment.
            </StyledTypography>
            <CustomInput
              type="text"
              placeholder="あなたの名前 - Your Name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
            <StyledButton onClick={handleAcceptPrinciples} sx={{ mt: 2 }}>
              署名 - Sign
            </StyledButton>
          </>
        ) : (
          <>
            <StyledTypography variant={isMobile ? 'h6' : 'h4'} gutterBottom sx={{ color: synthwavePalette.softTeal }}>
              ありがとう - Thank You
            </StyledTypography>
            <StyledTypography variant="body1">
              運営原則へのあなたのコミットメントは、当社の基盤を強化し、卓越性と誠実さの文化を育みます。
            </StyledTypography>
          </>
        )}
      </AcceptanceBox>
    </Container>
  );
};

export default OperatingPrinciples;