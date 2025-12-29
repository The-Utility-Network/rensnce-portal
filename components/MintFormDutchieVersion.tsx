// 'use client'
// import Image from 'next/image';
// import { ethers } from 'ethers';
// import axios from 'axios';
// import { useActiveAccount } from "thirdweb/react";
// import { useState, useEffect, ChangeEvent } from "react";
// // import FiatMinting from "./fiatMintButton";
// // import Minting from "./mintButton";
// import { getCurrentSupply, getBatchDetails } from "../primitives/TSPABI";
// import ChevronDownIcon from '@heroicons/react/24/outline/ChevronDownIcon';
// import MinusIcon from '@heroicons/react/24/outline/MinusIcon';
// import PlusIcon from '@heroicons/react/24/outline/PlusIcon';
// import DutchieEmbed from './DutchieEmbed';

// // Initialize tap sound effect
// let tapSoundEffect: HTMLAudioElement;

// // API proxy will be used; no need to store external base URL
// const CONTRACT_ADDRESS = process.env.MINT_CONTRACT; // Your collection's contract address

// export default function Form() {
//   const activeAccount = useActiveAccount();
//   const accountDisplay = activeAccount 
//     ? `${activeAccount.address.slice(0, 4)}...${activeAccount.address.slice(-4)}` 
//     : '';

//   // State variables
//   const [batch, setBatch] = useState<bigint | null>(null);
//   const [tokens, setTokens] = useState<number>(1);
//   const [pricePerToken, setPricePerToken] = useState<number>(0);
//   const [referralCode, setReferralCode] = useState<string>('');
//   const [whitelist, setWhitelist] = useState<boolean>(false);
//   const [currentSupply, setCurrentSupply] = useState<number>(0);
//   const [nfts, setNfts] = useState<any[]>([]);
//   const [collectionDetails, setCollectionDetails] = useState<any>(null);
//   const [batches, setBatches] = useState<BatchDetails[]>([]);
//   const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(true);
//   const [isLoadingPrice, setIsLoadingPrice] = useState<boolean>(false);
//   const [error, setError] = useState<string>('');

//   // Initialize tap sound effect once
//   useEffect(() => {
//     tapSoundEffect = new Audio('/static/sounds/tap.mp3');
//   }, []);

//   // Fetch NFTs and collection details
//   useEffect(() => {
//     async function fetchNFTs() {
//       try {
//         const response = await axios.get(`/api/reservoir/tokens/v7`, {
//           params: {
//             collection: CONTRACT_ADDRESS,
//             limit: 6, // Fetch 6 NFTs
//           },
//         });

//         const nftData = response.data.tokens;
//         setNfts(nftData);

//         // Fetch collection data like floor price, holders, collection size
//         const collectionResponse = await axios.get(`/api/reservoir/collections/v7`, {
//           params: {
//             id: CONTRACT_ADDRESS,
//           },
//         });

//         setCollectionDetails(collectionResponse.data.collections[0]);
//       } catch (error) {
//         console.error('Error fetching NFTs or collection data:', error);
//         setError('Failed to load NFTs or collection details.');
//       }
//     }

//     fetchNFTs();
//   }, []);

//   // Define BatchDetails interface
//   interface BatchDetails {
//     id: number;
//     maxSupply: number;
//     currentSupply: number;
//     price: number;
//     isActive: boolean;
//   }

//   // Fetch batches
//   useEffect(() => {
//     async function fetchBatches() {
//       try {
//         let i = 1;
//         let batchDetails = await getBatchDetails(BigInt(i));
//         const batchDetailsArray: BatchDetails[] = [];
    
//         while (batchDetails && batchDetails.maxSupply !== 0) {
//           batchDetailsArray.push({
//             id: i,
//             maxSupply: Number(batchDetails.maxSupply),
//             currentSupply: Number(batchDetails.currentSupply),
//             price: Number(batchDetails.price),
//             isActive: batchDetails.isActive,
//           });
//           i++;
//           batchDetails = await getBatchDetails(BigInt(i));
//         }
//         console.log(batchDetailsArray);
//         // Print batch price
//         if (batchDetailsArray.length > 0) {
//           console.log(batchDetailsArray[0].price);
//         }
    
