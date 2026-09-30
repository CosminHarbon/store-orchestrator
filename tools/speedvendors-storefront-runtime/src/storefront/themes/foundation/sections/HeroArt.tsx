import { useId } from 'react';

/** Category-neutral abstract hero artwork (arch, slab, sphere, orbit). */
export default function HeroArt() {
  const uid = useId().replace(/:/g, '');
  const bg = `fdA-bg-${uid}`;
  const slab = `fdA-slab-${uid}`;
  const arch = `fdA-arch-${uid}`;
  const sphere = `fdA-sphere-${uid}`;
  const shadow = `fdA-shadow-${uid}`;
  return (
    <svg className="fd-art" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f2f7" />
          <stop offset="1" stopColor="#e9e1ec" />
        </linearGradient>
        <linearGradient id={slab} x1="0" x2="1">
          <stop offset="0" stopColor="#efe8e0" />
          <stop offset=".55" stopColor="#e2d7cb" />
          <stop offset="1" stopColor="#cdbfb1" />
        </linearGradient>
        <linearGradient id={arch} x1="0" x2="1">
          <stop offset="0" stopColor="#5e2a6b" />
          <stop offset="1" stopColor="#33123c" />
        </linearGradient>
        <radialGradient id={sphere} cx=".36" cy=".32" r=".8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".6" stopColor="#efe6f1" />
          <stop offset="1" stopColor="#cdb9d4" />
        </radialGradient>
        <radialGradient id={shadow}>
          <stop offset="0" stopColor="#230c29" stopOpacity=".22" />
          <stop offset="1" stopColor="#230c29" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="500" fill={`url(#${bg})`} />
      <rect y="372" width="400" height="128" fill="#e4dbe7" />
      <line x1="0" y1="372" x2="400" y2="372" stroke="#d3c4d9" strokeWidth="1" />
      <g className="fd-spin">
        <circle cx="210" cy="200" r="138" fill="none" stroke="#d9c6df" strokeWidth="1" />
        <circle cx="348" cy="200" r="5" fill="#4a1d55" />
      </g>
      <circle cx="210" cy="200" r="96" fill="none" stroke="#d9c6df" strokeWidth="1" strokeDasharray="2 6" />
      <g fill="#4a1d55" opacity=".5">
        <circle cx="44" cy="52" r="2" />
        <circle cx="60" cy="52" r="2" />
        <circle cx="76" cy="52" r="2" />
        <circle cx="44" cy="68" r="2" />
        <circle cx="60" cy="68" r="2" />
        <circle cx="76" cy="68" r="2" />
        <circle cx="44" cy="84" r="2" />
        <circle cx="60" cy="84" r="2" />
        <circle cx="76" cy="84" r="2" />
      </g>
      <ellipse cx="200" cy="384" rx="170" ry="14" fill={`url(#${shadow})`} />
      <path d="M78 380V262a66 66 0 0 1 132 0v118z" fill={`url(#${arch})`} />
      <rect x="222" y="190" width="96" height="190" rx="3" fill={`url(#${slab})`} />
      <rect x="222" y="190" width="96" height="6" fill="#f7f2ec" />
      <g className="fd-float-a">
        <circle cx="270" cy="142" r="44" fill={`url(#${sphere})`} />
      </g>
      <g className="fd-float-b">
        <circle cx="340" cy="330" r="16" fill="#d9c6df" />
      </g>
      <path d="M24 440h352" stroke="#d3c4d9" strokeWidth="1" strokeDasharray="1 7" />
    </svg>
  );
}

export function EditorialArt() {
  const uid = useId().replace(/:/g, '');
  const bg = `fdE-bg-${uid}`;
  const s = `fdE-s-${uid}`;
  return (
    <svg className="fd-art" viewBox="0 0 600 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5f1ec" />
          <stop offset="1" stopColor="#e8e0d7" />
        </linearGradient>
        <radialGradient id={s} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor="#7a4287" />
          <stop offset="1" stopColor="#2c0f33" />
        </radialGradient>
      </defs>
      <rect width="600" height="500" fill={`url(#${bg})`} />
      <rect x="0" y="330" width="600" height="170" fill="#e2d8cd" />
      <circle cx="410" cy="200" r="150" fill="#efe5f2" />
      <rect x="96" y="150" width="150" height="200" rx="75" fill="#d9c6df" />
      <rect x="282" y="238" width="190" height="112" rx="4" fill="#cdbfb1" />
      <g className="fd-float-a">
        <circle cx="376" cy="188" r="50" fill={`url(#${s})`} />
      </g>
      <path d="M40 420h520" stroke="#cdbfb1" strokeDasharray="1 8" />
    </svg>
  );
}

export function EditorialStamp() {
  return (
    <svg className="fd-editorial__stamp" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="49" fill="#fff" />
      <g className="fd-spin" fill="currentColor">
        <path d="M50 18l3 26 23-12-18 18 26 3-26 3 18 18-23-12-3 26-3-26-23 12 18-18-26-3 26-3-18-18 23 12z" />
      </g>
    </svg>
  );
}
