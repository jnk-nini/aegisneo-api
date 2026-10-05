import { useEffect, useRef } from "react";

/**
 * A modal <dialog>, which keeps focus inside. Escape and a tap on the backdrop
 * call `onClose`. Mount it only while it should be open.
 */
export default function Modal({ onClose, labelledBy, className = "", children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.open && dialog.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault(); // Escape: close through the same path as the buttons
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {children}
    </dialog>
  );
}
