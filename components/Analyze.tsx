import React, { useState, useEffect } from "react";
// Adjust imports to valid relative paths
import { requestQueue } from "../../utils/RequestQueue";
import dynamic from 'next/dynamic';
const Diamond3D = dynamic(() => import("./Diamond3D"), { ssr: false });
import { ethers } from "ethers";
import { getFacets } from "./core/Diamond";

interface Facet {
    facetAddress: string;
    selectors: string[];
}

const cacheKey = "facetCache_RENSNCE"; // Unique cache key for this portal

export function readCache() {
    if (typeof window === 'undefined') return { contractNames: {}, methodNames: {}, abis: {} };
    const cache = localStorage.getItem(cacheKey);
    return cache ? JSON.parse(cache) : { contractNames: {}, methodNames: {}, abis: {} };
}

export function writeCache(cache: any) {
    if (typeof window === 'undefined') return;
    localStorage.setItem(cacheKey, JSON.stringify(cache));
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
            // Silent fail
        }
    }
    return { readMethods, writeMethods };
}

async function fetchABIFromBaseScan(address: string, apiKey: string, cache: any) {
    if (cache.abis[address]) return cache.abis[address];
    try {
        const response = await requestQueue.enqueue(() => fetch(
            `/api/reserve-data?action=getabi&address=${address}`
        ));
        const data = await response.json();
        if (data.status === "1") {
            try {
                const abi = JSON.parse(data.result);
                cache.abis[address] = abi;
                writeCache(cache);
                return abi;
            } catch (parseError) {
                return null;
            }
        }
    } catch (error) {
        console.error(`Network error fetching ABI for ${address}:`, error);
    }
    return null;
}

async function fetchContractNameFromBaseScan(address: string, apiKey: string, cache: any) {
    if (cache.contractNames[address]) return cache.contractNames[address];
    try {
        const response = await requestQueue.enqueue(() => fetch(
            `/api/reserve-data?action=getsourcecode&address=${address}`
        ));
        const data = await response.json();
        if (data.status === "1" && data.result?.[0]?.ContractName) {
            const contractName = data.result[0].ContractName;
            cache.contractNames[address] = contractName;
            writeCache(cache);
            return contractName;
        }
    } catch (error) {
        console.error(error);
    }
    return "Unknown Contract";
}

async function processFacets(formattedFacets: Facet[], cache: any) {
    const methodNamesLookup: { [key: string]: { readMethods: string[]; writeMethods: string[] } } = {};
    const facetNamesLookup: { [key: string]: string } = {};

    for (const facet of formattedFacets) {
        try {
            // 1. Get Name
            const contractName = await fetchContractNameFromBaseScan(facet.facetAddress, '', cache);
            facetNamesLookup[facet.facetAddress] = contractName || "Unknown";

            // 2. Get ABI
            const abi = await fetchABIFromBaseScan(facet.facetAddress, '', cache);
            if (!abi) {
                methodNamesLookup[facet.facetAddress] = { readMethods: [], writeMethods: [] };
                continue;
            }

            // 3. Classify
            const { readMethods, writeMethods } = classifyMethods(abi, facet.selectors);
            methodNamesLookup[facet.facetAddress] = { readMethods, writeMethods };

        } catch (e) {
            // console.error(e);
        }
    }
    return { methodNamesLookup, facetNamesLookup };
}

interface AnalyzePanelProps {
    facets: Facet[];
    methodNames: any;
    facetNames: any;
    facetAbis: any;
    isMobile?: boolean;
}

const AnalyzePanel: React.FC<AnalyzePanelProps> = ({ facets, methodNames, facetNames, facetAbis, isMobile }) => {
    // Determine loading state based on data presence
    const isLoading = facets.length === 0;

    return (
        <div className="absolute inset-0 z-10 w-full h-full pointer-events-none">
            <div className="w-full h-full pointer-events-auto">
                <Diamond3D
                    facets={facets}
                    methodNames={methodNames}
                    facetNames={facetNames}
                    facetAbis={facetAbis}
                    isMobile={isMobile}
                />
            </div>
        </div>
    );
};

export default AnalyzePanel;
