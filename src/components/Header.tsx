import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-zunesty-green-dark/30 bg-zunesty-green-darkest/40">
      <div className="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="w-10 h-10 rounded-lg bg-zunesty-green flex items-center justify-center">
            <span className="text-zunesty-black font-bold text-lg">Z</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-zunesty-light tracking-tight">
              Zunesty
            </h1>
            <p className="text-xs text-zunesty-green-mid">
              Internal Tools
            </p>
          </div>
        </Link>
      </div>
    </header>
  );
}