//         setBatches(batchDetailsArray);
    
//         // Find the first active batch and set it as the current batch
//         const firstActiveBatch = batchDetailsArray.find(batch => batch.isActive && batch.currentSupply < batch.maxSupply);
//         if (firstActiveBatch) {
//           setBatch(BigInt(firstActiveBatch.id));
//         }
//       } catch (error) {
//         console.error('Error fetching batches:', error);
//         setError('Failed to load batches.');
//       } finally {
//         setIsLoadingBatches(false);
//       }
//     }
  
//     fetchBatches();
//   }, []);

//   // Fetch current supply
//   useEffect(() => {
//     let isMounted = true;

//     async function fetchCurrentSupply() {
//       try {
//         const supply = await getCurrentSupply();
//         if (typeof supply === 'number' && isMounted) {
//           setCurrentSupply(supply);
//         }
//       } catch (error) {
//         if (isMounted) {
//           console.error("Error getting current supply:", error);
//           setError('Failed to get current supply.');
//         }
//       }
//     }

//     fetchCurrentSupply();

//     return () => { isMounted = false; };
//   }, []);

//   // Fetch price per token based on selected batch
//   useEffect(() => {
//     async function fetchPricePerToken() {
//       if (batch === null) return;

//       setIsLoadingPrice(true);
//       try {
//         const batchDetails = await getBatchDetails(batch);
//         if (batchDetails) {
//           setPricePerToken(Number(batchDetails.price));
//         } else {
//           setPricePerToken(0);
//           console.warn(`No details found for batch ${batch.toString()}`);
//         }
//       } catch (error) {
//         console.error("Error fetching price per token:", error);
//         setError('Failed to fetch price per token.');
//         setPricePerToken(0);
//       } finally {
//         setIsLoadingPrice(false);
//       }
//     }

//     if (batch !== null) {
//       fetchPricePerToken();
//     }
//   }, [batch]);

//   // Handle whitelist checkbox change
//   const handleWhitelistChange = (event: ChangeEvent<HTMLInputElement>) => {
//     tapSoundEffect.play();
//     setWhitelist(event.target.checked);
//   };

//   // Increment number of tokens
//   const incrementTokens = () => {
//     tapSoundEffect.play();
//     setTokens(prevTokens => prevTokens + 1);
//   };

//   // Decrement number of tokens
//   const decrementTokens = () => {
//     tapSoundEffect.play();
//     setTokens(prevTokens => Math.max(1, prevTokens - 1));
//   };

//   // Handle batch selection change
//   function handleBatchChange(event: ChangeEvent<HTMLSelectElement>): void {
//     const selectedBatchId = Number(event.target.value);
//     setBatch(BigInt(selectedBatchId));
//   }

//   // Utility function to handle IPFS URLs and other external URLs
//   const getImageUrl = (url: string): string => {
//     if (!url) return '/fallback-image.png'; // Fallback if URL is empty

//     if (url.startsWith('ipfs://')) {
//       return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
//     }

//     // Handle other protocols or return the URL as is
//     return url;
//   };

//   return (
//     <div
//       className="isolate space-y-4 sm:space-y-2 rounded-2xl shadow-lg bg-emerald-800 bg-opacity-50 p-4 w-full md:w-full lg:w-full mx-auto"
//       style={{
//         position: 'relative',
//         backdropFilter: "blur(12px)",
//         WebkitBackdropFilter: "blur(12px)",
//         maxHeight: "95vh", // Ensures it doesn't take the entire screen height
//         overflowY: "auto", // Makes it scrollable when needed
//       }}
//     >
//       {/* Display Error Message */}
//       {error && (
//         <div className="bg-emerald-500 text-white p-4 rounded mb-4">
//           {error}
//         </div>
//       )}
      
//       <div className="rounded-2xl">
//         <DutchieEmbed/>
//       </div>
//   </div>
//   );
// }


// // {/* Account, Minted Tokens, and Batches Information */}
// // <div className="relative rounded-xl px-3 pb-1.5 pt-2.5 ring-1 ring-inset ring-emerald-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-emerald-600 flex justify-between items-center">
// // {/* Account Information */}
// // <div>
// //   <label htmlFor="account" className="block text-sm font-medium text-emerald-100">
// //     Account
// //   </label>
// //   <div
// //     id="account"
// //     className="block w-full border-0 bg-transparent text-emerald-100 placeholder:text-emerald-400 sm:text-base"
// //   >
// //     {activeAccount ? accountDisplay : "--"}
// //   </div>
// // </div>

