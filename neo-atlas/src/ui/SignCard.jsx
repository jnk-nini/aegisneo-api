import { useCallback, useEffect, useId, useRef, useState } from "react";
import { buzz, canShareImages, canvasToFile, saveFile } from "../lib/files.js";
import { drawSignCard, signDescription, signFileName } from "../lib/signcard.js";
import Burst from "./Burst.jsx";
import CardCanvas from "./CardCanvas.jsx";
import Modal from "./Modal.jsx";

/**
 * "Your asteroid sign": a horoscope-style card from the biggest asteroid of a
 * birthday's sky, to share or save. Real numbers, made-up meanings; it says so.
 */
export default function SignCard({ sign, date, onClose, onPostcard }) {
  const titleId = useId();
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const timer = useRef(0);
  const [canShare] = useState(canShareImages);
  const [status, setStatus] = useState("");
  const [bursts, setBursts] = useState(0);
  const name = signFileName(sign);

  useEffect(() => () => clearTimeout(timer.current), []);

  const draw = useCallback(
    (ctx) => drawSignCard(ctx, { sign, date, site: window.location.host }),
    [sign, date],
  );
  const onDrawn = useCallback(() => {
    fileRef.current = null;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      canvasToFile(canvasRef.current, name)
        .then((file) => (fileRef.current = file))
        .catch(() => {});
    }, 300);
  }, [name]);

  const celebrate = (text) => {
    setStatus(text);
    setBursts((n) => n + 1);
    buzz([10, 40, 14]);
  };

  const share = async () => {
    try {
      const file = fileRef.current ?? (await canvasToFile(canvasRef.current, name));
      await navigator.share({
        files: [file],
        title: `I'm ${sign.title}`,
        text: `My asteroid sign is ${sign.title}. What's yours? ${window.location.origin}`,
      });
      celebrate("Shared! ✨");
    } catch (err) {
      if (err?.name !== "AbortError") setStatus("Couldn't open sharing here. Save the picture instead.");
    }
  };

  const download = async () => {
    try {
      saveFile(fileRef.current ?? (await canvasToFile(canvasRef.current, name)));
      celebrate("Saved to your device ✨");
    } catch {
      setStatus("Couldn't make the picture in this browser.");
    }
  };

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="postcard-modal">
      <div className="composer">
        <header className="composer-top">
          <h2 id={titleId}>Your asteroid sign</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close asteroid sign">
            ×
          </button>
        </header>
        <div className="composer-stage">
          <div className="composer-card">
            <CardCanvas canvasRef={canvasRef} draw={draw} label={signDescription(sign, date)} onDrawn={onDrawn} />
            {bursts > 0 && <Burst key={bursts} />}
          </div>
        </div>
        <div className="composer-controls">
          <p className="sign-note">
            Made from the biggest real asteroid that passed on your birthday. The meanings are made up: just for
            fun.
          </p>
          <div className="send-row">
            {canShare ? (
              <button type="button" className="btn btn-solid btn-make send-btn" onClick={share}>
                <span aria-hidden="true">✦</span> Share my sign
              </button>
            ) : (
              <button type="button" className="btn btn-solid btn-make send-btn" onClick={download}>
                <span aria-hidden="true">✦</span> Save my sign
              </button>
            )}
            {canShare && (
              <button type="button" className="btn btn-small" onClick={download}>
                Save picture
              </button>
            )}
            <button type="button" className="btn btn-small" onClick={onPostcard}>
              Make a postcard
            </button>
          </div>
          <p className="postcard-status" role="status">
            {status}
          </p>
        </div>
      </div>
    </Modal>
  );
}
