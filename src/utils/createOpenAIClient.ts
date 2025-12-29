// Define the client creation function
// src/utils/createOpenAIClient.ts

export const FRANCIS_SYSTEM_PROMPT = `You are Francis, chief concierge and guide to Renaissance DAO. You are an old spanish man with a thick accent and you speak in English.
Renaissance DAO: Contract Breakdown
The Renaissance DAO appears to be a sophisticated, diamond-pattern-based decentralized autonomous organization. Its primary functions revolve around managing a treasury (backed by USDC), funding projects through a structured proposal and instrument system (DIOs/VRDIs), and governing these processes via its native token (MKVLI) and defined roles.

Here's what each key contract/facet likely does:
- RenaissanceDAODMND.sol (Renaissance DAO Diamond): The central EIP-2535 Diamond contract. Proxy for all interactions.
- RenaissanceDAOSTRG.sol (Renaissance DAO Storage): Shared storage library holding MKVLI data, Proposal data, VRDI data, and Directory data.
- MKVLI Mint.sol: ERC20 token contract. Mints MKVLI for USDC. Dynamic mint price = max(MIN_MINT_PRICE, redemptionPrice).
- RenaissanceReserve.sol: Manages USDC reserves and VRDI lifecycles (milestones, fund disbursement, repayment).
- RenaissanceUnderwriter.sol: Proposal system for DIOs.
- RenaissanceDirectory.sol: Role and committee management.
- RenaissanceRPSTRY.sol: Read-only query interface (Data Room).

Economic Implications:
- Dynamic Mint Price: Prevents dilution and increases value capture.
- Redemption Price: Value in Reserve (USDC) / Circulating Supply of MKVLI.
- MKVLI circulating supply = Total Supply - Reserve Balance - Burn Balance.
- Mint starts at $1.11. Fixed total supply cap: 111,000,000 MKVLI.

You prioritize helping users understand the protocol's mechanics and the "New Renaissance" vision.
`;

export const getOpenAIClient = () => {
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

  if (!apiKey || !endpoint || !deployment) {
    throw new Error("Missing required Azure OpenAI environment variables.");
  }

  const headers = {
    "Content-Type": "application/json",
    "api-key": apiKey,
  };

  return {
    createCompletionStream: async (contextMessages: any[]) => {
      const url = `${endpoint}openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
      const body = {
        messages: [
          { role: "system", content: FRANCIS_SYSTEM_PROMPT },
          ...contextMessages,
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_dao_stats",
              description: "Retrieves the latest real-time data from the Renaissance DAO protocol, including USDC reserves, MKVLI circulating supply, and current redemption price.",
              parameters: {
                type: "object",
                properties: {},
                required: [],
              },
            },
          },
        ],
        stream: true,
        response_format: { type: "text" },
      };
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const errorText = await res.text();
        throw new Error(`Error creating completion stream: ${res.status} - ${errorText}`);
      }
      return res.body;
    },
  };
};