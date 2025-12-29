'use client';
import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  ChatBubbleBottomCenterTextIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  PlusIcon,
  SparklesIcon,
  CpuChipIcon,
  ClipboardIcon,
  CheckIcon
} from "@heroicons/react/24/outline";

const MONO_FONT_FAMILY = `'Fira Mono', Menlo, Monaco, Consolas, 'Courier New', monospace`;

interface Message {
  sender: "user" | "assistant";
  text: string;
}

interface ChatbotProps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  optionsVisible: boolean;
  setOptionsVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

const Chatbot: React.FC<ChatbotProps> = ({
  messages,
  setMessages,
  input,
  setInput,
  optionsVisible,
  setOptionsVisible,
}) => {
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [client, setClient] = useState<any>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    const cl = {
      createCompletionStream: async (contextMessages: any[]) => {
        const res = await fetch("/api/openai-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: contextMessages }),
        });
        if (!res.ok || !res.body) throw new Error(`AI error: ${res.status}`);
        return res.body;
      },
    };
    setClient(cl);
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) return;
    setMessages((prev) => [...prev, { sender: "user", text: message }]);
    setOptionsVisible(false);
    setInput("");
    setMessages((prev) => [...prev, { sender: "assistant", text: "" }]);
    setIsTyping(true);

    try {
      const contextMessages = messages.concat({ sender: "user", text: message }).map((msg) => ({
        role: msg.sender,
        content: msg.text,
      }));

      const stream = await client.createCompletionStream(contextMessages);
      const reader = stream.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullText = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          const jsonStr = line.replace("data: ", "").trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setMessages(prev => {
                const next = [...prev];
                next[next.length - 1].text = fullText;
                return next;
              });
            }
          } catch (e) { }
        }
      }
    } catch (error) {
      setMessages(prev => {
        const next = [...prev];
        next[next.length - 1].text = "Synthesis interrupted. Please try again.";
        return next;
      });
    }
    setIsTyping(false);
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(index);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* --- CHAT HEADER --- */}
      <div className="flex items-center justify-between mb-6 px-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl glass-card text-emerald-400">
            <CpuChipIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-sans font-light tracking-tight text-white">Francis <span className="text-emerald-500 font-medium">Assistant</span></h2>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono">Neural Interface Online</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => { setMessages([]); setOptionsVisible(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-full glass-card hover:bg-white/10 transition-all text-zinc-400 hover:text-white"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="text-[10px] uppercase tracking-widest font-mono">New Terminal</span>
        </button>
      </div>

      {/* --- MESSAGES AREA --- */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar space-y-8 pr-4 mb-4 scroll-smooth"
      >
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-2xl mx-auto animate-in fade-in zoom-in duration-700">
            <div className="p-8 md:p-12 rounded-[2rem] ultra-glass shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />
              <SparklesIcon className="w-12 h-12 text-emerald-400 mx-auto mb-6 opacity-40" />
              <h3 className="text-2xl md:text-3xl font-light text-white mb-4 italic">"How may I synchronize your objective?"</h3>
              <p className="font-mono text-zinc-500 text-xs md:text-sm leading-relaxed max-w-md mx-auto">
                I am Francis, the specialized LLM of the Renaissance Protocol. I am programmed to assist with redemption mechanics, governance theory, and asset liquidation inquiries.
              </p>
            </div>

            {optionsVisible && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                {[
                  'Explain the stochastic staking mechanism.',
                  'What is the current MKVLI redemption price?',
                  'How does the DAO manage debt instruments?',
                  'Analyze the liquidity constant equation.'
                ].map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(opt)}
                    className="p-4 rounded-2xl glass-card-light hover:glass-card hover:border-emerald-500/30 transition-all text-left group"
                  >
                    <div className="text-[10px] text-zinc-500 font-mono mb-2 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">Prompt Mode</div>
                    <div className="text-xs text-white group-hover:translate-x-1 transition-transform">{opt}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          // Prevent duplicate bubbles: don't render the message bubble if it's the last assistant message and still empty while typing
          if (msg.sender === "assistant" && !msg.text && i === messages.length - 1 && isTyping) return null;

          return (
            <div
              key={i}
              className={`flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-500 ${msg.sender === "user" ? "items-end pl-12" : "items-start pr-12"}`}
            >
              <div className="flex items-center gap-2 mb-2 px-2">
                {msg.sender === "assistant" && <CpuChipIcon className="w-3 h-3 text-emerald-500" />}
                <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-zinc-600">
                  {msg.sender === "user" ? "Authorized User" : "Francis Mainframe"}
                </span>
              </div>

              <div className={`relative p-5 rounded-2xl group transition-all duration-300 ${msg.sender === "user" ? "glass-card text-emerald-50 bg-emerald-500/[0.03]" : "ultra-glass text-zinc-200"}`}>
                {msg.sender === "assistant" && msg.text && (
                  <button
                    onClick={() => handleCopy(msg.text, i)}
                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity p-1"
                  >
                    {copiedIdx === i ? <CheckIcon className="w-3 h-3 text-emerald-400" /> : <ClipboardIcon className="w-3 h-3" />}
                  </button>
                )}

                <div className="font-mono text-sm leading-relaxed article-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                    {msg.text}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && messages[messages.length - 1].text === "" && (
          <div className="flex flex-col items-start pr-12 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-2 px-2">
              <span className="text-[10px] uppercase tracking-[0.2em] font-mono text-zinc-600">FRANCIS GENERATING</span>
            </div>
            <div className="p-5 rounded-2xl ultra-glass">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 animate-bounce" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- INPUT AREA --- */}
      <div className="mt-auto pt-4 relative">
        <div className="absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        <form
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(input); }}
          className="relative flex items-center gap-3 p-1 rounded-[2.5rem] glass-card focus-within:border-emerald-500/50 transition-colors shadow-2xl"
        >
          <div className="flex-1 flex items-center px-6">
            <ChatBubbleBottomCenterTextIcon className="w-5 h-5 text-zinc-500 mr-4" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query the protocol assistant..."
              className="w-full bg-transparent border-none focus:ring-0 text-white font-mono text-sm py-4 placeholder:text-zinc-600"
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="p-4 rounded-full bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-30 disabled:grayscale transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/20"
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </form>

        <div className="flex justify-center gap-6 mt-3 mb-2 font-mono text-[9px] text-zinc-600 uppercase tracking-widest">
          <span>Encrypted Session</span>
          <span className="text-emerald-500/50">Francis v2.4.0</span>
          <span>RENSNCE-AI-CORE</span>
        </div>
      </div>

      <style jsx global>{`
        .article-content p { margin-bottom: 1rem; }
        .article-content code { 
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
          padding: 0.1rem 0.3rem;
          border-radius: 0.25rem;
          font-family: ${MONO_FONT_FAMILY};
          font-size: 0.85em;
        }
        .article-content pre {
          background: rgba(0,0,0,0.5);
          border: 1px solid rgba(255,255,255,0.05);
          padding: 1.5rem;
          border-radius: 1rem;
          margin: 1.5rem 0;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
};

export default Chatbot;
