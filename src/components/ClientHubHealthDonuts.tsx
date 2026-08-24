"use client";

import type { Client } from "@/lib/client-hub-types";

const COLORS = ["#7bbd53", "#29804b", "#a3d977", "#4d9d6a", "#294e27", "#182a14"];

function Donut({ title, counts }: { title: string; counts: { label: string; value: number }[] }) {
  const total = counts.reduce((s, c) => s + c.value, 0);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="rounded-lg border border-zunesty-green-dark/30 bg-zunesty-green-darkest/10 p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-zunesty-light/50 mb-3">{title}</div>
      <div className="flex items-center gap-4">
        <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0 -rotate-90">
          {total === 0 ? (
            <circle cx="50" cy="50" r={radius} fill="none" stroke="#ffffff15" strokeWidth="14" />
          ) : (
            counts.map((c, i) => {
              if (!c.value) return null;
              const frac = c.value / total;
              const dash = frac * circumference;
              const el = (
                <circle
                  key={c.label}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth="14"
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += dash;
              return el;
            })
          )}
        </svg>
        <div className="space-y-1">
          {counts.map((c, i) => (
            <div key={c.label} className="flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="text-zunesty-light/60">
                {c.label} <span className="text-zunesty-light/30">({c.value})</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function tally(clients: Client[], field: keyof Client, labels: string[]) {
  return labels.map((label) => ({ label, value: clients.filter((c) => c[field] === label).length }));
}

export default function ClientHubHealthDonuts({ clients }: { clients: Client[] }) {
  const active = clients.filter((c) => c.active);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Donut title="Relationship" counts={tally(active, "relationship", ["Strong", "Moderate", "Weak"])} />
      <Donut title="Delivery Results" counts={tally(active, "delivery_results", ["Strong", "Moderate", "Weak"])} />
      <Donut title="Churn Risk" counts={tally(active, "churn_risk", ["Low", "Medium", "High"])} />
      <Donut title="AR Risk" counts={tally(active, "ar_risk", ["Current", "Past Due"])} />
      <Donut title="Account Type" counts={tally(active, "account_type", ["SMB", "Mid-Market", "Enterprise"])} />
    </div>
  );
}
