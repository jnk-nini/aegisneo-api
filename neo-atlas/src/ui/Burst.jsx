const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
  const reach = 70 + (i % 3) * 30;
  return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, delay: (i % 4) * 0.04 };
});

/**
 * A burst of little stars and a shooting star, for a moment worth celebrating
 * (a postcard sent). Mount it with a new `key` to play it again.
 */
export default function Burst() {
  return (
    <div className="burst" aria-hidden="true">
      <span className="shooting-star" />
      {SPARKS.map((s, i) => (
        <span
          key={i}
          className="spark"
          style={{ "--x": `${s.x}px`, "--y": `${s.y}px`, animationDelay: `${s.delay}s` }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}
