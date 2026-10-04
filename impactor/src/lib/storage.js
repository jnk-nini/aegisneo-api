// Saved scenarios live in this browser's localStorage — no database needed.
// All storage goes through this module, so it could later be swapped for a
// shared backend without touching the UI.

const KEY = "impactor.saved.v1";
const MAX_SAVED = 30;

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false; // private mode or storage full — saving is a convenience, not required
  }
}

export const savedScenarios = {
  list: read,
  add(entry) {
    const list = read().filter((s) => s.query !== entry.query);
    list.unshift({ ...entry, id: `${Date.now()}`, savedAt: new Date().toISOString() });
    return write(list) ? read() : null;
  },
  remove(id) {
    write(read().filter((s) => s.id !== id));
    return read();
  },
};
