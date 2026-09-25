// EDITABLE presentation marquee.
export interface MarqueeProps {
  items: string[];
}

export default function Marquee({ items }: MarqueeProps) {
  if (!items.length) return null;
  const loop = [...items, ...items];
  return (
    <div className="sf-marquee" id="marquee" aria-hidden="true">
      <div className="sf-marquee__track">
        {loop.map((item, i) => (
          <span key={`${item}-${i}`}>
            {item}
            <i> ✦ </i>
          </span>
        ))}
      </div>
    </div>
  );
}
