"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-hub-fetch";

type Integrations = {
  mcp_url: string;
  api_url: string;
  api_token_configured: boolean;
  slack_configured: boolean;
  claude_code_snippet: string;
};

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-zunesty-light/60 mb-1">{label}</div>
      <div className="flex gap-2">
        <code className="flex-1 rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-xs text-zunesty-light/80 overflow-x-auto whitespace-nowrap">
          {value}
        </code>
        <button
          onClick={() => void navigator.clipboard.writeText(value)}
          className="rounded-lg border border-zunesty-green-dark/40 px-3 py-2 text-xs text-zunesty-light/70 hover:border-zunesty-green/40 shrink-0"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

export default function ClientHubIntegrationsPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Integrations | null>(null);

  useEffect(() => {
    api<Integrations>("GET", "/api/client-hub/ui/integrations").then(setData).catch(() => setData(null));
  }, []);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border border-zunesty-green-dark/40 bg-zunesty-black p-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zunesty-light">🔌 Integrations</h3>
            <button onClick={onClose} className="text-zunesty-light/60 hover:text-zunesty-light">
              ✕
            </button>
          </div>

          {!data ? (
            <p className="text-sm text-zunesty-light/40">Loading…</p>
          ) : (
            <>
              {!data.api_token_configured && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 mb-4">
                  CLIENT_HUB_API_TOKEN isn&apos;t set — the REST API and MCP server are disabled until it is.
                </div>
              )}
              {!data.slack_configured && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 mb-4">
                  Slack app credentials aren&apos;t set yet — slash commands, shortcuts, and mentions won&apos;t work until they are.
                </div>
              )}

              <CopyRow label="MCP URL (Streamable HTTP)" value={data.mcp_url} />
              <CopyRow label="REST API base URL" value={data.api_url} />

              <div className="mb-3">
                <div className="text-xs font-medium text-zunesty-light/60 mb-1">Claude Code</div>
                <CopyRow label="" value={data.claude_code_snippet} />
              </div>

              <p className="text-[11px] text-zunesty-light/30">
                claude.ai / Claude Desktop: Settings → Connectors → Add custom connector with the MCP URL above (supply the Authorization
                header where the connector UI supports it). ChatGPT: Settings → Connectors (developer mode) → same MCP URL, or point a
                custom GPT Action at the REST API with Bearer auth.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
