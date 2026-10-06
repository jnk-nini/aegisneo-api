import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cleanName, constellationSky, MAX_NAME } from "../lib/constellations.js";
import { buzz, canShareImages, canvasToFile, offscreenCard, saveFile } from "../lib/files.js";
import { formatDate, formatMonthDay } from "../lib/format.js";
import { matchInfo } from "../lib/match.js";
import {
  cardDescription,
  cleanFrom,
  cleanMessage,
  DEFAULT_THEME,
  drawEnvelope,
  drawPostcard,
  fileName,
  localISO,
  MAX_FROM,
  MAX_MESSAGE,
  nextOccurrence,
  postcardQuery,
  THEME_ORDER,
  THEMES,
} from "../lib/postcard.js";
import { rememberName, savedName } from "../lib/prefs.js";
import Burst from "./Burst.jsx";
import CardCanvas from "./CardCanvas.jsx";
import Menu from "./Menu.jsx";
import Modal from "./Modal.jsx";
import StepTrail from "./StepTrail.jsx";

const SWIPE_PX = 40;
const TAP_PX = 10;
// One panel of controls at a time under the card, so nothing is crowded.
const PANELS = [
  { id: "look", icon: "🎨", label: "Look" },
  { id: "words", icon: "💬", label: "Words" },
];

/** Focuses a text field with the cursor after what's there, so typing carries on from the end. */
function focusEnd(field) {
  if (!field) return;
  field.focus();
  field.setSelectionRange(field.value.length, field.value.length);
}

/** Ready-made messages, so a postcard takes one tap instead of typing. */
function presetsFor(c, replyTo) {
  if (matchInfo(c)) {
    return [
      replyTo ? `${replyTo}, look what our birthdays made ✨` : "Look what our birthdays made ✨",
      "Our stars, joined 💫",
      "Same sky, different days 🌌",
      "Cosmic match! ☄️",
    ];
  }
  if (constellationSky(c)?.mode === "date") {
    return [
      "Happy birthday! 🎂 These are your stars.",
      "Saw these stars and thought of you ✨",
      "Written in the stars, just for you 💫",
      "Real asteroids, real birthday wishes ☄️",
    ];
  }
  return [
    "Saw these stars and thought of you ✨",
    "A little piece of the sky for you 🌌",
    "Written in the stars 💫",
    "Look what flew past Earth ☄️",
  ];
}

/**
 * Make a postcard of the constellation. The card fills the screen; under it, one
 * panel at a time: Look (six colours; swiping the card works too) or Words (tap
 * for a ready-made message, or write your own). Then one big Send, with Copy
 * link, Save picture and Seal in the ⋯ beside it. Every postcard starts blank,
 * apart from the sender's name, which is remembered on this device.
 *
 * A birthday postcard can be sealed until the birthday: the link then opens
 * on a countdown, and the picture sent with it is a sealed envelope.
 * `replyTo` is the name of whoever sent the postcard this one answers.
 */
