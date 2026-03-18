"use client";

import { useState } from "react";
import GrowthPlanForm from "@/components/GrowthPlanForm";
import GrowthPlanOutput from "@/components/GrowthPlanOutput";

export type FormData = {
  salespersonName: string;
  prospectFirstName: string;
  prospectLastName: string;
  prospectCompany: string;
  interviewTranscript: string;
  discoveryTranscript: string;
  whatDoTheySell: string;
  icp: string;
  avgContractValue: string;
  biggestProblem: string;
  whatTheyDontWant: string;
  currentState: string;
  endState: string;
};

export default function Home() {
  const [growthPlan, setGrowthPlan] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async (data: FormData) => {
    setFormData(data);
    setIsGenerating(true);
    setGrowthPlan("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate growth plan");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          fullText += chunk;
          setGrowthPlan(fullText);
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong");
      setGrowthPlan(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    setGrowthPlan(null);
    setFormData(null);
  };

  return (
    <main className="flex-1 flex flex-col">
      {/* Header */}
      <header className="border-b border-zunesty-green-dark/30 bg-zunesty-green-darkest/40">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zunesty-green flex items-center justify-center">
            <span className="text-zunesty-black font-bold text-lg">Z</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zunesty-light tracking-tight">
              Zunesty Growth Plan Creator
            </h1>
            <p className="text-xs text-zunesty-green-mid">
              MarketingOps Growth Plan Generator
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        {growthPlan === null && !isGenerating ? (
          <GrowthPlanForm onSubmit={handleGenerate} />
        ) : (
          <GrowthPlanOutput
            plan={growthPlan || ""}
            isGenerating={isGenerating}
            formData={formData!}
            onBack={handleBack}
            onUpdatePlan={setGrowthPlan}
          />
        )}
      </div>
    </main>
  );
}
