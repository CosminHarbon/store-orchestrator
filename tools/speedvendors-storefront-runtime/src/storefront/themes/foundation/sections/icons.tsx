import type { WhyCardIcon } from '../../../contentSlots';

export function WhyIcon({ icon }: { icon: WhyCardIcon }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    focusable: false as const,
  };
  if (icon === 'art') {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="5" />
        <rect x="11" y="11" width="9" height="9" rx="1.5" />
      </svg>
    );
  }
  if (icon === 'secure') {
    return (
      <svg {...common}>
        <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" />
      </svg>
    );
  }
  if (icon === 'ship') {
    return (
      <svg {...common}>
        <path d="M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z" />
        <path d="M3.5 7.5 12 11.5l8.5-4M12 11.5v9" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}

export function EmptyMark() {
  return (
    <svg
      className="fd-empty__mark"
      viewBox="0 0 88 88"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="44" cy="44" r="43" strokeOpacity=".25" />
      <path d="M26 66V42a18 18 0 0 1 36 0v24" />
      <path d="M18 66h52" strokeDasharray="2 4" />
      <circle cx="44" cy="30" r="6" fill="currentColor" fillOpacity=".15" />
    </svg>
  );
}

export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