export default function PostcardComposer({ constellation, backdrop, replyTo = "", onClose }) {
  const titleId = useId();
  const canvasRef = useRef(null);
  const messageRef = useRef(null);
  const titleRef = useRef(null);
  // The pictures as they look now, ready to share straight from the tap (phones need that).
  const cardFile = useRef(null);
  const envelopeFile = useRef(null);
  const drawn = useRef(0);
  const timer = useRef(0);
  const swipe = useRef(null);
  const [title, setTitle] = useState(constellation.name);
  const [message, setMessage] = useState("");
  const [from, setFrom] = useState(savedName);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [sealed, setSealed] = useState(false);
  const [editing, setEditing] = useState(null); // null, "message" or "title"
  const [panel, setPanel] = useState("look");
  // Sent, copied or saved at least once: the step trail ticks off "Send".
  const [done, setDone] = useState(false);
  const tabsId = useId();
  const [canShare] = useState(canShareImages);
  const [busy, setBusy] = useState(false);
  // What just happened, said inside the dialog: a toast would be hidden behind it.
  const [status, setStatus] = useState("");
  const [bursts, setBursts] = useState(0);

  const presets = useMemo(() => presetsFor(constellation, replyTo), [constellation, replyTo]);
  // A birthday postcard can be sealed until the birthday comes round (not on the day itself).
  const { until, sealDay } = useMemo(() => {
    const sky = constellationSky(constellation);
    if (sky?.mode !== "date") return { until: null, sealDay: "" };
    const next = nextOccurrence(sky.date);
    return { until: next === localISO() ? null : next, sealDay: formatMonthDay(sky.date) };
  }, [constellation]);
  const canSeal = until !== null;
  const sealUntil = sealed && canSeal ? until : null;

  const card = useMemo(
    () => ({ ...constellation, name: cleanName(title, constellation.name) }),
    [constellation, title],
  );
  const words = useMemo(() => cleanMessage(message), [message]);
  const signed = useMemo(() => cleanFrom(from), [from]);
  const clean = { message: words, from: signed };
  const fields = { ...clean, theme, sealed: sealUntil };
  const link = `${window.location.origin}${window.location.pathname}${postcardQuery(card, fields)}`;
  const name = fileName(card);

  useEffect(() => rememberName(signed), [signed]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (editing === "message") focusEnd(messageRef.current);
    if (editing === "title") focusEnd(titleRef.current);
  }, [editing]);

  const draw = useCallback(
    (ctx) =>
      drawPostcard(ctx, {
        constellation: card,
        backdrop,
        message: words,
        from: signed,
        theme,
        site: window.location.host,
      }),
    [card, backdrop, words, signed, theme],
  );

  const onDrawn = useCallback(() => {
    cardFile.current = null;
    const version = ++drawn.current;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      canvasToFile(canvasRef.current, name)
        .then((file) => version === drawn.current && (cardFile.current = file))
        .catch(() => {});
    }, 300);
  }, [name]);

  const makeEnvelope = useCallback(
    () =>
      canvasToFile(
        offscreenCard((ctx) =>
          drawEnvelope(ctx, { theme, from: signed, until: sealUntil, site: window.location.host }),
        ),
        "neo-atlas-sealed-postcard.png",
      ),
    [theme, signed, sealUntil],
  );

  useEffect(() => {
    envelopeFile.current = null;
    if (!sealUntil) return undefined;
    let live = true;
    const t = setTimeout(() => {
      makeEnvelope()
        .then((file) => live && (envelopeFile.current = file))
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [sealUntil, makeEnvelope]);

  const celebrate = (text) => {
    setStatus(text);
    setDone(true);
    setBursts((n) => n + 1);
    buzz([10, 40, 14]);
  };

  const share = async () => {
    setBusy(true);
    try {
      const file = sealUntil
        ? (envelopeFile.current ?? (await makeEnvelope()))
        : (cardFile.current ?? (await canvasToFile(canvasRef.current, name)));
      await navigator.share({
        files: [file],
        title: card.name,
        text: sealUntil
          ? `A sealed postcard for you ✦ It opens on ${formatDate(sealUntil)}: ${link}`
          : `${card.name}, a NEO Atlas postcard: ${link}`,
      });
      celebrate("Sent! Your stars are on their way ✨");
    } catch (err) {
      if (err?.name !== "AbortError") setStatus("Couldn't open sharing here. Copy the link instead.");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    try {
      saveFile(cardFile.current ?? (await canvasToFile(canvasRef.current, name)));
      celebrate("Saved to your device ✨");
    } catch {
      setStatus("Couldn't make the picture in this browser.");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      celebrate(sealUntil ? "Link copied. It stays sealed until the day ✨" : "Link copied. Paste it anywhere ✨");
    } catch {
      setStatus("Couldn't copy the link in this browser.");
    }
  };

  // Each tap puts the next ready-made message on the card.
  const nextPreset = () => setMessage((m) => presets[(presets.indexOf(m) + 1) % presets.length]);

  const step = (delta) =>
    setTheme((t) => THEME_ORDER[(THEME_ORDER.indexOf(t) + delta + THEME_ORDER.length) % THEME_ORDER.length]);

  // On the card: a sideways swipe changes the look; a tap on the words or the title edits them.
  const onPointerDown = (e) => {
    swipe.current = e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
  };
  const onPointerUp = (e) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy)) return step(dx < 0 ? 1 : -1);
    if (Math.hypot(dx, dy) > TAP_PX) return;
    const box = canvasRef.current.getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height;
    if (y > 0.71) setEditing("message");
    else if (y < 0.19) setEditing("title");
  };

  const left = MAX_MESSAGE - Array.from(message).length;
  const custom = message !== "" && !presets.includes(message);

  return (
    <Modal
      onClose={() => (editing ? setEditing(null) : onClose())}
      labelledBy={titleId}
      className="postcard-modal"
    >
      <div className="composer">
        <header className="composer-top">
          <h2 id={titleId} className="sr-only">
            Your postcard
          </h2>
          <StepTrail step={done ? 4 : 2} />
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close postcard">
            ×
          </button>
        </header>

        <div className="composer-stage">
          <div
            className="composer-card"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (swipe.current = null)}
          >
            <CardCanvas
              canvasRef={canvasRef}
              draw={draw}
              label={cardDescription(card, clean)}
              onDrawn={onDrawn}
            />
            {bursts > 0 && <Burst key={bursts} />}
          </div>
        </div>

        <div className="composer-controls">
          <div className="composer-tabs" role="tablist" aria-label="Change the postcard">
            {PANELS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`${tabsId}-${p.id}`}
                aria-selected={panel === p.id}
                aria-controls={`${tabsId}-panel`}
                className="composer-tab"
                onClick={() => setPanel(p.id)}
              >
                <span aria-hidden="true">{p.icon}</span> {p.label}
              </button>
            ))}
          </div>

          <div
            id={`${tabsId}-panel`}
            role="tabpanel"
            aria-labelledby={`${tabsId}-${panel}`}
            className="composer-panel"
          >
            {panel === "look" ? (
              <>
                <div className="looks" role="radiogroup" aria-label="Look">
                  {THEME_ORDER.map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      className="look-dot"
                      aria-checked={id === theme}
                      aria-label={THEMES[id].label}
                      onClick={() => setTheme(id)}
                      style={{ "--dot": THEMES[id].bg[1], "--dot-line": THEMES[id].line }}
                    />
                  ))}
                </div>
                <p className="look-name" aria-live="polite">
                  {THEMES[theme].label}
                  <span className="look-hint"> · or swipe the card</span>
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="msg-cycle"
                  onClick={nextPreset}
                  aria-label={message ? `Message: ${message}. Tap for another` : "Add a ready-made message"}
                >
                  <span className={message ? "msg-text" : "msg-text msg-empty"}>
                    {message || "Tap for a ready-made message"}
                  </span>
                  <span className="msg-next" aria-hidden="true">
                    ↻
                  </span>
                </button>
                <button type="button" className="btn write-btn" onClick={() => setEditing("message")}>
                  <span aria-hidden="true">✎</span> {custom ? "Edit my words" : "Write my own"}
                  {signed ? ` · from ${signed}` : " & add my name"}
                </button>
              </>
            )}
          </div>

          <div className="send-row">
            <button
              type="button"
              className="btn btn-solid btn-make send-btn"
              onClick={canShare ? share : copyLink}
              disabled={busy}
            >
              <span aria-hidden="true">{sealUntil ? "🔒" : "✦"}</span>{" "}
              {canShare ? (sealUntil ? "Send sealed" : "Send") : "Copy link to send"}
            </button>
            <Menu
              label="More ways to send"
              up
              items={[
                canShare && { key: "copy", icon: "🔗", label: "Copy link", onSelect: copyLink },
                { key: "save", icon: "↓", label: "Save picture", onSelect: download },
                canSeal && {
                  key: "seal",
                  icon: "🔒",
                  label: `Seal until ${sealDay}`,
                  checked: sealed,
                  onSelect: () => setSealed((on) => !on),
                },
              ]}
            />
          </div>
          <p className="postcard-status" role="status">
            {status ||
              (sealUntil ? `Sealed: they'll get an envelope that opens on ${formatDate(sealUntil)}.` : "")}
          </p>
        </div>

        {editing && (
          <div className="editor" role="group" aria-label="Your words">
            <label className="field">
              <span>
                Message <span className="field-count num">{left}</span>
              </span>
              <textarea
                ref={messageRef}
                className="text-input text-area"
                value={message}
                maxLength={MAX_MESSAGE}
                rows={3}
                placeholder="Happy birthday! These are your stars."
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <div className="editor-pair">
              <label className="field">
                <span>From</span>
                <input
                  className="text-input"
                  value={from}
                  maxLength={MAX_FROM}
                  autoComplete="off"
                  placeholder="Your name"
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Title</span>
                <input
                  ref={titleRef}
                  className="text-input"
                  value={title}
                  maxLength={MAX_NAME}
                  autoComplete="off"
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
            </div>
            <button type="button" className="btn btn-solid" onClick={() => setEditing(null)}>
              Done
            </button>
            <p className="postcard-fine">
              Nothing is uploaded: the picture is made on this device, and your words travel inside the link.
              Your name is remembered here for next time.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
