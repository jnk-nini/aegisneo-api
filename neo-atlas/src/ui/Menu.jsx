import { useEffect, useId, useRef, useState } from "react";

/**
 * A round "⋯" button holding a screen's extra actions, so the screen itself
 * shows only its main one. The list closes on Escape, a tap elsewhere, or a pick.
 *
 * `items`: [{ key, icon, label, onSelect, checked?, disabled? }]; falsy entries
 * are skipped. An item with `checked` is a toggle and shows a tick when on.
 * `up` opens the list above the button (for buttons near the bottom of the screen).
 */
export default function Menu({ label, items, up = false, className = "" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const listId = useId();
  const shown = items.filter(Boolean);

  useEffect(() => {
    if (!open) return undefined;
    const root = rootRef.current;
    const entries = () => [...root.querySelectorAll(".menu-item:not(:disabled)")];
    entries()[0]?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        // Only the list closes, not a dialog it sits in.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const list = entries();
      const at = list.indexOf(document.activeElement);
      const step = e.key === "ArrowDown" ? 1 : -1;
      list[(at + step + list.length) % list.length]?.focus();
    };
    const onDown = (e) => !root.contains(e.target) && setOpen(false);
    root.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      root.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (shown.length === 0) return null;

  return (
    <div className={`menu${up ? " menu-up" : ""} ${className}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      {open && (
        <div id={listId} role="menu" aria-label={label} className="menu-list">
          {shown.map((item) => (
            <button
              key={item.key}
              type="button"
              role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={item.checked}
              className="menu-item"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              <span className="menu-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="menu-label">{item.label}</span>
              {item.checked !== undefined && (
                <span className="menu-check" aria-hidden="true">
                  {item.checked ? "✓" : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
