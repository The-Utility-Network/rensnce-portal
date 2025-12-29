// // @ts-nocheck
// 'use client'
// import { useState, useEffect } from 'react';
// import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
// import { contract } from './core/TSPABI';
// import { prepareContractCall, sendAndConfirmTransaction, createThirdwebClient } from 'thirdweb';
// import { getBuyWithFiatQuote, getBuyWithFiatStatus } from "thirdweb/pay";
// import EsperanzaC from './Esperanza';
// import { base } from "thirdweb/chains";

// // USDC contract address on Base
// const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// const DECIMALS = 6; // USDC has 6 decimals
// const MAX_USDC_PER_TX = 2500; // Maximum USDC per onramp transaction (in USD)

// function FiatMinting({ Batch, tokens, whitelist, referral, batchPrice }: { Batch: number, tokens: number, whitelist: boolean, referral: string, batchPrice: number }) {
//   const [isWLActive, setIsWLActive] = useState(false);
//   const [isActive, setIsActive] = useState(false);
//   const wallet = useActiveWallet()?.getAccount();
//   const address = useActiveAccount()?.address;
//   const [errorModalIsOpen, setErrorModalIsOpen] = useState(false);
//   const [modalIsOpen, setModalIsOpen] = useState(false);
//   const [buttonState, setButtonState] = useState('default');
//   const [errorMessage, setErrorMessage] = useState('');
//   const [transactionHash, setTransactionHash] = useState<string | null>(null);
//   const [tokenContractAddress, setTokenContractAddress] = useState<string | null>(null);

//   const client = createThirdwebClient({ clientId: "ab6db417866cf9cebd35c31f790e9806" });

//   useEffect(() => {
//     console.log('Batch Price (USD):', batchPrice);
//   }, [batchPrice]);

//   const makeAPICall = async (url: string | URL | Request, requestBody: {
//     referralCode: any;
//     customerWallet: string;
//     tokenAmount: string;
//     status: string;
//   }) => {
//     try {
//       const response = await fetch(url, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify(requestBody),
//       });
//       const result = await response.json();
//     } catch (error) {
//       console.error('Error making API call:', error);
//     }
//   };

//   const pollStatus = async (intentId: string): Promise<void> => {
//     return new Promise((resolve, reject) => {
//       const checkStatus = async () => {
//         const fiatStatus = await getBuyWithFiatStatus({ client, intentId });
//         if (fiatStatus.status === "ON_RAMP_TRANSFER_COMPLETED") {
//           resolve();
//         } else if (fiatStatus.status === "PAYMENT_FAILED" || fiatStatus.status === "NONE") {
//           reject(new Error(`Onramp failed with status: ${fiatStatus.status}`));
//         } else {
//           setTimeout(checkStatus, 5000); // Poll every 5 seconds
//         }
//       };
//       checkStatus();
//     });
//   };

//   const handleTransaction = async () => {
//     if (!address || !wallet) {
//       console.error("Wallet or address is undefined");
//       setErrorMessage("Please connect your wallet");
//       setErrorModalIsOpen(true);
//       return;
//     }

//     // Total cost in USD and USDC smallest units
//     const totalUSD = batchPrice * tokens;
//     const totalUSDC = BigInt(totalUSD) * BigInt(10 ** DECIMALS);
//     console.log('Total USD:', totalUSD, 'Total USDC (smallest units):', totalUSDC.toString());

//     const params: [string, bigint] = [address, BigInt(tokens)];
//     const confirmedURL = 'https://mint.thelochnessbotanicalsociety.com/referralPostback.php';

//     if (referral) {
//       await makeAPICall(confirmedURL, {
//         referralCode: referral,
//         customerWallet: address,
//         tokenAmount: tokens.toString(),
//         status: "0"
//       });
//     }

//     try {
//       setButtonState('submitting');

//       // Break total USD into chunks
//       const numTransactions = Math.ceil(totalUSD / MAX_USDC_PER_TX);
//       const usdChunks = Array(numTransactions).fill(MAX_USDC_PER_TX);
//       const remainder = totalUSD % MAX_USDC_PER_TX;
//       if (remainder > 0) {
//         usdChunks[numTransactions - 1] = remainder; // Adjust the last chunk
//       }

