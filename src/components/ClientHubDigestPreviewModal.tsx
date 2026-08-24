"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client-hub-fetch";

export default function ClientHubDigestPreviewModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ text: string }>("GET", "/api/client-hub/ui/digest/preview")
      .then((d) => setText(d.text))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border border-zunesty-green-dark/40 bg-zunesty-black p-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zunesty-light">Digest preview</h3>
            <button onClick={onClose} className="text-zunesty-light/60 hover:text-zunesty-light">
              ✕
            </button>
          </div>
          {error && <div className="text-sm text-red-300">{error}</div>}
          {!error && !text && <div className="text-sm text-zunesty-light/40">Loading…</div>}
          {text && <pre className="text-sm text-zunesty-light/80 whitespace-pre-wrap font-sans">{text}</pre>}
          <p className="mt-4 text-[11px] text-zunesty-light/30">
            This is the same content that posts to Slack at 8am Pacific — this preview doesn&apos;t post anything.
          </p>
        </div>
      </div>
    </>
  );
}
