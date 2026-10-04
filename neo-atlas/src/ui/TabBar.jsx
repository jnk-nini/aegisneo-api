import { useRef } from "react";

const ICONS = {
  chart: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <path d="M12 3v3M21 12h-3M12 21v-3M3 12h3" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  mine: <path d="M12 3l2.6 5.8 6.4.6-4.8 4.3 1.4 6.3L12 16.8 6.4 20l1.4-6.3L3 9.4l6.4-.6z" />,
};

/** Accessible tab list: arrow keys move between tabs, Enter/Space or tap selects. */
export default function TabBar({ tabs, active, onChange }) {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const index = tabs.findIndex((t) => t.id === active);
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = tabs[(index + 1) % tabs.length];
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = tabs[(index - 1 + tabs.length) % tabs.length];
    if (e.key === "Home") next = tabs[0];
    if (e.key === "End") next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  return (
    <nav className="tabs" aria-label="Views">
      <div role="tablist" aria-orientation="horizontal" onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => (refs.current[tab.id] = el)}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={tab.id === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={tab.id === active ? 0 : -1}
            className="tab"
            onClick={() => onChange(tab.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="tab-icon">
              {ICONS[tab.id]}
            </svg>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