//       console.log('Number of transactions:', numTransactions, 'USD chunks:', usdChunks);

//       // Process each chunk sequentially
//       for (let i = 0; i < numTransactions; i++) {
//         const chunkUSD = usdChunks[i];
//         console.log(`Processing chunk ${i + 1}/${numTransactions}: ${chunkUSD} USD`);

//         const quote = await getBuyWithFiatQuote({
//           client,
//           fromCurrencySymbol: "USD",
//           toChainId: base.id, // Use Base chain ID
//           toAmount: chunkUSD.toString(), // Amount in USD for this chunk
//           toTokenAddress: USDC_ADDRESS,
//           toAddress: address,
//           fromAddress: address,
//         });

//         if (!quote) {
//           throw new Error(`Unable to fetch fiat quote for chunk ${i + 1}`);
//         }

//         // Open the onramp link in a new tab
//         window.open(quote.onRampLink, "_blank");

//         // Wait for the onramp to complete
//         await pollStatus(quote.intentId);
//         console.log(`Chunk ${i + 1}/${numTransactions} completed`);
//       }

//       // All USDC acquired, now mint
//       const transaction = prepareContractCall({
//         contract,
//         method: "mint",
//         params: params,
//       });

//       const receipt = await sendAndConfirmTransaction({
//         transaction,
//         account: wallet,
//       });

//       if (receipt && receipt.transactionHash) {
//         setTransactionHash(receipt.transactionHash);
//         setTokenContractAddress(receipt.to);
//       }

//       if (referral) {
//         await makeAPICall(confirmedURL, {
//           referralCode: referral,
//           customerWallet: address,
//           tokenAmount: tokens.toString(),
//           status: "1"
//         });
//       }
//       setModalIsOpen(true);
//       setButtonState('confirmed');

//     } catch (error: any) {
//       setButtonState('default');
//       let mainErrorMessage = 'An unknown error occurred';
//       if (error?.message) {
//         const lines = error.message.split('\n');
//         mainErrorMessage = lines[0].split('Error - ')[1] || lines[0];
//         if (error.code === 3) {
//           mainErrorMessage = 'Insufficient USDC balance';
//         }
//       }
//       setErrorMessage(mainErrorMessage);
//       setErrorModalIsOpen(true);
//     }
//   };

