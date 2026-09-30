export default function Marquee({ items }: { items: string[] }) {
  if (!items.length) return null;
  const list = (
    <ul className="fd-marquee__group">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <div className="fd-marquee">
      <div className="fd-marquee__track">
        {list}
        <ul className="fd-marquee__group" aria-hidden="true">
          {items.map((item) => (
            <li key={`dup-${item}`}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
