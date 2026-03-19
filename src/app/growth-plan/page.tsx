"use client";

import { useState } from "react";
import GrowthPlanForm from "@/components/GrowthPlanForm";
import GrowthPlanOutput from "@/components/GrowthPlanOutput";
import type { FormData } from "@/lib/types";

export default function GrowthPlanPage() {
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
  );
}
