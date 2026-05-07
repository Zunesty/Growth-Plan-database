import Link from "next/link";

const tools = [
  {
    name: "Growth Plan Creator",
    description: "Generate custom MarketingOps Growth Plans from discovery call data. Powered by AI.",
    href: "/growth-plan",
    status: "Live",
  },
  {
    name: "Client Reporting",
    description: "Voice-first AI reporting tool. Merge voice dumps with Google Sheets data, refine via chat, and push to Gamma.",
    href: "/client-reporting",
    status: "Live",
  },
  {
    name: "Client Pipeline",
    description: "Track every client through onboarding, build, launch, and optimization. Surface blockers and see ownership at a glance.",
    href: "/client-pipeline",
    status: "Live",
  },
  {
    name: "Ad Generator",
    description: "Auto-generate static ad batches from Triple Whale winners. Compliance-checked and ready for James to review.",
    href: "/ad-generator",
    status: "Beta",
  },
];

export default function Home() {
  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
      <div className="mb-10">
        <h2 className="text-3xl font-bold text-zunesty-light mb-2">
          Welcome to Zunesty Tools
        </h2>
        <p className="text-zunesty-light/50">
          Select a tool below to get started.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => {
          const isComingSoon = tool.status === "Coming Soon";
          const Wrapper = isComingSoon ? "div" : Link;
          return (
            <Wrapper
              key={tool.href}
              href={isComingSoon ? undefined! : tool.href}
              className={`group rounded-xl border p-6 transition-all ${
                isComingSoon
                  ? "border-zunesty-green-dark/20 bg-zunesty-green-darkest/10 opacity-60 cursor-not-allowed"
                  : "border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 hover:border-zunesty-green/40 hover:bg-zunesty-green-darkest/40"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-lg font-semibold transition-colors ${
                  isComingSoon ? "text-zunesty-light/60" : "text-zunesty-light group-hover:text-zunesty-green"
                }`}>
                  {tool.name}
                </h3>
                <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isComingSoon
                    ? "bg-zunesty-light/5 text-zunesty-light/40 border-zunesty-light/10"
                    : "bg-zunesty-green/15 text-zunesty-green border-zunesty-green/20"
                }`}>
                  {tool.status}
                </span>
              </div>
              <p className="text-sm text-zunesty-light/50 leading-relaxed">
                {tool.description}
              </p>
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}
