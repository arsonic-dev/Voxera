interface VoxeraLogoProps {
  size?: number;
  className?: string;
}

export default function VoxeraLogo({ size = 22, className = '' }: VoxeraLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="vox-grad-left" x1="4" y1="5" x2="16" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FF7A50" />
          <stop offset="100%" stopColor="#FF3D00" />
        </linearGradient>
        <linearGradient id="vox-grad-right" x1="28" y1="5" x2="16" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <linearGradient id="vox-core-grad" x1="16" y1="10" x2="16" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E2E8F0" />
        </linearGradient>
        <filter id="vox-glow" x="12" y="8" width="8" height="16" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#FF7A50" floodOpacity="0.5" />
        </filter>
      </defs>

      {/* Left Wing - Vocal Stream 1 */}
      <path
        d="M5 6.5L16 26.5V20.5L9.5 8.5H5V6.5Z"
        fill="url(#vox-grad-left)"
      />
      {/* Left Audio Wavelet */}
      <rect x="2" y="10" width="2" height="7" rx="1" fill="#FF5722" opacity="0.9" />

      {/* Right Wing - Vocal Stream 2 */}
      <path
        d="M27 6.5L16 26.5V20.5L22.5 8.5H27V6.5Z"
        fill="url(#vox-grad-right)"
      />
      {/* Right Audio Wavelet */}
      <rect x="28" y="10" width="2" height="7" rx="1" fill="#0284C7" opacity="0.9" />

      {/* Central Resonant Waveform Bar */}
      <rect
        x="14.5"
        y="10.5"
        width="3"
        height="9"
        rx="1.5"
        fill="url(#vox-core-grad)"
        filter="url(#vox-glow)"
      />
      <circle cx="16" cy="6.5" r="1.5" fill="#FFFFFF" />
    </svg>
  );
}