// // {/* Minted Tokens Information */}
// // <div className="flex flex-col justify-center items-center">
// //   <label htmlFor="mintedTokens" className="block text-sm font-medium text-emerald-100">
// //     Minted Tokens
// //   </label>
// //   <div
// //     id="mintedTokens"
// //     className="block w-full border-0 bg-transparent text-center text-emerald-100 placeholder:text-emerald-400 sm:text-base"
// //   >
// //     {currentSupply} / 1000
// //   </div>
// // </div>

// // {/* Batches Indicator */}
// // <div>
// //   <label htmlFor="batches" className="block text-sm font-medium text-emerald-100 text-right">
// //     Batches
// //   </label>
// //   <div className="flex space-x-2 py-2 sm:pl-2 md:pl-4">
// //     {batches.map((batchItem) => (
// //       <div
// //         key={batchItem.id}
// //         className="h-2 w-2 rounded-full"
// //         style={{ backgroundColor: batchItem.isActive && batchItem.currentSupply < batchItem.maxSupply ? "#f54029" : "orange" }}
// //         title={`Batch ${batchItem.id} ${batchItem.currentSupply === batchItem.maxSupply ? '(Sold Out)' : batchItem.isActive ? '' : '(Coming Soon)'}`}
// //       ></div>
// //     ))}
// //   </div>
// // </div>
// // </div>

// // {/* NFT Gallery */}
// // <div 
// // className="flex space-x-4 overflow-x-auto py-2"
// // >
// // {nfts.map((nft, index) => (
// //   <a
// //     key={index}
// //     href={`https://digibazaar.io/ethereum/asset/${CONTRACT_ADDRESS}:${nft.token.tokenId}?tab=info`}
// //     target="_blank"
// //     rel="noopener noreferrer"
// //     className="flex-shrink-0 flex flex-col items-center justify-center bg-emerald-900 rounded-xl p-2 shadow-lg transition-transform transform hover:scale-105 w-40 sm:w-48 md:w-56 lg:w-64"
// //   >
// //     {/* Using Next.js Image for optimization */}
// //     <img 
// //       src={getImageUrl(nft.token.image) || '/fallback-image.png'} 
// //       alt={nft.token.name || `NFT ${nft.token.tokenId}`} 
// //       width="160" 
// //       height="160" 
// //       className="w-full h-full object-cover rounded-lg grayscale hover:grayscale-0"
// //       loading="lazy"
// //       onError={(e) => {
// //         // Fallback to a default image if the original fails to load
// //         (e.target as HTMLImageElement).src = '/fallback-image.png';
// //       }}
// //     />
// //     <div 
// //       className="text-emerald-100 mt-2 text-center truncate w-full" 
// //       title={nft.token.name}
// //     >
// //       {nft.token.name}
// //     </div>
// //     <div className="flex justify-between w-full px-2 mt-1">
// //       <span className="text-emerald-100 text-sm flex items-center">
// //         <span className="h-2 w-2 bg-green-500 rounded-full mr-1"></span>Live
// //       </span>
// //       <span className="text-emerald-100 text-sm">ID: {nft.token.tokenId}</span>
// //     </div>
// //   </a>
// // ))}
// // </div>

// // {/* Collection Details */}
// // {collectionDetails && (
// // <div className="flex flex-col justify-between items-center mt-4 px-3 pb-1.5 pt-2.5 ring-1 ring-inset ring-emerald-300 rounded-xl">
// //   <div className="flex justify-between w-full">
// //     <div className="text-emerald-100">
// //       <span>Holders: {collectionDetails.ownerCount}</span>
// //     </div>
// //     <div className="text-emerald-100">
// //       <span>Collection Size: {collectionDetails.supply}</span>
// //     </div>
// //     <div className="text-emerald-100">
// //       <span>
// //         Floor Price: {collectionDetails.floorAsk?.price?.amount?.usd 
// //           ? `$${Number(collectionDetails.floorAsk.price.amount.usd).toFixed(2)}`
// //           : "N/A"}
// //       </span>
// //     </div>
// //   </div>

