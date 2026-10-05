import { useId } from "react";
import { cardDescription } from "../lib/postcard.js";
import Modal from "./Modal.jsx";
import PostcardCanvas from "./PostcardCanvas.jsx";

/**
 * A postcard someone sent as a link. Its message and name were typed by the
 * sender, so they are only ever shown as plain text, and said to be theirs.
 */
export default function PostcardReceived({ constellation, backdrop, postcard, onExplore, onMakeOwn }) {
  const titleId = useId();
  const { message, from, theme } = postcard;

  return (
    <Modal onClose={onExplore} labelledBy={titleId} className="postcard-modal">
      <div className="postcard-layout">
        <div className="postcard-preview">
          <PostcardCanvas
            constellation={constellation}
            backdrop={backdrop}
            message={message}
            from={from}
            theme={theme}
            label={cardDescription(constellation, { message, from })}
          />
        </div>

        <div className="postcard-form">
          <p className="eyebrow">You&rsquo;ve got a postcard</p>
          <h2 id={titleId} className="received-title">
            {from ? `From ${from}` : "A postcard from the stars"}
          </h2>
          <p className="received-text">
            <strong>{constellation.name}</strong> is drawn between real near-Earth asteroids from the AegisNEO
            catalog. Open it on the chart to see each one up close.
          </p>
          {(message || from) && (
            <p className="postcard-fine">The name and message were written by whoever sent you this link.</p>
          )}
          <div className="postcard-actions">
            <button type="button" className="btn btn-solid" onClick={onExplore}>
              See it on the chart
            </button>
            <button type="button" className="btn" onClick={onMakeOwn}>
              <span aria-hidden="true">✦</span> Make your own
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
