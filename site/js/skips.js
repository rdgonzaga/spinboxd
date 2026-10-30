import { firebaseConfig } from "./firebase-config.js";
import { parseCachedSkips } from "./pool.js";

const SDK = "https://www.gstatic.com/firebasejs/11.10.0";
const CACHE = "spinboxd.skips";

function readCache() {
  try {
    return parseCachedSkips(localStorage.getItem(CACHE));
  } catch {
    return new Set();
  }
}

function writeCache(slugs) {
  try {
    localStorage.setItem(CACHE, JSON.stringify([...slugs]));
  } catch {}
}

// Calls onChange(slugs, enabled) right away with the cached set, then again on every
// Firestore snapshot. If Firebase can't load or read, enabled stays false and the cache is used.
export function initSkips(onChange) {
  let skipped = readCache();
  let enabled = false;
  let write = null;

  const emit = () => onChange(skipped, enabled);
  emit();

  (async () => {
    try {
      const [{ initializeApp }, fs] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const db = fs.getFirestore(initializeApp(firebaseConfig));
      const col = fs.collection(db, "skips");
      write = {
        add: (slug) => fs.setDoc(fs.doc(db, "skips", slug), { at: fs.serverTimestamp() }),
        remove: (slug) => fs.deleteDoc(fs.doc(db, "skips", slug)),
      };
      fs.onSnapshot(
        col,
        (snap) => {
          skipped = new Set(snap.docs.map((d) => d.id));
          enabled = true;
          writeCache(skipped);
          emit();
        },
        (err) => {
          console.warn("skips: read failed", err.code || err);
          enabled = false;
          emit();
        },
      );
    } catch (err) {
      console.warn("skips: Firebase unavailable", err);
      enabled = false;
      emit();
    }
  })();

  return {
    async toggle(slug) {
      if (!enabled || !write) return;
      try {
        await (skipped.has(slug) ? write.remove(slug) : write.add(slug));
      } catch (err) {
        console.warn("skips: write failed", err.code || err);
      }
    },
  };
}
