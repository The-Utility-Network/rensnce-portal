// @ts-nocheck
import { NextResponse } from "next/server";

const BASE = "https://api.reservoir.tools";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: any) {
  try {
    const path = (params.path || []).join("/");
    const url = new URL(req.url);
    url.pathname = "/" + path; // replace pathname
    const query = url.search;
    const target = `${BASE}/${path}${query}`;

    const res = await fetch(target, {
      headers: {
        "x-api-key": process.env.RESERVOIR_API_KEY ?? "",
      },
      next: { revalidate: 0 },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
    });
  } catch (err: any) {
    console.error("/api/reservoir proxy error", err);
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
} 