// //   {/* Button Container (Vertical Stack) */}
// //   <div className="flex flex-col w-full justify-center mt-4 space-y-2">
// //     {/* DigiBazaar Button */}
// //     <a
// //       href={`https://digibazaar.io/ethereum/collection/${CONTRACT_ADDRESS}`}
// //       target="_blank"
// //       rel="noopener noreferrer"
// //       className="hover:bg-emerald-800 text-white py-2 px-6 rounded-full hover:bg-opacity-60 ring-1 ring-inset ring-emerald-300 hover:ring-emerald-100 flex items-center space-x-2 transition-colors duration-200 justify-center min-w-0"
// //     >
// //       <img src="/dbw.png" alt="DigiBazaar Logo" className="h-6" />
// //       <span 
// //         className="text-emerald-100 truncate flex-0" 
// //         title={`Shop the Collection: ${collectionDetails.name}`}
// //       >
// //         Shop the Collection: {collectionDetails.name}
// //       </span>
// //     </a>

// //     {/* Etherscan Button */}
// //     <a
// //       href={`https://etherscan.io/address/${CONTRACT_ADDRESS}`}
// //       target="_blank"
// //       rel="noopener noreferrer"
// //       className="hover:bg-emerald-800 text-white py-2 px-6 rounded-full hover:bg-opacity-60 ring-1 ring-inset ring-emerald-300 hover:ring-emerald-100 flex items-center space-x-2 transition-colors duration-200 justify-center"
// //     >
// //       <img src="/etherscan.svg" alt="Etherscan Logo" className="h-6" />
// //       <span className="text-emerald-100">View on Etherscan</span>
// //     </a>
// //   </div>
// // </div>
// // )}

// // {/* Batch Selection */}
// // <div className="relative rounded-xl px-3 pb-1.5 pt-2.5 ring-1 ring-inset ring-emerald-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-emerald-600">
// //   <label htmlFor="batch" className="block text-center text-sm font-medium text-emerald-100">
// //       Batch
// //   </label>
// //   <div className="relative" onClick={() => tapSoundEffect.play()}>
// //     <select
// //       name="batch"
// //       id="batch"
// //       className="block w-full border-0 bg-emerald-800 bg-opacity-60 text-emerald-100 placeholder:text-emerald-400 focus:ring-0 sm:text-base rounded-lg appearance-none pr-8"
// //       onChange={handleBatchChange}
// //       value={batch !== null ? batch.toString() : ''}
// //       disabled={isLoadingBatches}
// //     >
// //       <option value="" disabled>Select a Batch</option>
// //       {batches.map((batchItem) => (
// //         <option 
// //           key={batchItem.id} 
// //           value={batchItem.id} 
// //           disabled={!batchItem.isActive || batchItem.currentSupply >= batchItem.maxSupply}
// //         >
// //           {`Batch ${batchItem.id} ${batchItem.currentSupply >= batchItem.maxSupply ? '(Sold Out)' : batchItem.isActive ? '' : '(Coming Soon)'}`}
// //         </option>
// //       ))}
// //     </select>
// //     <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
// //       <ChevronDownIcon className="h-5 w-5" />
// //     </div>
// //   </div>
// //   {isLoadingBatches && (
// //     <div className="text-emerald-100 text-sm mt-2">Loading batches...</div>
// //   )}
// // </div>

