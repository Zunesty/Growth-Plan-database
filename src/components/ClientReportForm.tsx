"use client";

import type { ClientConfig, ClientField } from "@/lib/reporting-types";

type Props = {
  client: ClientConfig;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

function Field({
  field,
  value,
  onChange,
}: {
  field: ClientField;
  value: string;
  onChange: (v: string) => void;
}) {
  const baseClasses =
    "w-full rounded-lg border border-zunesty-green-dark/40 bg-zunesty-green-darkest/30 py-2.5 text-sm text-zunesty-light placeholder:text-zunesty-light/25 focus:border-zunesty-green focus:outline-none focus:ring-1 focus:ring-zunesty-green/30 transition-colors";

  if (field.type === "textarea") {
    return (
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-zunesty-light/70 mb-1.5">
          {field.label}
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className={`${baseClasses} px-3 resize-y`}
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs font-medium text-zunesty-light/70 mb-1.5">
        {field.label}
      </label>
      <div className="relative">
        {field.type === "currency" && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zunesty-light/40 text-sm pointer-events-none">
            $
          </span>
        )}
        <input
          type={field.type === "text" ? "text" : "number"}
          inputMode={field.type === "text" ? "text" : "decimal"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={`${baseClasses} ${
            field.type === "currency" ? "pl-7 pr-3" : "px-3"
          } ${field.type === "percent" ? "pr-8" : ""}`}
        />
        {field.type === "percent" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zunesty-light/40 text-sm pointer-events-none">
            %
          </span>
        )}
      </div>
    </div>
  );
}

export default function ClientReportForm({ client, values, onChange }: Props) {
  return (
    <div className="space-y-8">
      {client.sections.map((section) => (
        <div key={section.title}>
          <div className="mb-4 pb-2 border-b border-zunesty-green-dark/20">
            <h3 className="text-sm font-semibold text-zunesty-green uppercase tracking-wider">
              {section.title}
            </h3>
            {section.description && (
              <p className="text-xs text-zunesty-light/40 mt-1">{section.description}</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {section.fields.map((field) => (
              <Field
                key={field.key}
                field={field}
                value={values[field.key] || ""}
                onChange={(v) => onChange(field.key, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
