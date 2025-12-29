import { NextResponse } from "next/server";
import { FRANCIS_SYSTEM_PROMPT, getOpenAIClient } from "../../../utils/createOpenAIClient";
import { getDaoStats } from "../../../utils/daoStats";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const client = getOpenAIClient();

    // Initial call to check for tool calls
    const response = await fetch(`${process.env.AZURE_OPENAI_ENDPOINT}openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview"}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.AZURE_OPENAI_KEY || "",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: FRANCIS_SYSTEM_PROMPT },
          ...messages
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_dao_stats",
              description: "Retrieves real-time protocol data from the Renaissance DAO contract.",
              parameters: { type: "object", properties: {}, required: [] },
            },
          },
        ],
        tool_choice: "auto"
      }),
    });

    const data = await response.json();
    const message = data.choices[0].message;

    if (message.tool_calls) {
      // Execute tools
      const toolResults = [];
      for (const toolCall of message.tool_calls) {
        if (toolCall.function.name === "get_dao_stats") {
          const stats = await getDaoStats();
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: "get_dao_stats",
            content: JSON.stringify(stats),
          });
        }
      }

      // Final call with tool results, this time we stream it
      const finalStream = await client.createCompletionStream([
        ...messages,
        message,
        ...toolResults
      ]);

      return new Response(finalStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    // No tools called, just stream the original completion
    const stream = await client.createCompletionStream(messages);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });

  } catch (err: any) {
    console.error("/api/openai-stream error", err);
    return NextResponse.json({ error: err?.message || "Internal Server Error" }, { status: 500 });
  }
}