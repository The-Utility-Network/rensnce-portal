import { createThirdwebClient, getContract, readContract } from "thirdweb";
import { base, baseSepolia } from "thirdweb/chains";
import { ethers } from "ethers";

const client = createThirdwebClient({
    clientId: process.env.THIRDWEB_CLIENT || "",
});

const isTestnet = process.env.NEXT_PUBLIC_TESTNET === 'true';
const chain = isTestnet ? baseSepolia : base;
const contractAddress = (isTestnet ? process.env.DIAMOND_ADDRESS_TESTNET : process.env.DIAMOND_ADDRESS) || "";
const usdcDecimals = 6;

const contract = getContract({
    client,
    chain,
    address: contractAddress,
});

export async function getDaoStats() {
    try {
        const [
            totalSupply,
            usdcReserve,
            redemptionPrice,
            metadata,
            burnedBalance,
        ] = await Promise.all([
            readContract({ contract, method: "function totalSupply() view returns (uint256)", params: [] }),
            readContract({ contract, method: "function getUSDCReserve() view returns (uint256)", params: [] }),
            readContract({ contract, method: "function calculateRedemptionPrice() view returns (uint256)", params: [] }),
            readContract({ contract, method: "function getTokenMetadata() view returns (string, string, uint8)", params: [] }),
            readContract({ contract, method: "function balanceOf(address) view returns (uint256)", params: ["0x000000000000000000000000000000000000dEaD"] }),
        ]);

        const decimals = Number(metadata[2]);
        const name = metadata[0];
        const symbol = metadata[1];

        // Circulating Supply = Total - Reserve - Burn
        // For simplicity, let's just use Total for now or fetch Reserve if needed.
        // Fixed supply is 111,000,000.

        return {
            protocol_name: "Renaissance DAO",
            token_name: name,
            token_symbol: symbol,
            total_supply: ethers.formatUnits(totalSupply, decimals),
            burned_supply: ethers.formatUnits(burnedBalance, decimals),
            usdc_reserve: ethers.formatUnits(usdcReserve, usdcDecimals),
            redemption_price: ethers.formatUnits(redemptionPrice, usdcDecimals),
            chain: chain.name,
            contract_address: contractAddress,
        };
    } catch (error) {
        console.error("Error fetching DAO stats for tool call:", error);
        throw error;
    }
}
