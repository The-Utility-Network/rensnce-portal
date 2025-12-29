import { getContract, readContract } from "thirdweb";
import { base, baseSepolia } from "thirdweb/chains";
// Updated generic import to bypass relative path issues if possible, or we might need to duplicate createThirdwebClient too.
// For now, let's try to assume we can reach src/utils if it is in the same project root. 
// BUT, rensnce is a subdir. So we need to be careful.
// Ideally, we replicate the utility helper or point to it via alias.
// Let's copy the utility helper inline to be safe.

import { createThirdwebClient } from "thirdweb";

const client = createThirdwebClient({
    clientId: process.env.NEXT_PUBLIC_THIRDWEB_CLIENT || "",
});

// Helper to check testnet mode (called at runtime)
function isTestnetMode(): boolean {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('useTestnet') === 'true';
}

// Dynamic diamond address based on network mode
export function getDiamondAddress(): string {
    const testnet = isTestnetMode();
    const address = testnet
        ? process.env.NEXT_PUBLIC_DIAMOND_ADDRESS_TESTNET
        : process.env.NEXT_PUBLIC_DIAMOND_ADDRESS;
    console.log(`[Diamond] Using ${testnet ? 'TESTNET' : 'MAINNET'} address: ${address}`);
    return address || "0x0000000000000000000000000000000000000000";
}

// Export for backwards compatibility (static, uses mainnet by default)
export const diamondAddress = process.env.NEXT_PUBLIC_DIAMOND_ADDRESS || "0x0000000000000000000000000000000000000000";

// Dynamic contract getter
export function getDiamondContract() {
    const testnet = isTestnetMode();
    const address = getDiamondAddress();
    return getContract({
        client,
        chain: testnet ? baseSepolia : base,
        address: address,
        abi: [{ "inputs": [], "name": "DiamondWritable__InvalidInitializationParameters", "type": "error" }, { "inputs": [], "name": "DiamondWritable__RemoveTargetNotZeroAddress", "type": "error" }, { "inputs": [], "name": "DiamondWritable__ReplaceTargetIsIdentical", "type": "error" }, { "inputs": [], "name": "DiamondWritable__SelectorAlreadyAdded", "type": "error" }, { "inputs": [], "name": "DiamondWritable__SelectorIsImmutable", "type": "error" }, { "inputs": [], "name": "DiamondWritable__SelectorNotFound", "type": "error" }, { "inputs": [], "name": "DiamondWritable__SelectorNotSpecified", "type": "error" }, { "inputs": [], "name": "DiamondWritable__TargetHasNoCode", "type": "error" }, { "inputs": [], "name": "ERC165Base__InvalidInterfaceId", "type": "error" }, { "inputs": [], "name": "Ownable__NotOwner", "type": "error" }, { "inputs": [], "name": "Ownable__NotTransitiveOwner", "type": "error" }, { "inputs": [], "name": "Proxy__ImplementationIsNotContract", "type": "error" }, { "inputs": [], "name": "SafeOwnable__NotNomineeOwner", "type": "error" }, { "anonymous": false, "inputs": [{ "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "enum IERC2535DiamondCutInternal.FacetCutAction", "name": "action", "type": "uint8" }, { "internalType": "bytes4[]", "name": "selectors", "type": "bytes4[]" }], "indexed": false, "internalType": "struct IERC2535DiamondCutInternal.FacetCut[]", "name": "facetCuts", "type": "tuple[]" }, { "indexed": false, "internalType": "address", "name": "target", "type": "address" }, { "indexed": false, "internalType": "bytes", "name": "data", "type": "bytes" }], "name": "DiamondCut", "type": "event" }, { "anonymous": false, "inputs": [{ "indexed": true, "internalType": "address", "name": "previousOwner", "type": "address" }, { "indexed": true, "internalType": "address", "name": "newOwner", "type": "address" }], "name": "OwnershipTransferred", "type": "event" }, { "stateMutability": "payable", "type": "fallback" }, { "inputs": [], "name": "acceptOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "enum IERC2535DiamondCutInternal.FacetCutAction", "name": "action", "type": "uint8" }, { "internalType": "bytes4[]", "name": "selectors", "type": "bytes4[]" }], "internalType": "struct IERC2535DiamondCutInternal.FacetCut[]", "name": "facetCuts", "type": "tuple[]" }, { "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes", "name": "data", "type": "bytes" }], "name": "diamondCut", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bytes4", "name": "selector", "type": "bytes4" }], "name": "facetAddress", "outputs": [{ "internalType": "address", "name": "facet", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "facetAddresses", "outputs": [{ "internalType": "address[]", "name": "addresses", "type": "address[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "facet", "type": "address" }], "name": "facetFunctionSelectors", "outputs": [{ "internalType": "bytes4[]", "name": "selectors", "type": "bytes4[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "facets", "outputs": [{ "components": [{ "internalType": "address", "name": "target", "type": "address" }, { "internalType": "bytes4[]", "name": "selectors", "type": "bytes4[]" }], "internalType": "struct IERC2535DiamondLoupeInternal.Facet[]", "name": "diamondFacets", "type": "tuple[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "getFallbackAddress", "outputs": [{ "internalType": "address", "name": "fallbackAddress", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "nomineeOwner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "fallbackAddress", "type": "address" }], "name": "setFallbackAddress", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [{ "internalType": "bytes4", "name": "interfaceId", "type": "bytes4" }], "name": "supportsInterface", "outputs": [{ "internalType": "bool", "name": "", "type": "boolean" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "account", "type": "address" }], "name": "transferOwnership", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "stateMutability": "payable", "type": "receive" }],
    });
}

// Function to get all facets and their selectors
async function getFacets() {
    try {
        const currentDiamondAddress = getDiamondAddress();
        if (!currentDiamondAddress || currentDiamondAddress === "0x0000000000000000000000000000000000000000") {
            console.warn("Diamond address is not set or is zero address. Skipping fetch.");
            return [];
        }
        // Get contract dynamically based on network mode
        const contract = getDiamondContract();
        // Call the 'facets' method on the contract
        const facetsResponse = await readContract({
            contract: contract,
            method: "facets", // This method returns all facets and their selectors
        });
        console.log(facetsResponse);

        return facetsResponse;
    } catch (error) {
        console.error("Error fetching facets:", error);
        return [];
    }
}

// Function to get details for a specific method (function selector) in a facet
async function getMethodDetails(facetAddress: string, selector: string) {
    try {
        // Get contract dynamically based on network mode
        const contract = getDiamondContract();
        // Call the 'facetFunctionSelectors' method to get the function selectors for a given facet address
        const selectors = await readContract({
            contract: contract,
            method: "facetFunctionSelectors",
            params: [facetAddress],
        });
        console.log(selectors)

        // Find and return the selector details (if applicable)
        const methodDetails = selectors.find((sel: any) => sel === selector);
        return methodDetails ? methodDetails : null;
    } catch (error) {
        console.error("Error fetching method details:", error);
        return null;
    }
}

export { getFacets };
export { getMethodDetails };


