"use client";

import { useState } from "react";
import type { FormData } from "@/lib/types";

const FIELDS: { key: keyof FormData; label: string; type: "text" | "textarea"; required: boolean; placeholder: string }[] = [
  { key: "salespersonName", label: "Salesperson Full Name", type: "text", required: true, placeholder: "e.g. John Smith" },
  { key: "prospectFirstName", label: "Prospect First Name", type: "text", required: true, placeholder: "e.g. Sarah" },
  { key: "prospectLastName", label: "Prospect Last Name", type: "text", required: true, placeholder: "e.g. Johnson" },
  { key: "prospectCompany", label: "Prospect Company Name", type: "text", required: true, placeholder: "e.g. Acme Corp" },
  { key: "interviewTranscript", label: "Interview Call Transcript (Optional)", type: "textarea", required: false, placeholder: "Paste transcript from Fathom..." },
  { key: "discoveryTranscript", label: "Discovery Call Transcript", type: "textarea", required: true, placeholder: "Paste your discovery call transcript from Fathom..." },
  { key: "whatDoTheySell", label: "What Does This Business Sell?", type: "textarea", required: true, placeholder: "Describe their products/services..." },
  { key: "icp", label: "Who Is Their ICP?", type: "textarea", required: true, placeholder: "Describe their ideal customer profile..." },
  { key: "avgContractValue", label: "What Is Their Average Contract Value?", type: "text", required: true, placeholder: "e.g. $5,000/month" },
  { key: "biggestProblem", label: "What Is Their Biggest Problem From the Sales Call?", type: "textarea", required: true, placeholder: "Describe the main pain point..." },
  { key: "whatTheyDontWant", label: "What Do They Not Want to Do?", type: "textarea", required: true, placeholder: "e.g. They don't want to do cold calling..." },
  { key: "currentState", label: "What Is Their Current State?", type: "textarea", required: true, placeholder: "Where are they now?..." },
  { key: "endState", label: "What Is Their End State?", type: "textarea", required: true, placeholder: "Where do they want to be?..." },
];

const INITIAL: FormData = {
  salespersonName: "", prospectFirstName: "", prospectLastName: "",
  prospectCompany: "", interviewTranscript: "", discoveryTranscript: "",
  whatDoTheySell: "", icp: "", avgContractValue: "", biggestProblem: "",
  whatTheyDontWant: "", currentState: "", endState: "",
};

export default function GrowthPlanForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  const [form, setForm] = useState<FormData>(INITIAL);

  const update = (key: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-zunesty-light mb-2">
          Enter the Information Below to Create Your Proposal.
        </h2>
        <p className="text-sm text-zunesty-light/50">
          Fill in the details from your discovery call to generate a customized growth plan.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {FIELDS.map(({ key, label, type, required, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-zunesty-light/80 mb-1.5">
              {label}
              {required && <span className="text-zunesty-green ml-1">*</span>}
            </label>
            {type === "textarea" ? (
              <textarea
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
                required={required}
                placeholder={placeholder}
                rows={key === "discoveryTranscript" || key === "interviewTranscript" ? 6 : 3}
                className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors resize-y"
              />
            ) : (
              <input
                type="text"
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
                required={required}
                placeholder={placeholder}
                className="w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 px-4 py-3 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors"
              />
            )}
          </div>
        ))}

        <div className="pt-4">
          <button
            type="submit"
            className="w-full rounded-lg bg-zunesty-green px-6 py-3.5 text-sm font-semibold text-zunesty-black uppercase tracking-wider hover:bg-zunesty-green/90 transition-colors focus:outline-none focus:ring-2 focus:ring-zunesty-green/50 focus:ring-offset-2 focus:ring-offset-zunesty-black"
          >
            Generate Growth Plan
          </button>
        </div>
      </form>
    </div>
  );
}