// // {/* Number of Tokens */}
// // <div className="relative rounded-xl px-3 pb-1.5 pt-2.5 ring-1 ring-inset ring-emerald-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-emerald-600">
// //   <label htmlFor="tokens" className="block text-center text-sm font-medium text-emerald-100">
// //       Number of Tokens
// //   </label>
// //   <div className="relative">
// //       <input
// //           type="number"
// //           name="tokens"
// //           id="tokens"
// //           className="block w-full border-0 bg-emerald-800 bg-opacity-60 text-emerald-100 placeholder:text-emerald-400 focus:ring-0 sm:text-base rounded-lg text-center"
// //           placeholder="1"
// //           value={tokens}
// //           onChange={e => {
// //             const value = Number(e.target.value);
// //             if (value >= 1 && value <= 10) { // Assuming a max of 10 tokens
// //               setTokens(value);
// //             }
// //           }}
// //           min={1}
// //           max={10}
// //       />
// //       <button
// //           type="button"
// //           className="absolute top-0 left-0 mt-2.5 ml-2 text-emerald-100"
// //           onClick={decrementTokens}
// //           aria-label="Decrement Tokens"
// //       >
// //           <MinusIcon className="h-5 w-5" />
// //       </button>
// //       <button
// //           type="button"
// //           className="absolute top-0 right-0 mt-2.5 mr-2 text-emerald-100"
// //           onClick={incrementTokens}
// //           aria-label="Increment Tokens"
// //       >
// //           <PlusIcon className="h-5 w-5" />
// //       </button>
// //   </div>
// // </div>

// // {/* Referral Code and Price */}
// // <div className="flex justify-between items-stretch">
// //   <div className="flex-grow relative rounded-xl px-3 pb-1.5 pt-2.5 ring-1 ring-inset ring-emerald-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-emerald-600 w-1/2 mr-2">
// //     <label htmlFor="referral" className="block text-center text-sm font-medium text-emerald-100">
// //       Referral Code
// //     </label>
// //     <input
// //       id="referral"
// //       className="block w-full h-auto border-0 bg-emerald-800 bg-opacity-60 text-emerald-100 placeholder:text-emerald-400 focus:ring-0 sm:text-base rounded-lg"
// //       placeholder="Enter Code"
// //       value={referralCode}
// //       onChange={e => setReferralCode(e.target.value)}
// //     />
// //   </div>
// //   <div className="flex-grow relative rounded-xl px-3 pb-1.5 pt-2.5 ring-1 ring-inset ring-emerald-300 w-1/2 ml-2">
// //       <label htmlFor="price" className="block text-center text-sm font-medium text-emerald-100">
// //           Price
// //       </label>
// //       <input 
// //           id="price" 
// //           className="block w-full h-auto text-emerald-100 sm:text-base rounded-lg font-bold bg-emerald-800 bg-opacity-60 p-2 pr-2 text-right"
// //           type="text"
// //           readOnly
// //           value={
// //             isLoadingPrice 
// //               ? 'Loading...'
// //               : pricePerToken > 0 
// //                 ? `${ethers.formatEther(BigInt(tokens * pricePerToken))} ETH` 
// //                 : 'N/A'
// //           }
// //       />
// //       <img src="/eth.svg" alt="Ethereum symbol" className="absolute top-1/2 translate-y-1/4 left-6 transform h-4 w-4 filter invert" />
// //   </div>
// // </div>

// // {/* Whitelist Checkbox */}
// // <div className="relative rounded-lg flex items-center px-3 pb-1.5 pt-1.5 ring-1 ring-inset ring-emerald-300 focus-within:z-10 focus-within:ring-2 focus-within:ring-emerald-600">
// //   <input
// //       type="checkbox"
// //       name="whitelist"
// //       id="whitelist"
// //       className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-0 rounded-lg"
// //       checked={whitelist}
// //       onChange={handleWhitelistChange}
// //   />
// //   <label htmlFor="whitelist" className="ml-3 block text-sm font-medium text-emerald-100">
// //       Whitelist
// //   </label>
// // </div>

// // {/* Minting Buttons */}
// // <div className="flex flex-row justify-center flex-nowrap">
// // <div className="w-auto p-2 text-xs sm:text-sm md:text-base">
// //   <Minting 
// //     Batch={batch !== null ? Number(batch) : 0} 
// //     tokens={tokens} 
// //     whitelist={whitelist} 
// //     referral={referralCode} 
// //     batchPrice={pricePerToken} // Pass batchPrice as a prop
// //   />
// // </div>
// // <div className="w-auto p-2 text-xs sm:text-sm md:text-base">
// //   <FiatMinting 
// //     Batch={batch !== null ? Number(batch) : 0} 
// //     tokens={tokens} 
// //     whitelist={whitelist} 
// //     referral={referralCode} 
// //     batchPrice={pricePerToken} // Pass batchPrice as a prop
// //   />
// // </div>
// // </div>