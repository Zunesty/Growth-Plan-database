"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import VoiceRecorder from "@/components/VoiceRecorder";
import { CLIENTS, type SheetData, type ChatMessage, type ReportingPhase } from "@/lib/reporting-types";

export default function ClientReportingPage() {
  const [phase, setPhase] = useState<ReportingPhase>("input");
  const [selectedClient, setSelectedClient] = useState(CLIENTS[0]?.id || "");
  const [transcript, setTranscript] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [sheetData, setSheetData] = useState<SheetData[]>([]);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);

  // Clarification phase
  const [clarificationQuestions, setClarificationQuestions] = useState("");
  const [clarificationAnswer, setClarificationAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Draft phase
  const [reportDraft, setReportDraft] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);

  // Export
  const [isPushing, setIsPushing] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const effectiveTranscript = transcript || manualTranscript;
  const clientName = CLIENTS.find((c) => c.id === selectedClient)?.name || "";

  // Step 1: Fetch sheet data
  const fetchSheetData = async () => {
    setIsLoadingSheets(true);
    setSheetsError(null);
    try {
      const res = await fetch("/api/reporting/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: selectedClient }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSheetData(data.data);
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // Step 2: Generate clarification or skip to draft
  const handleGenerate = async () => {
    if (!effectiveTranscript.trim()) {
      alert("Please record or type a voice dump first.");
      return;
    }

    // Fetch sheet data if not already loaded
    if (sheetData.length === 0) {
      await fetchSheetData();
    }

    setIsGenerating(true);
    setPhase("clarification");
    setClarificationQuestions("");

    try {
      const res = await fetch("/api/reporting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: effectiveTranscript,
          sheetData,
          clientName,
          phase: "clarification",
        }),
      });

      if (!res.ok) throw new Error("Failed to generate clarification");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value);
          setClarificationQuestions(fullText);
        }
      }

      // If AI says no questions needed, skip to draft
      if (fullText.includes("NO_QUESTIONS")) {
        await generateDraft("");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
      setPhase("input");
    } finally {
      setIsGenerating(false);
    }
  };

  // Step 3: Generate draft
  const generateDraft = async (answers: string) => {
    setIsGenerating(true);
    setPhase("drafting");
    setReportDraft("");

    try {
      const res = await fetch("/api/reporting/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: effectiveTranscript,
          sheetData,
          clientName,
          phase: "draft",
          clarificationAnswers: answers,
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
    } finally {
      setIsGenerating(false);
    }
  };

  // Chat refinement
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
          transcript: effectiveTranscript,
          sheetData,
          clientName,
          phase: "chat",
          currentDraft: reportDraft,
          chatHistory: [...newMessages],
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

  // Export
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
          clientName,
          templateId: CLIENTS.find((c) => c.id === selectedClient)?.gammaTemplateId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setExportStatus("Pushed to Gamma!");
        if (data.url) window.open(data.url, "_blank");
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
    setTranscript("");
    setManualTranscript("");
    setSheetData([]);
    setClarificationQuestions("");
    setClarificationAnswer("");
    setReportDraft("");
    setChatMessages([]);
    setExportStatus(null);
  };

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
      {/* Phase 1: Input */}
      {phase === "input" && (
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-semibold text-zunesty-light mb-2">Client Reporting</h2>
            <p className="text-sm text-zunesty-light/50">
              Record a voice dump, pull metrics from Google Sheets, and generate a polished client report.
            </p>
          </div>

          {/* Client selector */}
          <div>
            <label className="block text-sm font-medium text-zunesty-light/80 mb-1.5">
              Select Client <span className="text-zunesty-green">*</span>
            </label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors"
            >
              {CLIENTS.map((c) => (
                <option key={c.id} value={c.id} className="bg-zunesty-black">
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Voice recorder */}
          <div>
            <label className="block text-sm font-medium text-zunesty-light/80 mb-3">
              Voice Dump <span className="text-zunesty-green">*</span>
            </label>
            <VoiceRecorder onTranscript={setTranscript} />
          </div>

          {/* Manual transcript input */}
          <div>
            <label className="block text-sm font-medium text-zunesty-light/80 mb-1.5">
              Or Type Your Update
            </label>
            <textarea
              value={manualTranscript}
              onChange={(e) => setManualTranscript(e.target.value)}
              placeholder="Type your client status update here if you prefer not to use voice..."
              rows={5}
              className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors resize-y"
            />
          </div>

          {/* Fetch data + Generate */}
          <div className="flex gap-3">
            <button
              onClick={fetchSheetData}
              disabled={isLoadingSheets}
              className="rounded-lg border border-zunesty-green-dark/40 px-5 py-3 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors disabled:opacity-50"
            >
              {isLoadingSheets ? "Fetching..." : "Preview Sheet Data"}
            </button>
            <button
              onClick={handleGenerate}
              disabled={!effectiveTranscript.trim() || isGenerating}
              className="flex-1 rounded-lg bg-zunesty-green px-6 py-3 text-sm font-semibold text-zunesty-black uppercase tracking-wider hover:bg-zunesty-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate Report
            </button>
          </div>

          {sheetsError && (
            <p className="text-sm text-red-400">{sheetsError}</p>
          )}

          {/* Sheet data preview */}
          {sheetData.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs font-medium text-zunesty-green/60 uppercase tracking-wider">Sheet Data Preview</p>
              {sheetData.map((tab) => (
                <div key={tab.tabName} className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-4 overflow-x-auto">
                  <p className="text-sm font-medium text-zunesty-green mb-2">{tab.mapTo} ({tab.tabName})</p>
                  {tab.headers.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {tab.headers.map((h, i) => (
                            <th key={i} className="text-left p-1.5 text-zunesty-green/60 border-b border-zunesty-green-dark/20">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tab.rows.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {row.map((cell, j) => (
                              <td key={j} className="p-1.5 text-zunesty-light/60 border-b border-zunesty-green-dark/10">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-xs text-zunesty-light/30">No data found</p>
                  )}
                  {tab.rows.length > 5 && (
                    <p className="text-xs text-zunesty-light/30 mt-2">... and {tab.rows.length - 5} more rows</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Phase 2: Clarification */}
      {phase === "clarification" && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button onClick={handleReset} className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors">
              &larr; Start Over
            </button>
            <h2 className="text-lg font-semibold text-zunesty-light">Clarification — {clientName}</h2>
          </div>

          <div className="rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6">
            {isGenerating && !clarificationQuestions && (
              <div className="flex items-center gap-3 text-zunesty-green">
                <div className="w-5 h-5 border-2 border-zunesty-green border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Analyzing your voice dump and sheet data...</span>
              </div>
            )}
            <div className="growth-plan-output">
              <ReactMarkdown>{clarificationQuestions}</ReactMarkdown>
            </div>
          </div>

          {!isGenerating && clarificationQuestions && !clarificationQuestions.includes("NO_QUESTIONS") && (
            <div className="space-y-3">
              <textarea
                value={clarificationAnswer}
                onChange={(e) => setClarificationAnswer(e.target.value)}
                placeholder="Answer the clarifying questions here..."
                rows={4}
                className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors resize-y"
              />
              <button
                onClick={() => generateDraft(clarificationAnswer)}
                disabled={isGenerating}
                className="w-full rounded-lg bg-zunesty-green px-6 py-3 text-sm font-semibold text-zunesty-black uppercase tracking-wider hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
              >
                Generate Report Draft
              </button>
            </div>
          )}
        </div>
      )}

      {/* Phase 3 & 4: Draft + Chat + Export */}
      {(phase === "drafting" || phase === "export") && (
        <div className="space-y-6">
          {/* Action bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleReset} className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors">
              &larr; New Report
            </button>
            <button onClick={handleCopy} className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors">
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

          {/* Report output */}
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

          {/* Chat refinement */}
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
                  placeholder="Ask to edit the report... e.g. 'Add more detail to the performance highlights'"
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
