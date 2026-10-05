import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cleanName, MAX_NAME } from "../lib/constellations.js";
import {
  cardDescription,
  cleanFrom,
  cleanMessage,
  fileName,
  MAX_FROM,
  MAX_MESSAGE,
  postcardQuery,
  THEMES,
} from "../lib/postcard.js";
import Modal from "./Modal.jsx";
import PostcardCanvas from "./PostcardCanvas.jsx";

// Whether this browser can hand an image to the phone's share sheet.
function canShareImages() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File([""], "card.png", { type: "image/png" })] }));
  } catch {
    return false;
  }
}

function saveFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Write a postcard of the constellation: a title, a message and who it's from,
 * in one of three looks. The picture is made on this device; sharing sends it
 * with a link that opens the same postcard on the site.
 *
 * `draft` keeps the message and the rest between openings; `onDraft` is told of every change.
 */
export default function PostcardComposer({ constellation, backdrop, draft, onDraft, onClose }) {
  const titleId = useId();
  const canvasRef = useRef(null);
  const fileRef = useRef(null); // the picture as it looks now, ready to share straight from the tap
  const timer = useRef(0);
  const [title, setTitle] = useState(constellation.name);
  const [message, setMessage] = useState(draft.message);
  const [from, setFrom] = useState(draft.from);
  const [theme, setTheme] = useState(draft.theme);
  const [canShare] = useState(canShareImages);
  const [busy, setBusy] = useState(false);
  // What just happened, said inside the dialog: a toast would be hidden behind it.
  const [status, setStatus] = useState("");

  const card = useMemo(
    () => ({ ...constellation, name: cleanName(title, constellation.name) }),
    [constellation, title],
  );
  const fields = { message: cleanMessage(message), from: cleanFrom(from), theme };
  const link = `${window.location.origin}${window.location.pathname}${postcardQuery(card, fields)}`;

  useEffect(() => onDraft({ message, from, theme }), [message, from, theme, onDraft]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const makeFile = useCallback(
    (name) =>
      new Promise((resolve, reject) =>
        canvasRef.current.toBlob(
          (blob) =>
            blob ? resolve(new File([blob], name, { type: "image/png" })) : reject(new Error("No image")),
          "image/png",
        ),
      ),
    [],
  );

  // Phones only open the share sheet straight from a tap, so the picture is made ahead of time.
  const name = fileName(card);
  const onDrawn = useCallback(() => {
    fileRef.current = null;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      makeFile(name)
        .then((file) => (fileRef.current = file))
        .catch(() => {});
    }, 300);
  }, [makeFile, name]);

  const currentFile = async () => fileRef.current ?? (await makeFile(name));

  const share = async () => {
    setBusy(true);
    try {
      const file = await currentFile();
      await navigator.share({
        files: [file],
        title: card.name,
        text: `${card.name}, a NEO Atlas postcard: ${link}`,
      });
    } catch (err) {
      if (err?.name !== "AbortError") setStatus("Couldn't open sharing here. Download the picture instead.");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      saveFile(await currentFile());
      setStatus("Postcard saved as a picture.");
    } catch {
      setStatus("Couldn't make the picture in this browser.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus("Link copied. It opens this postcard, message and all.");
    } catch {
      setStatus("Couldn't copy the link in this browser.");
    }
  };

  const left = MAX_MESSAGE - Array.from(message).length;

  return (
    <Modal onClose={onClose} labelledBy={titleId} className="postcard-modal">
      <div className="postcard-layout">
        <div className="postcard-preview">
          <PostcardCanvas
            canvasRef={canvasRef}
            constellation={card}
            backdrop={backdrop}
            message={fields.message}
            from={fields.from}
            theme={theme}
            label={cardDescription(card, fields)}
            onDrawn={onDrawn}
          />
        </div>

        <form className="postcard-form" onSubmit={(e) => e.preventDefault()}>
          <div className="postcard-head">
            <h2 id={titleId}>Make a postcard</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close postcard">
              ×
            </button>
          </div>

          <label className="field">
            <span>Title</span>
            <input
              className="text-input"
              value={title}
              maxLength={MAX_NAME}
              autoComplete="off"
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field">
            <span>
              Message <span className="field-count num">{left}</span>
            </span>
            <textarea
              className="text-input text-area"
              value={message}
              maxLength={MAX_MESSAGE}
              rows={3}
              placeholder="Happy birthday! These are your stars."
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label className="field">
            <span>From</span>
            <input
              className="text-input"
              value={from}
              maxLength={MAX_FROM}
              autoComplete="off"
              placeholder="Your name (optional)"
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <fieldset className="field theme-pick">
            <legend>Look</legend>
            {Object.entries(THEMES).map(([id, t]) => (
              <label key={id}>
                <input
                  type="radio"
                  name={`${titleId}-theme`}
                  value={id}
                  checked={theme === id}
                  onChange={() => setTheme(id)}
                />
                <span>
                  <i
                    className="swatch"
                    style={{ background: t.bg[1], borderColor: t.line }}
                    aria-hidden="true"
                  />
                  {t.label}
                </span>
              </label>
            ))}
          </fieldset>

          <div className="postcard-actions">
            {canShare ? (
              <button type="button" className="btn btn-solid" onClick={share} disabled={busy}>
                Share postcard
              </button>
            ) : (
              <button type="button" className="btn btn-solid" onClick={download}>
                Download picture
              </button>
            )}
            {canShare && (
              <button type="button" className="btn" onClick={download}>
                Download
              </button>
            )}
            <button type="button" className="btn" onClick={copyLink}>
              Copy link
            </button>
          </div>
          <p className="postcard-status" role="status">
            {status}
          </p>
          <p className="postcard-fine">
            Nothing is uploaded. The picture is made on this device, and your message travels inside the link.
          </p>
        </form>
      </div>
    </Modal>
  );
}
