export function Logo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className={className}
    >
      <rect width="64" height="64" rx="14" fill="#2f5fd0" />
      <rect x="16" y="12" width="24" height="38" rx="3" fill="#ffffff" />
      <path d="M33 12h7l-7 8z" fill="#c9d8f8" />
      <path d="M33 12v8h7" fill="none" stroke="#a9c0f5" strokeWidth="1.4" />
      <rect x="20" y="25" width="15" height="3" rx="1.5" fill="#d3dffb" />
      <rect x="20" y="32" width="11" height="3" rx="1.5" fill="#d3dffb" />
      <rect x="20" y="39" width="13" height="3" rx="1.5" fill="#d3dffb" />
      <circle
        cx="45"
        cy="44"
        r="9.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="4.6"
      />
      <line
        x1="51.7"
        y1="50.7"
        x2="57.5"
        y2="56.5"
        stroke="#ffffff"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
