'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { ethers } from 'ethers';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import { contract } from './core/TSPABI';
import { prepareContractCall, sendAndConfirmTransaction, createThirdwebClient, readContract, getContract } from 'thirdweb';
import { getBuyWithFiatQuote, getBuyWithFiatStatus } from 'thirdweb/pay';
import EsperanzaC from './Esperanza';
import { base, baseSepolia } from 'thirdweb/chains';
import { getThirdwebClient } from '@/utils/createThirdwebClient';

// Constants
// USDC contract addresses per network
const USDC_ADDRESS_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base mainnet USDC
// Default Sepolia USDC test token (can be overridden via env)
const USDC_ADDRESS_TESTNET = process.env.NEXT_PUBLIC_USDC_ADDRESS_TESTNET || "0x645448d0b014ac67c4d1d0dcf34628e188efb5dc";
const USDC_DECIMALS = 6;
const MAX_USDC_PER_TX = 2500; // Maximum USD per onramp transaction
const USDC_ABI = [
  {
    "type": "function",
    "name": "balanceOf",
    "inputs": [{ "name": "account", "type": "address", "internalType": "address" }],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "allowance",
    "inputs": [
      { "name": "owner", "type": "address", "internalType": "address" },
      { "name": "spender", "type": "address", "internalType": "address" }
    ],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "approve",
    "inputs": [
      { "name": "spender", "type": "address", "internalType": "address" },
      { "name": "amount", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "nonpayable"
  }
] as const;

// Shared thirdweb client for contract reads/writes
const sdkClient = getThirdwebClient();

function Minting({ Batch, tokens, whitelist, referral, batchPrice }: { Batch: number, tokens: number, whitelist: boolean, referral: string, batchPrice: number }) {
  const wallet = useActiveWallet()?.getAccount();
  const address = useActiveAccount()?.address;
  const [modalIsOpen, setModalIsOpen] = useState(false);
  const [step, setStep] = useState<'init' | 'checking_balance' | 'insufficient_balance' | 'onramping' | 'checking_allowance' | 'approving' | 'minting' | 'success' | 'error'>('init');
  const [errorMessage, setErrorMessage] = useState('');
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [tokenContractAddress, setTokenContractAddress] = useState<string | null>(null);
  const [onrampProgress, setOnrampProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const isMounted = useRef(true);
  const [balanceChecked, setBalanceChecked] = useState(false);

  // Detect network mode (stored in localStorage by the switch)
  const isTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';

  // Select chain and USDC address based on network
  const activeChain = isTestnet ? baseSepolia : base;
  const USDC_ADDRESS = isTestnet ? USDC_ADDRESS_TESTNET : USDC_ADDRESS_MAINNET;

  // Memoised USDC contract for the active chain
  const usdcContract = useMemo(() => getContract({
    client: sdkClient,
    address: USDC_ADDRESS,
    chain: activeChain,
    abi: USDC_ABI,
  }), [USDC_ADDRESS, activeChain]);

  const payClient = createThirdwebClient({ clientId: "ab6db417866cf9cebd35c31f790e9806" });

  useEffect(() => {
    isMounted.current = true;
    if (modalIsOpen && step === 'init') {
      startTransactionProcess();
    }
    return () => {
      isMounted.current = false;
    };
  }, [modalIsOpen]);

  const makeAPICall = async (url: string, requestBody: { referralCode: any; customerWallet: string; tokenAmount: string; status: string }) => {
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

  const pollStatus = async (intentId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const checkStatus = async () => {
        if (!isMounted.current) {
          reject(new Error("Modal closed"));
          return;
        }
        const fiatStatus = await getBuyWithFiatStatus({ client: payClient, intentId });
        if (fiatStatus.status === "ON_RAMP_TRANSFER_COMPLETED") {
          resolve();
        } else if (fiatStatus.status === "PAYMENT_FAILED" || fiatStatus.status === "ON_RAMP_TRANSFER_FAILED") {
          reject(new Error(`Onramp failed with status: ${fiatStatus.status}`));
        } else {
          setTimeout(checkStatus, 5000);
        }
      };
      checkStatus();
    });
  };

  const startTransactionProcess = async () => {
    if (!address || !wallet) {
      setErrorMessage("Please connect your wallet");
      setStep('error');
      return;
    }

    // const confirmedURL = 'https://mint.thelochnessbotanicalsociety.com/referralPostback.php';
    // if (referral) {
    //   await makeAPICall(confirmedURL, {
    //     referralCode: referral,
    //     customerWallet: address,
    //     tokenAmount: tokens.toString(),
    //     status: "0"
    //   });
    // }

    setStep('checking_balance');
    try {
      const totalUSDC = BigInt(batchPrice) * BigInt(tokens);
      const balance = await readContract({
        contract: usdcContract,
        method: "balanceOf",
        params: [address],
      });

      setBalanceChecked(true);
      setStep('checking_balance');

      if (BigInt(balance) < totalUSDC) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setStep('insufficient_balance');
        const usdcToOnramp = totalUSDC - BigInt(balance);
        const usdToOnramp = Number(usdcToOnramp) / 10 ** USDC_DECIMALS;
        const numTransactions = Math.ceil(usdToOnramp / MAX_USDC_PER_TX);
        setOnrampProgress({ current: 0, total: numTransactions });

        for (let i = 0; i < numTransactions; i++) {
          const chunkUSD = Math.min(MAX_USDC_PER_TX, usdToOnramp - (i * MAX_USDC_PER_TX));
          const chunkUSDC = BigInt(Math.round(chunkUSD * 10 ** USDC_DECIMALS));
          const quote = await getBuyWithFiatQuote({
            client: payClient,
            fromCurrencySymbol: "USD",
            toChainId: activeChain.id,
            toAmount: ethers.formatUnits(chunkUSDC, USDC_DECIMALS),
            toTokenAddress: USDC_ADDRESS,
            toAddress: address,
            fromAddress: address,
          });
          if (!quote || !quote.onRampLink) {
            console.warn("Fiat on-ramp unavailable for this network.");
            setErrorMessage("Buying USDC with a credit card isn't supported on this network yet. Please fund your wallet manually.");
            setStep('error');
            return;
          }
          window.open(quote.onRampLink, "_blank");
          setStep('onramping');
          await pollStatus(quote.intentId);
          setOnrampProgress(prev => ({ ...prev, current: prev.current + 1 }));
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
        setStep('checking_allowance');
      }

      const allowance = await readContract({
        contract: usdcContract,
        method: "allowance",
        params: [address, contract.address],
      });
      if (BigInt(allowance) < totalUSDC) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setStep('approving');
        await handleApproval(totalUSDC);
      }

      await new Promise(resolve => setTimeout(resolve, 500));
      setStep('minting');
      await handleMinting();
      setStep('success');
    } catch (error: any) {
      if (isMounted.current) {
        setErrorMessage(error.message || "An error occurred");
        setStep('error');
      }
    }
  };

  const handleApproval = async (amount: bigint) => {
    try {
      const transaction = prepareContractCall({
        contract: usdcContract,
        method: "approve",
        params: [contract.address, amount],
      });
      const receipt = await sendAndConfirmTransaction({ transaction, account: wallet! });
      if (receipt) setStep('minting');
    } catch (error: any) {
      throw new Error("Approval failed: " + (error.message || "Unknown error"));
    }
  };

  const handleMinting = async () => {
    const params: [string, bigint] = [address!, BigInt(tokens)];
    const confirmedURL = 'https://mint.thelochnessbotanicalsociety.com/referralPostback.php';
    try {
      const transaction = prepareContractCall({ contract, method: "mint", params });
      const receipt = await sendAndConfirmTransaction({ transaction, account: wallet! });
      if (receipt && receipt.transactionHash) {
        setTransactionHash(receipt.transactionHash);
        setTokenContractAddress(receipt.to);
        if (referral) {
          await makeAPICall(confirmedURL, {
            referralCode: referral,
            customerWallet: address!,
            tokenAmount: tokens.toString(),
            status: "1"
          });
        }
      }
    } catch (error: any) {
      throw new Error("Minting failed: " + (error.message || "Unknown error"));
    }
  };

  const transactionSteps = [
    { name: 'Check Balance', step: 'checking_balance' },
    { name: 'Onramp Funds', step: 'onramping' },
    { name: 'Check Allowance', step: 'checking_allowance' },
    { name: 'Approve', step: 'approving' },
    { name: 'Mint NFT', step: 'minting' },
    { name: 'Complete', step: 'success' },
  ];

  const renderProgressIndicator = () => {
    const currentIndex = transactionSteps.findIndex(s => s.step === step);
    const totalSteps = transactionSteps.length;

    const completedWidth = currentIndex > 0 ? (currentIndex / (totalSteps - 1)) * 100 : 0;
    const currentStepSegmentWidth = (1 / (totalSteps - 1)) * 100;
    const isBalanceChecked = step === 'checking_balance' && balanceChecked;

    return (
      <div className="w-full mb-6 relative">
        <div className="absolute left-0 w-full h-2 bg-gray-600 z-0" style={{ top: '14px' }} />
        <div
          className="absolute left-0 h-2 transition-all duration-500 ease-in-out z-1"
          style={{ width: `${completedWidth}%`, backgroundColor: '#FF1493', top: '14px' }}
        />
        {currentIndex >= 0 && currentIndex < totalSteps - 1 && (
          <div
            className="absolute h-2 transition-all duration-500 ease-in-out z-2"
            style={{
              left: `${(currentIndex / (totalSteps - 1)) * 100}%`,
              width: `${currentStepSegmentWidth}%`,
              backgroundColor: '#00B7EB',
              top: '14px',
            }}
          />
        )}
        <div className="flex justify-between">
          {transactionSteps.map((s, index) => {
            const isActive = step === s.step;
            const isCompleted = index < currentIndex || (index === 0 && isBalanceChecked) || step === 'success';
            return (
              <div key={index} className="flex flex-col items-center min-w-[80px] z-10">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${isActive ? 'bg-[#00B7EB] text-white shadow-lg scale-110' : isCompleted ? 'bg-[#FF1493] text-white' : 'bg-gray-500 text-gray-200'
                    }`}
                >
                  {isCompleted && step !== 'error' ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <p className={`text-xs mt-2 text-center ${isActive ? 'text-[#00B7EB] font-semibold' : isCompleted ? 'text-[#FF1493]' : 'text-gray-300'}`}>
                  {s.name}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderModalContent = () => {
    switch (step) {
      case 'init':
        return <p className="text-gray-100 text-lg">Starting transaction...</p>;
      case 'checking_balance':
        return <p className="text-gray-100 text-lg">Checking your USDC balance...</p>;
      case 'insufficient_balance':
        return <p className="text-gray-100 text-lg">Insufficient USDC balance. Preparing onramp...</p>;
      case 'onramping':
        return (
          <div className="text-center">
            <p className="text-gray-100 text-md">Please complete the payment in the opened tab.</p>
            <p className="text-gray-300 text-sm">Waiting for confirmation... Payment {onrampProgress.current} of {onrampProgress.total}</p>
          </div>
        );
      case 'checking_allowance':
        return <p className="text-gray-100 text-lg">Checking USDC allowance...</p>;
      case 'approving':
        return (
          <div className="text-center">
            <p className="text-gray-100 text-lg">Approve USDC spending</p>
            <p className="text-gray-300 text-sm">Please confirm the approval transaction in your wallet.</p>
          </div>
        );
      case 'minting':
        return (
          <div className="text-center">
            <p className="text-gray-100 text-lg">Minting your NFT</p>
            <p className="text-gray-300 text-sm">Please confirm the mint transaction in your wallet.</p>
          </div>
        );
      case 'success':
        return (
          <div className="flex flex-col items-center space-y-4">
            <h2 className="text-gray-100 text-2xl font-bold">Transaction Complete</h2>
            <p className="text-gray-100 text-lg">Congratulations on minting an NFT by</p>
            <img src="/tln.png" alt="The Loch Ness Botanical Society Logo" className="w-64 h-auto" />
            {transactionHash && (
              <div className="flex space-x-4">
                <a href={`https://basescan.org/tx/${transactionHash}`} target="_blank" rel="noopener noreferrer" className="bg-[#FF1493] text-white px-4 py-2 rounded">
                  View on BaseScan
                </a>
                <a href={`https://digibazaar.io/base/collection/${tokenContractAddress}`} target="_blank" rel="noopener noreferrer" className="bg-[#FF1493] text-white px-4 py-2 rounded">
                  View on DigiBazaar
                </a>
              </div>
            )}
            <EsperanzaC />
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center space-y-4">
            <h2 className="text-gray-100 text-2xl font-bold">Transaction Failed</h2>
            <p className="text-gray-100 text-lg">{errorMessage}</p>
            <button onClick={() => setModalIsOpen(false)} className="bg-orange-700 text-white px-4 py-2 rounded">
              Close
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center p-0 sm:p-1">
      <button
        className="transaction-button"
        onClick={() => setModalIsOpen(true)}
        disabled={modalIsOpen}
        style={{
          boxShadow: '0 0 10px #666666',
          minWidth: 'auto',
          padding: '0rem 1rem',
          height: '30px',
          color: 'white',
          opacity: '1',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        Mint Now
      </button>

      {modalIsOpen && (
        <div
          className="absolute inset-0 flex items-center justify-center z-10"
          style={{
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            minHeight: '100%', // Ensure it spans the full height of the parent
          }}
        >
          <div className="relative rounded-lg shadow-xl w-full max-w-md mx-auto p-6 bg-emerald-500 bg-opacity-30 flex flex-col items-center justify-center">
            {step !== 'success' && !showConfirmClose && (
              <button
                onClick={() => setShowConfirmClose(true)}
                className="absolute top-0 right-0 m-2 bg-emerald-500 text-white rounded-full p-1"
                style={{ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            {step !== 'error' && renderProgressIndicator()}
            {renderModalContent()}
            {showConfirmClose && (
              <div className="absolute inset-0 flex items-center justify-center z-50 bg-black bg-opacity-70">
                <div className="bg-emerald-500 bg-opacity-70 p-4 rounded-lg text-white">
                  <p>Are you sure you want to cancel the transaction?</p>
                  <div className="flex justify-end space-x-2 mt-4">
                    <button onClick={() => setShowConfirmClose(false)} className="bg-blue-600 px-4 py-2 rounded">
                      No
                    </button>
                    <button
                      onClick={() => {
                        isMounted.current = false;
                        setModalIsOpen(false);
                        setShowConfirmClose(false);
                        setStep('init');
                        setErrorMessage('');
                        setOnrampProgress({ current: 0, total: 0 });
                      }}
                      className="bg-red-500 text-white px-4 py-2 rounded"
                    >
                      Yes
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Minting;