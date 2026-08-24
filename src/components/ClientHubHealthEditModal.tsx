"use client";

import { useState } from "react";
import { api } from "@/lib/client-hub-fetch";
import type { AccountType, ArRisk, ChurnRisk, Client, Relationship, TeamMember } from "@/lib/client-hub-types";

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | "";
  onChange: (v: T | "") => void;
  options: T[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zunesty-light/60 mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T | "")}
        className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zunesty-light/60 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
      />
    </label>
  );
}

export default function ClientHubHealthEditModal({
  client,
  team,
  onClose,
  onSaved,
  toast,
}: {
  client: Client;
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  toast: (text: string, kind?: "ok" | "err") => void;
}) {
  const [ownerId, setOwnerId] = useState<string>(client.owner_id ? String(client.owner_id) : "");
  const [mrr, setMrr] = useState(client.mrr != null ? String(client.mrr) : "");
  const [grossProfit, setGrossProfit] = useState(client.gross_profit != null ? String(client.gross_profit) : "");
  const [relationship, setRelationship] = useState<Relationship | "">(client.relationship || "");
  const [deliveryResults, setDeliveryResults] = useState<Relationship | "">(client.delivery_results || "");
  const [churnRisk, setChurnRisk] = useState<ChurnRisk | "">(client.churn_risk || "");
  const [accountType, setAccountType] = useState<AccountType | "">(client.account_type || "");
  const [arRisk, setArRisk] = useState<ArRisk | "">(client.ar_risk || "");
  const [startDate, setStartDate] = useState(client.start_date || "");
  const [renewalDate, setRenewalDate] = useState(client.renewal_date || "");
  const [contractUrl, setContractUrl] = useState(client.contract_url || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api("PATCH", `/api/client-hub/clients/${client.id}`, {
        owner_id: ownerId ? Number(ownerId) : null,
        mrr: mrr ? Number(mrr) : null,
        gross_profit: grossProfit ? Number(grossProfit) : null,
        relationship: relationship || null,
        delivery_results: deliveryResults || null,
        churn_risk: churnRisk || null,
        account_type: accountType || null,
        ar_risk: arRisk || null,
        start_date: startDate || null,
        renewal_date: renewalDate || null,
        contract_url: contractUrl || null,
      });
      toast("Client health updated");
      await onSaved();
    } catch (e) {
      toast((e as Error).message, "err");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border border-zunesty-green-dark/40 bg-zunesty-black p-5 max-h-[85vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-zunesty-light">{client.name}</h3>
            <button onClick={onClose} className="text-zunesty-light/60 hover:text-zunesty-light">
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="block text-xs font-medium text-zunesty-light/60 mb-1">Owner</span>
              <select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-3 py-2 text-sm text-zunesty-light focus:border-zunesty-green focus:outline-none"
              >
                <option value="">Unassigned</option>
                {team.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="MRR ($)" value={mrr} onChange={setMrr} type="number" />
            <TextField label="Gross Profit ($)" value={grossProfit} onChange={setGrossProfit} type="number" />
            <Select label="Relationship" value={relationship} onChange={setRelationship} options={["Strong", "Moderate", "Weak"]} />
            <Select label="Delivery Results" value={deliveryResults} onChange={setDeliveryResults} options={["Strong", "Moderate", "Weak"]} />
            <Select label="Churn Risk" value={churnRisk} onChange={setChurnRisk} options={["Low", "Medium", "High"]} />
            <Select label="Account Type" value={accountType} onChange={setAccountType} options={["SMB", "Mid-Market", "Enterprise"]} />
            <Select label="AR Risk" value={arRisk} onChange={setArRisk} options={["Current", "Past Due"]} />
            <TextField label="Start Date" value={startDate} onChange={setStartDate} type="date" />
            <TextField label="Renewal Date" value={renewalDate} onChange={setRenewalDate} type="date" />
          </div>
          <div className="mb-5">
            <TextField label="Contract URL" value={contractUrl} onChange={setContractUrl} />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-zunesty-green px-4 py-2 text-sm font-semibold text-zunesty-black hover:bg-zunesty-green/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} className="rounded-lg border border-zunesty-green-dark/40 px-4 py-2 text-sm text-zunesty-light/70">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
