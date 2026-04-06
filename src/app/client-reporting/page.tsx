import Link from "next/link";

export default function ClientReportingPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full px-6 py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-zunesty-green-darkest/40 border border-zunesty-green-dark/30 flex items-center justify-center mb-6">
        <svg className="w-8 h-8 text-zunesty-green/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
      </div>
      <h2 className="text-2xl font-semibold text-zunesty-light mb-3">
        Client Reporting
      </h2>
      <p className="text-zunesty-light/40 mb-2">Under Construction</p>
      <p className="text-sm text-zunesty-light/30 mb-8 max-w-md leading-relaxed">
        Voice-first AI reporting tool. Record a voice dump about your client, pull metrics from Google Sheets, refine via chat, and push a polished report to Gamma.
      </p>
      <Link
        href="/"
        className="rounded-lg border border-zunesty-green-dark/40 px-5 py-2.5 text-sm text-zunesty-light/50 hover:text-zunesty-light hover:border-zunesty-green-dark transition-colors"
      >
        &larr; Back to Tools
      </Link>
    </div>
  );
}
