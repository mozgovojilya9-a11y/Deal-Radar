/** Decorative radar sweep — the Deal Radar brand motif. Pure SVG + CSS, no JS. */
export function Radar({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="dr-sweep" x1="100" y1="100" x2="190" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a7f36b" stopOpacity=".55" />
          <stop offset="1" stopColor="#a7f36b" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="rgba(190,205,222,.18)" strokeWidth=".6">
        <circle cx="100" cy="100" r="96" />
        <circle cx="100" cy="100" r="72" />
        <circle cx="100" cy="100" r="48" />
        <circle cx="100" cy="100" r="24" />
        <path d="M100 4v192M4 100h192" />
      </g>
      <g className="sweep">
        <path d="M100 100 L196 100 A96 96 0 0 0 167.9 32.1 Z" fill="url(#dr-sweep)" />
        <path d="M100 100 L196 100" stroke="#a7f36b" strokeWidth="1" />
      </g>
      <circle className="blip" cx="150" cy="62" r="3" fill="#a7f36b" style={{ animationDelay: "-5.4s" }} />
      <circle className="blip" cx="62" cy="134" r="2.5" fill="#a7f36b" style={{ animationDelay: "-2.2s" }} />
      <circle className="blip" cx="128" cy="150" r="2" fill="#a7f36b" style={{ animationDelay: "-0.9s" }} />
    </svg>
  );
}
