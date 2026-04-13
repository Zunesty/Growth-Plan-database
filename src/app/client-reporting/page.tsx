"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import VoiceRecorder from "@/components/VoiceRecorder";
import ClientReportForm from "@/components/ClientReportForm";
import { CLIENTS, type ChatMessage, type ReportingPhase } from "@/lib/reporting-types";

export default function ClientReportingPage() {
  const [phase, setPhase] = useState<ReportingPhase>("input");
  const [selectedClientId, setSelectedClientId] = useState(CLIENTS[0]?.id || "");
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [voiceContext, setVoiceContext] = useState("");
  const [typedContext, setTypedContext] = useState("");

  const [reportDraft, setReportDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);

  const [isPushing, setIsPushing] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const selectedClient = CLIENTS.find((c) => c.id === selectedClientId)!;
  const combinedContext = [voiceContext, typedContext].filter(Boolean).join("\n\n");

  const updateField = (key: string, value: string) =>
    setFormValues((prev) => ({ ...prev, [key]: value }));

  const handleClientChange = (id: string) => {
    setSelectedClientId(id);
    setFormValues({});
  };

  const handleGenerate = async () => {
    if (!combinedContext.trim() && Object.values(formValues).every((v) => !v)) {
      alert("Please add at least some form data or context before generating.");
      return;
    }

    setIsGenerating(true);
    setPhase("drafting");
    setReportDraft("");

    try {
      const res = await fetch("/api/reporting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          formValues,
          context: combinedContext,
          phase: "draft",
        }),
      });

      if (!res.ok) throw new Error("Failed to generate report");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value);
          setReportDraft(fullText);
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
      setPhase("input");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting) return;

    const userMsg = chatInput.trim();
    setChatInput("");
    const newMessages: ChatMessage[] = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);
    setIsChatting(true);

    try {
      const res = await fetch("/api/reporting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: selectedClientId,
          formValues,
          context: combinedContext,
          phase: "chat",
          currentDraft: reportDraft,
          chatHistory: newMessages,
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = "";

      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);

          if (chunk.includes("___UPDATED_REPORT___")) {
            const parts = chunk.split("___UPDATED_REPORT___");
            fullResponse += parts[0];
            setChatMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: fullResponse };
              return updated;
            });
            if (parts[1]) setReportDraft(parts[1]);
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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(reportDraft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePushToGamma = async () => {
    setIsPushing(true);
    setExportStatus(null);

    try {
      const res = await fetch("/api/reporting/gamma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: reportDraft,
          clientName: selectedClient.name,
          gammaTemplateId: selectedClient.gammaTemplateId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        if (data.pending) {
          setExportStatus(data.message || "Generation in progress...");
        } else {
          setExportStatus("Pushed to Gamma!");
          if (data.url) window.open(data.url, "_blank");
        }
      } else {
        setExportStatus(data.error || "Failed to push to Gamma");
      }
    } catch {
      setExportStatus("Failed to connect to Gamma");
    } finally {
      setIsPushing(false);
    }
  };

  const handleReset = () => {
    setPhase("input");
    setFormValues({});
    setVoiceContext("");
    setTypedContext("");
    setReportDraft("");
    setChatMessages([]);
    setExportStatus(null);
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
      {phase === "input" && (
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-semibold text-zunesty-light mb-2">Client Reporting</h2>
            <p className="text-sm text-zunesty-light/50">
              Enter the week&apos;s numbers, give context on the client, then generate a polished report.
            </p>
          </div>

          {/* Client selector */}
          <div>
            <label className="block text-sm font-medium text-zunesty-light/80 mb-1.5">
              Client <span className="text-zunesty-green">*</span>
            </label>
            <select
              value={selectedClientId}
              onChange={(e) => handleClientChange(e.target.value)}
              className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors"
            >
              {CLIENTS.map((c) => (
                <option key={c.id} value={c.id} className="bg-zunesty-black">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Structured form */}
          <div className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/10 p-6">
            <ClientReportForm client={selectedClient} values={formValues} onChange={updateField} />
          </div>

          {/* Context section (voice + typed) */}
          <div className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/10 p-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-zunesty-green uppercase tracking-wider mb-1">
                Context
              </h3>
              <p className="text-xs text-zunesty-light/40">
                Give context on the client — sentiment, situation, what&apos;s working, what&apos;s not. Use voice or text.
              </p>
            </div>

            <VoiceRecorder onTranscript={setVoiceContext} />

            <div>
              <label className="block text-xs font-medium text-zunesty-light/70 mb-1.5">
                Or Type Your Context
              </label>
              <textarea
                value={typedContext}
                onChange={(e) => setTypedContext(e.target.value)}
                placeholder="e.g. Client is happy with progress this week. Concerned about response rates dropping. Wants to push harder on enterprise leads next month..."
                rows={5}
                className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors resize-y"
              />
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full rounded-lg bg-zunesty-green px-6 py-3.5 text-sm font-semibold text-zunesty-black uppercase tracking-wider hover:bg-zunesty-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Generate Report
          </button>
        </div>
      )}

      {phase === "drafting" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleReset}
              className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors"
            >
              &larr; New Report
            </button>
            <button
              onClick={handleCopy}
              className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors"
            >
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
            <button
              onClick={handlePushToGamma}
              disabled={isPushing || isGenerating}
              className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPushing ? "Pushing..." : "Push to Gamma"}
            </button>
            {exportStatus && (
              <span className={`text-sm ${exportStatus.includes("Failed") ? "text-red-400" : "text-zunesty-green"}`}>
                {exportStatus}
              </span>
            )}
          </div>

          <div className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6 md:p-8">
            {isGenerating && !reportDraft && (
              <div className="flex items-center gap-3 text-zunesty-green">
                <div className="w-5 h-5 border-2 border-zunesty-green border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Generating your client report...</span>
              </div>
            )}
            <div className="growth-plan-output">
              <ReactMarkdown>{reportDraft}</ReactMarkdown>
            </div>
            {isGenerating && reportDraft && (
              <div className="mt-4 flex items-center gap-2 text-zunesty-green/60">
                <div className="w-3 h-3 border-2 border-zunesty-green/60 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Generating...</span>
              </div>
            )}
          </div>

          {!isGenerating && reportDraft && (
            <div className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6">
              <h3 className="text-sm font-semibold text-zunesty-green mb-4 uppercase tracking-wider">
                Refine Your Report
              </h3>

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

              <form onSubmit={handleChat} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask to edit the report... e.g. 'Add more detail to the highlights section'"
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
      )}
    </div>
  );
}