//   return (
//     <div className="flex flex-col items-center justify-center p-0 sm:p-1">
//       <button
//         className={`transaction-button ${buttonState}`}
//         onClick={handleTransaction}
//         disabled={buttonState !== 'default'}
//         style={{
//           boxShadow: '0 0 10px #666666',
//           minWidth: '150px',
//           padding: '0rem 1rem',
//           height: '30px',
//           color: 'white',
//           marginTop: '0px',
//           opacity: '1',
//           backdropFilter: 'blur(10px)',
//           WebkitBackdropFilter: 'blur(10px)',
//         }}
//       >
//         {buttonState === 'submitting' ? 'Submitting...' : 'Pay (Credit/Debit)'}
//       </button>
//       {modalIsOpen && (
//         <div
//           className="fixed z-10 inset-0 rounded-lg overflow-hidden flex items-center justify-center"
//           style={{
//             backdropFilter: 'blur(10px)',
//             WebkitBackdropFilter: 'blur(10px)',
//             backgroundColor: 'rgba(255, 255, 255, 0.001)',
//           }}
//         >
//           <div
//             className="relative rounded-lg shadow-xl w-full h-full md:max-w-md mx-auto flex flex-col items-center justify-center bg-emerald-500 bg-opacity-30"
//           >
//             <div className="relative w-full">
//               <video autoPlay muted loop className="w-full rounded-t-lg h-auto">
//                 <source src="/minted.mp4" type="video/mp4" />
//                 Your browser does not support the video tag.
//               </video>
//               <button
//                 onClick={() => setModalIsOpen(false)}
//                 className="absolute top-0 right-0 m-4 bg-emerald-500 text-white rounded-full p-2"
//                 style={{ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
//               >
//                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6">
//                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
//                 </svg>
//               </button>
//             </div>
//             <div className="flex flex-col items-center justify-center space-y-4 p-6">
//               <h2 className="text-center text-gray-100 text-2xl font-bold">Transaction Complete</h2>
//               <div className="flex flex-col space-y-4 items-center">
//                 <p className="text-center text-gray-100 text-lg">
//                   Congratulations on minting an NFT by
//                 </p>
//                 <img src="/tln.png" alt="The Loch Ness Botanical Society Logo" className="w-32 h-auto mx-auto block" />
//               </div>
//               {transactionHash && (
//                 <div className="flex space-x-4 overflow-hidden p-2">
//                   <a
//                     href={`https://digibazaar.io/base/collection/${tokenContractAddress}`}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     className="inline-flex items-center justify-center w-32 h-12 text-xs font-medium leading-6 text-center text-white uppercase transition bg-emerald-500 rounded shadow ripple hover:shadow-lg hover:bg-emerald-600 focus:outline-none"
//                     style={{
//                       backdropFilter: 'blur(10px)',
//                       WebkitBackdropFilter: 'blur(10px)',
//                       backgroundColor: 'rgba(255, 255, 255, 0.8)',
//                     }}
//                   >
//                     <img src="/etherscan.svg" alt="BaseScan" className="w-auto h-7 p-1" />
//                   </a>
//                   <a
//                     href={`https://basescan.org/tx/${transactionHash}`}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     className="inline-flex items-center justify-center w-32 h-12 text-xs font-medium leading-6 text-center text-white uppercase transition bg-emerald-500 rounded shadow ripple hover:shadow-lg hover:bg-emerald-600 focus:outline-none"
//                     style={{
//                       backdropFilter: 'blur(10px)',
//                       WebkitBackdropFilter: 'blur(10px)',
//                       backgroundColor: 'rgba(255, 255, 255, 0.8)',
//                     }}
//                   >
//                     <img src="/dbw.png" alt="DigiBazaar" className="w-auto h-9 p-1" />
//                   </a>
//                 </div>
//               )}
//               <EsperanzaC />
//             </div>
//             <div className="absolute w-full overflow-hidden">
//               <div className="absolute top-0 right-0 bg-emerald-500 text-white px-3 py-1 rounded-l-md flex items-center w-full sm:px-6 sm:py-2" style={{ backgroundColor: 'rgba(0, 255, 0, 0.5)' }}>
//                 <div className="flex justify-between items-center w-full">
//                   <div className="whitespace-nowrap overflow-hidden w-3/4" style={{ animation: 'marquee 10s linear infinite' }}>
//                     <span className="block inline-block pb-2">Speak to Esperanza to begin your journey!</span>
//                   </div>
//                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6 sm:w-8 sm:h-8">
//                     <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
//                   </svg>
//                 </div>
//               </div>
//             </div>
//             <style jsx>{`
//               @keyframes marquee {
//                 0% { transform: translateX(0); }
//                 100% { transform: translateX(-100%); }
//               }
//             `}</style>
//           </div>
//         </div>
//       )}
//       {errorModalIsOpen && (
//         <div
//           className="fixed z-10 inset-0 rounded-lg overflow-y-auto flex items-center justify-center"
//           style={{
//             backdropFilter: 'blur(10px)',
//             WebkitBackdropFilter: 'blur(10px)',
//             backgroundColor: 'rgba(255, 255, 255, 0.1)',
//           }}
//         >
//           <div
//             className="relative rounded-lg shadow-xl w-4/5 md:max-w-md mx-auto p-6 flex flex-col items-center justify-center bg-orange-500 bg-opacity-30 backdrop-filter backdrop-blur-lg"
//           >
//             <div className="h-12 w-12 flex items-center justify-center">
//               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" className="w-6 h-6">
//                 <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
//               </svg>
//             </div>
//             <h2 className="text-center text-gray-100 text-2xl font-bold">Please Try Again</h2>
//             <p className="text-center text-gray-100 text-lg">
//               {errorMessage}
//             </p>
//             <button
//               onClick={() => setErrorModalIsOpen(false)}
//               className="block w-full py-2 rounded-md bg-orange-700 text-white cursor-pointer mt-4"
//             >
//               Close
//             </button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// export default FiatMinting;