/**
 * BrandLint mark: lines of content on a violet tile, the last line turning into a
 * lime check. "Content, checked." The check redraws on hover of the parent `.group`.
 */
export function LogoMark({ size = 30, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`logo-mark ${className}`} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#7C5CFF" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.18" />
      <path d="M8.5 10.5h15" stroke="#F4F3FA" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8.5 16h9" stroke="#F4F3FA" strokeOpacity="0.7" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8.5 21.5h3" stroke="#F4F3FA" strokeOpacity="0.45" strokeWidth="2.6" strokeLinecap="round" />
      <path className="logo-check" d="M15.5 21l3.2 3.2L25 16.8" fill="none" stroke="#C6F432" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[17px] font-semibold tracking-[-0.035em] text-white">
        Brand<span className="text-lime">Lint</span>
      </span>
    </span>
  );
}
