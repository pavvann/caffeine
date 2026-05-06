// Icon set ported from the design package. 14×14 by default, stroke-based,
// currentColor — same shapes as caffeine/project/components/icons.jsx so
// every visual matches the prototype.

import type { CSSProperties, ReactNode, SVGProps } from "react";

type IconProps = {
  size?: number;
  strokeWidth?: number;
  fill?: string;
  className?: string;
  style?: CSSProperties;
  stroke?: string;
  children?: ReactNode;
};

function Icon({
  size = 14,
  strokeWidth = 1.5,
  fill = "none",
  className,
  style,
  stroke,
  children,
  ...rest
}: IconProps & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill={fill}
      stroke={stroke ?? "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSession = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 3.5h10M2 7h7M2 10.5h10" />
  </Icon>
);

export const IconBacklog = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="2.5" width="3" height="3" rx="0.5" />
    <rect x="2" y="8.5" width="3" height="3" rx="0.5" />
    <path d="M3.2 4l0.7 0.7L5 3.5M3.2 10l0.7 0.7L5 9.5" />
    <path d="M7 4h5M7 10h5" />
  </Icon>
);

export const IconPipeline = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="3" cy="3.5" r="1.2" />
    <circle cx="11" cy="3.5" r="1.2" />
    <circle cx="7" cy="10.5" r="1.2" />
    <path d="M4.2 3.5h5.6M3.6 4.5l3 5M10.4 4.5l-3 5" />
  </Icon>
);

export const IconState = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 2.5h6l2 2v7H3z" />
    <path d="M9 2.5v2h2" />
    <path d="M5 7.5h4M5 9.5h3" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="1.6" />
    <path d="M7 1.5v1.5M7 11v1.5M1.5 7H3M11 7h1.5M3.1 3.1l1 1M9.9 9.9l1 1M3.1 10.9l1-1M9.9 4.1l1-1" />
  </Icon>
);

export const IconPlay = (p: IconProps) => (
  <Icon {...p} fill="currentColor">
    <path d="M4 3l7 4-7 4z" />
  </Icon>
);

export const IconPause = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="3" width="2" height="8" />
    <rect x="8" y="3" width="2" height="8" />
  </Icon>
);

export const IconStop = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" />
  </Icon>
);

export const IconSend = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 7l10-5-3 11-2.5-4.5L2 7z" />
  </Icon>
);

export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3l4 4-4 4" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 7.5l2.5 2.5L11 4" />
  </Icon>
);

export const IconFolder = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 4l1.5-1.5h3L8 4h4v7H2z" />
  </Icon>
);

export const IconFile = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 2h5l3 3v7H3z M8 2v3h3" />
  </Icon>
);

export const IconBolt = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <path d="M8 1L3 8h3l-1 5 5-7H7l1-5z" />
  </Icon>
);

export const IconTerminal = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 3.5l3 3-3 3M6 10h6" />
    <rect x="1" y="2" width="12" height="10" rx="0.5" />
  </Icon>
);

export const IconEye = (p: IconProps) => (
  <Icon {...p}>
    <path d="M1 7s2-3.5 6-3.5S13 7 13 7s-2 3.5-6 3.5S1 7 1 7z" />
    <circle cx="7" cy="7" r="1.5" />
  </Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 2.5l2.5 2.5L4 12.5H1.5V10L9 2.5z" />
  </Icon>
);

export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 1.5L2 3v4c0 3 2.5 5 5 5.5 2.5-0.5 5-2.5 5-5.5V3L7 1.5z" />
  </Icon>
);

export const IconBeaker = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 1.5h4M6 1.5v4l-3 5.5c-0.5 1 0 1.5 1 1.5h6c1 0 1.5-0.5 1-1.5L8 5.5v-4" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2 7h10M8 3l4 4-4 4" />
  </Icon>
);

export const IconCpu = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="8" height="8" rx="0.5" />
    <rect x="5" y="5" width="4" height="4" />
    <path d="M5 1v2M9 1v2M5 11v2M9 11v2M1 5h2M1 9h2M11 5h2M11 9h2" />
  </Icon>
);

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="5" />
    <path d="M7 4v3l2 1.5" />
  </Icon>
);

export const IconDollar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 1.5v11M10 4H6a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H4" />
  </Icon>
);

export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 2v10M2 7h10" />
  </Icon>
);

export const IconDrag = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="3.5" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="9" cy="3.5" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="5" cy="7" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="9" cy="7" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="5" cy="10.5" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="9" cy="10.5" r="0.6" fill="currentColor" stroke="none" />
  </Icon>
);

// Möbius header glyph. The design ships three variants (knot/twist/tri).
// We render the "knot" variant — sharpest and most legible at 16px.
export function Mobius({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M3.5 6.5 C 3.5 4, 6 3, 8 5 C 10 7, 12.5 6, 12.5 8.5 C 12.5 11, 10 12, 8 10 C 6 8, 3.5 9, 3.5 6.5 Z"
        stroke="#10b981"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="5" r="0.9" fill="#10b981" />
    </svg>
  );
}
