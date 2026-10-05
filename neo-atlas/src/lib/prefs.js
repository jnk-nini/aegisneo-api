// Small things remembered on this device only, in localStorage.

const NAME_KEY = "neo-atlas:from";

/** The name last signed on a postcard, so the next one is signed already. */
export function savedName() {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name) {
  try {
    if (name) window.localStorage.setItem(NAME_KEY, name);
    else window.localStorage.removeItem(NAME_KEY);
  } catch {
    // Storage refused: the name just isn't remembered.
  }
}
