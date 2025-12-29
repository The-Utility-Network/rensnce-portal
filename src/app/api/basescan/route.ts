import { NextResponse } from "next/server";

// Etherscan V2 API - Unified endpoint with chainid
const V2_API_URL = "https://api.etherscan.io/v2/api";

// Chain IDs for Base
const BASE_MAINNET_CHAIN_ID = "8453";
const BASE_SEPOLIA_CHAIN_ID = "84532";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // Determine desired network (default to sepolia for backwards-compatibility)
    const network = url.searchParams.get("network")?.toLowerCase();
    const chainId = network === "mainnet" ? BASE_MAINNET_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID;

    // Clone the search params and remove the network flag so it is not forwarded
    const forwardParams = new URLSearchParams(url.searchParams);
    forwardParams.delete("network");

    if (!Array.from(forwardParams.keys()).length) {
      return NextResponse.json({ error: "No query supplied" }, { status: 400 });
    }

    // Build V2 API URL with chainid
    const target = `${V2_API_URL}?chainid=${chainId}&${forwardParams.toString()}&apikey=${process.env.EXPLORER_API_KEY}`;
    console.log(`[basescan proxy] Request: chainid=${chainId}, params=${forwardParams.toString()}`);

    const res = await fetch(target, { next: { revalidate: 0 } });
    const body = await res.text();

    // Log first 500 chars of response for debugging
    console.log(`[basescan proxy] Response status=${res.status}, body=${body.slice(0, 500)}`);

    return new Response(body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (err: any) {
    console.error("/api/basescan proxy error", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
} 