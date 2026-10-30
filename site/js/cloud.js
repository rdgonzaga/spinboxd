import { firebaseConfig } from "./firebase-config.js";
import { parseCachedSkips } from "./pool.js";

const SDK = "https://www.gstatic.com/firebasejs/11.10.0";
const NAMES = ["skips", "watched"];

function readCache(name) {
  try {
    return parseCachedSkips(localStorage.getItem(`spinboxd.${name}`));
  } catch {
    return new Set();
  }
}

function writeCache(name, slugs) {
  try {
    localStorage.setItem(`spinboxd.${name}`, JSON.stringify([...slugs]));
  } catch {}
}

// Everyone can read skips and watched; only signed-in owners can write (firestore.rules).
// Calls onChange({ skips, watched, watchedAt, user, denied, synced }) right away with the cached sets, then again
// on every Firestore snapshot or auth change. If Firebase can't load, the cache is used and
// nobody is signed in, so the site stays read-only.
function readDates() {
  try {
    const raw = JSON.parse(localStorage.getItem("spinboxd.watchedAt")) || {};
    return new Map(Object.entries(raw).map(([slug, iso]) => [slug, new Date(iso)]));
  } catch {
    return new Map();
  }
}

function writeDates(dates) {
  try {
    const raw = {};
    for (const [slug, d] of dates) if (d) raw[slug] = d.toISOString();
    localStorage.setItem("spinboxd.watchedAt", JSON.stringify(raw));
  } catch {}
}

export function initCloud(onChange) {
  let cached = false;
  try {
    cached = localStorage.getItem("spinboxd.watched") !== null;
  } catch {}
  // synced: the watched set is trustworthy (from cache or a snapshot), so counts can show
  const state = { skips: readCache("skips"), watched: readCache("watched"), watchedAt: readDates(), user: null, denied: false, synced: cached };
  const emit = () => onChange({ ...state });
  emit();

  let api = null;
  const ready = (async () => {
    try {
      const [{ initializeApp }, fs, au] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-firestore.js`),
        import(`${SDK}/firebase-auth.js`),
      ]);
      const app = initializeApp(firebaseConfig);
      const db = fs.getFirestore(app);
      const auth = au.getAuth(app);
      api = { fs, au, db, auth };

      au.onAuthStateChanged(auth, (user) => {
        state.user = user;
        state.denied = false;
        emit();
      });
      for (const name of NAMES) {
        fs.onSnapshot(
          fs.collection(db, name),
          (snap) => {
            state[name] = new Set(snap.docs.map((d) => d.id));
            writeCache(name, state[name]);
            if (name === "watched") {
              state.synced = true;
              state.watchedAt = new Map(snap.docs.map((d) => [d.id, d.data().at?.toDate?.() ?? null]));
              writeDates(state.watchedAt);
            }
            emit();
          },
          (err) => console.warn(`${name}: read failed`, err.code || err),
        );
      }
    } catch (err) {
      console.warn("Firebase unavailable", err);
      state.synced = true;
      emit();
    }
  })();

  async function toggle(name, slug) {
    if (!api || !state.user) return false;
    const ref = api.fs.doc(api.db, name, slug);
    try {
      await (state[name].has(slug) ? api.fs.deleteDoc(ref) : api.fs.setDoc(ref, { at: api.fs.serverTimestamp() }));
      return true;
    } catch (err) {
      console.warn(`${name}: write failed`, err.code || err);
      if (err.code === "permission-denied") {
        state.denied = true;
        emit();
      }
      return false;
    }
  }

  // returns an error code, or null on success; kept apart from toggle() so a missing
  // update rule doesn't flag the whole account as read-only
  async function setWatchedAt(slug, date) {
    if (!api || !state.user) return "signed-out";
    try {
      await api.fs.setDoc(api.fs.doc(api.db, "watched", slug), { at: api.fs.Timestamp.fromDate(date) });
      return null;
    } catch (err) {
      console.warn("watched date: write failed", err.code || err);
      return err.code || "unknown";
    }
  }

  return {
    setWatchedAt,
    toggleSkip: (slug) => toggle("skips", slug),
    toggleWatched: (slug) => toggle("watched", slug),
    async signIn() {
      await ready;
      if (!api) return "firebase-unavailable";
      try {
        await api.au.signInWithPopup(api.auth, new api.au.GoogleAuthProvider());
        return null;
      } catch (err) {
        console.warn("sign-in failed", err.code || err);
        return err.code || "unknown";
      }
    },
    async signOut() {
      await ready;
      if (api) await api.au.signOut(api.auth);
    },
  };
}
