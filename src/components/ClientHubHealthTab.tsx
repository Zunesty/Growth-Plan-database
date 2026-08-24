"use client";

import { useState } from "react";
import ClientHubHealthDonuts from "@/components/ClientHubHealthDonuts";
import type { Client, TeamMember } from "@/lib/client-hub-types";

const money = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString()}`);

export default function ClientHubHealthTab({
  clients,
  team,
  onOpenClient,
}: {
  clients: Client[];
  team: TeamMember[];
  onOpenClient: (client: Client) => void;
}) {
  const [view, setView] = useState<"table" | "mix">("table");
  const active = clients.filter((c) => c.active);
  const mrrSum = active.reduce((s, c) => s + (c.mrr || 0), 0);
  const gpSum = active.reduce((s, c) => s + (c.gross_profit || 0), 0);
  const teamName = (id: number | null) => team.find((t) => t.id === id)?.name || "—";

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {(["table", "mix"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-full px-3 py-1 text-xs border transition-colors ${
              view === v ? "border-zunesty-green bg-zunesty-green/10 text-zunesty-green" : "border-zunesty-green-dark/30 text-zunesty-light/50"
            }`}
          >
            {v === "table" ? "Table" : "Mix"}
          </button>
        ))}
      </div>

      {view === "table" ? (
        <div className="overflow-x-auto rounded-lg border border-zunesty-green-dark/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zunesty-green-dark/30 text-left text-xs uppercase tracking-wider text-zunesty-light/40">
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">MRR</th>
                <th className="px-3 py-2">Gross Profit</th>
                <th className="px-3 py-2">Relationship</th>
                <th className="px-3 py-2">Delivery</th>
                <th className="px-3 py-2">Churn Risk</th>
                <th className="px-3 py-2">AR</th>
              </tr>
            </thead>
            <tbody>
              {active.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onOpenClient(c)}
                  className="border-b border-zunesty-green-dark/10 cursor-pointer hover:bg-zunesty-green-darkest/30"
                >
                  <td className="px-3 py-2 text-zunesty-light">{c.name}</td>
                  <td className="px-3 py-2 text-zunesty-light/60">{teamName(c.owner_id)}</td>
                  <td className="px-3 py-2 text-zunesty-light/60">{money(c.mrr)}</td>
                  <td className="px-3 py-2 text-zunesty-light/60">{money(c.gross_profit)}</td>
                  <td className="px-3 py-2 text-zunesty-light/60">{c.relationship || "—"}</td>
                  <td className="px-3 py-2 text-zunesty-light/60">{c.delivery_results || "—"}</td>
                  <td className="px-3 py-2 text-zunesty-light/60">{c.churn_risk || "—"}</td>
                  <td className="px-3 py-2 text-zunesty-light/60">{c.ar_risk || "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zunesty-green-dark/30 font-semibold text-zunesty-light">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2">{money(mrrSum)}</td>
                <td className="px-3 py-2">{money(gpSum)}</td>
                <td className="px-3 py-2" colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <ClientHubHealthDonuts clients={clients} />
      )}
    </div>
  );
}
