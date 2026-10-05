import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/cormorant-garamond";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "./styles/global.css";
import App from "./App.jsx";
import ErrorBoundary from "./ui/ErrorBoundary.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
