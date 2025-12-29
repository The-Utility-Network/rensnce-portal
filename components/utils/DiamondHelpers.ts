import { ethers } from "ethers";
import { getFacets } from "../core/Diamond";

// Inline Rate Limiting Queue (avoiding cross-directory import issues)
class InlineRequestQueue {
    private queue: (() => Promise<any>)[] = [];
    private pending = false;
    private delay = 1000;

    async enqueue<T>(request: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try { resolve(await request()); } catch (e) { reject(e); }
            });
            this.dequeue();
        });
    }

    private async dequeue() {
        if (this.pending || !this.queue.length) return;
        this.pending = true;
        const item = this.queue.shift();
        if (item) { try { await item(); } catch { } }
        await new Promise(r => setTimeout(r, this.delay));
        this.pending = false;
        this.dequeue();
    }
}
const requestQueue = new InlineRequestQueue();

export interface Facet {
    facetAddress: string;
    selectors: string[];
}

export interface CachedData {
    contractNames: Record<string, string>;
    methodNames: Record<string, { readMethods: string[]; writeMethods: string[] }>;
    abis: Record<string, any[]>;
}

const CACHE_KEY = "facetCache_RENSNCE_v2";

export interface MethodNames {
    readMethods: string[];
    writeMethods: string[];
}

export type MethodNamesLookup = Record<string, MethodNames>;
export type FacetNamesLookup = Record<string, string>;
export type FacetAbisLookup = Record<string, any[]>;

export function readCache(): CachedData {
    if (typeof window === 'undefined') return { contractNames: {}, methodNames: {}, abis: {} };
    const cache = localStorage.getItem(CACHE_KEY);
    return cache ? JSON.parse(cache) : { contractNames: {}, methodNames: {}, abis: {} };
}

export function writeCache(cache: CachedData) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function classifyMethods(abi: any[], selectors: string[]) {
    const readMethods: string[] = [];
    const writeMethods: string[] = [];
    const iface = new ethers.Interface(abi);
    for (const selector of selectors) {
        try {
            const method = iface.getFunction(selector);
            if (method) {
                if (method.stateMutability === "view" || method.stateMutability === "pure") {
                    readMethods.push(method.name);
                } else {
                    writeMethods.push(method.name);
                }
            }
        } catch (error) {
            // Selector might be an event or error, or not in ABI (though it should be)
        }
    }
    return { readMethods, writeMethods };
}

// Helper to get network query param based on testnet mode
function getNetworkQuery(): string {
    const useTestnet = typeof window !== 'undefined' && localStorage.getItem('useTestnet') === 'true';
    const query = useTestnet ? '' : '&network=mainnet';
    console.log(`[DiamondHelpers] Network detection: useTestnet=${useTestnet}, query="${query}"`);
    return query;
}

async function fetchABIFromBaseScan(address: string, cache: CachedData) {
    if (cache.abis[address]) return cache.abis[address];
    const networkQuery = getNetworkQuery();
    const url = `/api/basescan?module=contract&action=getabi&address=${address}${networkQuery}`;
    console.log(`[DiamondHelpers] Fetching ABI from: ${url}`);
    try {
        const response = await requestQueue.enqueue(() => fetch(url));
        const data = await response.json();
        console.log(`[DiamondHelpers] ABI Response for ${address}:`, data.status, data.message);
        if (data.status === "1") {
            try {
                const abi = JSON.parse(data.result);
                cache.abis[address] = abi;
                writeCache(cache);
                return abi;
            } catch (parseError) {
                console.warn(`Failed to parse ABI for ${address}`);
                return null;
            }
        } else {
            console.warn(`[DiamondHelpers] ABI fetch failed for ${address}: ${data.message || data.result}`);
        }
    } catch (error) {
        console.error(`Network error fetching ABI for ${address}:`, error);
    }
    return null;
}

async function fetchContractNameFromBaseScan(address: string, cache: CachedData) {
    if (cache.contractNames[address]) return cache.contractNames[address];
    const networkQuery = getNetworkQuery();
    try {
        const response = await requestQueue.enqueue(() => fetch(
            `/api/basescan?module=contract&action=getsourcecode&address=${address}${networkQuery}`
        ));
        const data = await response.json();
        console.log(`[DiamondHelpers] Full getsourcecode response for ${address}:`, JSON.stringify(data).slice(0, 500));

        if (data.status === "1" && data.result) {
            // V1 format: data.result[0].ContractName
            // V2 format might be: data.result.ContractName or data.result[0].contractName (lowercase)
            let contractName = null;

            if (Array.isArray(data.result) && data.result[0]) {
                contractName = data.result[0].ContractName || data.result[0].contractName;
            } else if (typeof data.result === 'object' && !Array.isArray(data.result)) {
                contractName = data.result.ContractName || data.result.contractName;
            }

            // Check if name is non-empty
            if (contractName && contractName.trim() !== '') {
                cache.contractNames[address] = contractName;
                writeCache(cache);
                console.log(`[DiamondHelpers] Found contract name: ${contractName}`);
                return contractName;
            }
        }
    } catch (error) {
        console.error(`Error fetching contract name for ${address}:`, error);
    }

    // Fallback: Use shortened address as label (more useful than "Unknown Contract")
    const shortName = `Facet_${address.slice(2, 8)}`;
    console.log(`[DiamondHelpers] Using fallback name for unverified contract: ${shortName}`);
    cache.contractNames[address] = shortName;
    writeCache(cache);
    return shortName;
}

export async function fetchDiamondData() {
    const currentCache = readCache();
    let facets: Facet[] = [];

    try {
        // Fetch Facets from Contract
        const rawFacets = await getFacets();
        facets = rawFacets.map((f: any) => ({
            facetAddress: f.target as string,
            selectors: Array.from(f.selectors) as string[],
        }));
    } catch (e) {
        console.error("Failed to fetch facets from contract:", e);
        return { facets: [], methodNames: {}, facetNames: {}, facetAbis: {}, error: e };
    }

    const methodNamesLookup: Record<string, { readMethods: string[]; writeMethods: string[] }> = {};
    const facetNamesLookup: Record<string, string> = {};
    const facetAbisLookup: Record<string, any[]> = {};

    // Process each facet (Name + ABI + Methods)
    for (const facet of facets) {
        // 1. Get Name
        const name = await fetchContractNameFromBaseScan(facet.facetAddress, currentCache);
        facetNamesLookup[facet.facetAddress] = name;

        // 2. Get ABI
        const abi = await fetchABIFromBaseScan(facet.facetAddress, currentCache);
        if (abi) {
            facetAbisLookup[facet.facetAddress] = abi;
            // 3. Classify Methods
            methodNamesLookup[facet.facetAddress] = classifyMethods(abi, facet.selectors);
        } else {
            console.warn(`No ABI found for ${facet.facetAddress}, using selectors as fallback.`);
            methodNamesLookup[facet.facetAddress] = {
                readMethods: facet.selectors.map(s => `func_${s.slice(0, 10)}`),
                writeMethods: []
            };
        }
    }

    return {
        facets,
        methodNames: methodNamesLookup,
        facetNames: facetNamesLookup,
        facetAbis: facetAbisLookup
    };
}
