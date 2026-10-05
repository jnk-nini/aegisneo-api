import { Component } from "react";

/**
 * If anything in the app throws while rendering, shows a way out instead of a
 * blank page. "Start over" drops the address bar's query, in case a bad link
 * caused it.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("NEO Atlas crashed:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="crash" role="alert">
        <h1 className="wordmark">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          NEO Atlas
        </h1>
        <p>Something went wrong while drawing the atlas.</p>
        <p className="crash-note">Your saved constellations are safe on this device.</p>
        <div className="crash-actions">
          <button type="button" className="btn btn-solid" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn" href={window.location.pathname}>
            Start over
          </a>
        </div>
      </main>
    );
  }
}
