"use client";

import { useEffect, useState } from "react";

type Folders = {
  bottles: string | null;
  output: string | null;
  approved: string | null;
};

export default function DriveFoldersBar() {
  const [folders, setFolders] = useState<Folders | null>(null);

  useEffect(() => {
    fetch("/api/ad-generator/folders")
      .then((r) => r.json())
      .then(setFolders)
      .catch(() => setFolders({ bottles: null, output: null, approved: null }));
  }, []);

  if (!folders) return null;

  const items = [
    {
      label: "Bottle Shots",
      sub: "Input images",
      url: folders.bottles,
      icon: "🍶",
    },
    {
      label: "Generated Ads",
      sub: "Review queue",
      url: folders.output,
      icon: "🖼️",
    },
    {
      label: "Approved",
      sub: "Ready for Meta",
      url: folders.approved,
      icon: "✅",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {items.map((item) => {
        const disabled = !item.url;
        const content = (
          <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
              disabled
                ? "border-zunesty-green-dark/20 bg-zunesty-green-darkest/10 opacity-50 cursor-not-allowed"
                : "border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 hover:border-zunesty-green/40 hover:bg-zunesty-green-darkest/50"
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zunesty-light truncate">{item.label}</p>
              <p className="text-[10px] text-zunesty-light/40 truncate">
                {disabled ? "Folder ID not configured" : item.sub}
              </p>
            </div>
            {!disabled && (
              <span className="text-zunesty-green/60 text-xs">↗</span>
            )}
          </div>
        );
        return disabled ? (
          <div key={item.label} title="Set the env var in Vercel to enable">
            {content}
          </div>
        ) : (
          <a
            key={item.label}
            href={item.url!}
            target="_blank"
            rel="noopener noreferrer"
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}
