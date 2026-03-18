"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { FormData } from "@/app/page";

type Props = {
  plan: string;
  isGenerating: boolean;
  formData: FormData;
  onBack: () => void;
  onUpdatePlan: (plan: string) => void;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function GrowthPlanOutput({ plan, isGenerating, formData, onBack, onUpdatePlan }: Props) {
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [notionStatus, setNotionStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(plan);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setIsChatting(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPlan: plan,
          message: userMsg,
          chatHistory: chatMessages,
          formData,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      // Add empty assistant message that we'll stream into
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);

          // Check if this chunk contains the updated plan marker
          if (chunk.includes("___UPDATED_PLAN___")) {
            const parts = chunk.split("___UPDATED_PLAN___");
            fullResponse += parts[0];
            // Update the assistant message
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: fullResponse };
              return updated;
            });
            // Everything after the marker is the updated plan
            const updatedPlan = parts[1];
            if (updatedPlan) {
              onUpdatePlan(updatedPlan);
            }
          } else {
            fullResponse += chunk;
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: fullResponse };
              return updated;
            });
          }
        }
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  const handlePushToNotion = async () => {
    setIsPushing(true);
    setNotionStatus(null);

    try {
      const res = await fetch("/api/notion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          prospectName: `${formData.prospectFirstName} ${formData.prospectLastName}`,
          prospectCompany: formData.prospectCompany,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setNotionStatus(`Pushed to Notion! ${data.url ? "" : ""}`);
        if (data.url) {
          window.open(data.url, "_blank");
        }
      } else {
        setNotionStatus(data.error || "Failed to push to Notion");
      }
    } catch {
      setNotionStatus("Failed to connect to Notion");
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors"
        >
          &larr; New Plan
        </button>
        <button
          onClick={handleCopy}
          className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors"
        >
          {copied ? "Copied!" : "Copy to Clipboard"}
        </button>
        <button
          onClick={handlePushToNotion}
          disabled={isPushing || isGenerating}
          className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPushing ? "Pushing..." : "Push to Notion"}
        </button>
        {notionStatus && (
          <span className={`text-sm ${notionStatus.includes("Failed") ? "text-red-400" : "text-zunesty-green"}`}>
            {notionStatus}
          </span>
        )}
      </div>

      {/* Growth Plan Output */}
      <div className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6 md:p-8">
        {isGenerating && !plan && (
          <div className="flex items-center gap-3 text-zunesty-green">
            <div className="w-5 h-5 border-2 border-zunesty-green border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Generating your growth plan...</span>
          </div>
        )}
        <div className="growth-plan-output">
          <ReactMarkdown>{plan}</ReactMarkdown>
        </div>
        {isGenerating && plan && (
          <div className="mt-4 flex items-center gap-2 text-zunesty-green/60">
            <div className="w-3 h-3 border-2 border-zunesty-green/60 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Generating...</span>
          </div>
        )}
      </div>

      {/* Chat Section */}
      {!isGenerating && plan && (
        <div className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6">
          <h3 className="text-sm font-semibold text-zunesty-green mb-4 uppercase tracking-wider">
            Refine Your Growth Plan
          </h3>

          {/* Chat messages */}
          {chatMessages.length > 0 && (
            <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-2">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-sm rounded-lg px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-zunesty-green-dark/30 text-zunesty-light ml-8"
                      : "bg-zunesty-green-darkest/50 text-zunesty-light/80 mr-8"
                  }`}
                >
                  <span className="text-xs font-medium text-zunesty-green/60 block mb-1">
                    {msg.role === "user" ? "You" : "Zunesty AI"}
                  </span>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {/* Chat input */}
          <form onSubmit={handleChat} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask to edit the growth plan... e.g. 'Make the timeline 6 months instead of 3'"
              disabled={isChatting}
              className="flex-1 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isChatting || !chatInput.trim()}
              className="rounded-lg bg-zunesty-green-mid px-5 py-3 text-sm font-medium text-zunesty-light hover:bg-zunesty-green-mid/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isChatting ? "..." : "Send"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
