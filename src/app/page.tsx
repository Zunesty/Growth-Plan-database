import Link from "next/link";

const tools = [
  {
    name: "Growth Plan Creator",
    description: "Generate custom MarketingOps Growth Plans from discovery call data. Powered by AI.",
    href: "/growth-plan",
    status: "Live",
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
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group rounded-xl border border-zunesty-green-dark/30 bg-zunesty-green-darkest/20 p-6 hover:border-zunesty-green/40 hover:bg-zunesty-green-darkest/40 transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-zunesty-light group-hover:text-zunesty-green transition-colors">
                {tool.name}
              </h3>
              <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-zunesty-green/15 text-zunesty-green border border-zunesty-green/20">
                {tool.status}
              </span>
            </div>
            <p className="text-sm text-zunesty-light/50 leading-relaxed">
              {tool.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
