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
// Calls onChange({ skips, watched, user, denied }) right away with the cached sets, then again
// on every Firestore snapshot or auth change. If Firebase can't load, the cache is used and
// nobody is signed in, so the site stays read-only.
export function initCloud(onChange) {
  const state = { skips: readCache("skips"), watched: readCache("watched"), user: null, denied: false };
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
            emit();
          },
          (err) => console.warn(`${name}: read failed`, err.code || err),
        );
      }
    } catch (err) {
      console.warn("Firebase unavailable", err);
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

  return {
    toggleSkip: (slug) => toggle("skips", slug),
    toggleWatched: (slug) => toggle("watched", slug),
    async signIn() {
      await ready;
      if (!api) return;
      try {
        await api.au.signInWithPopup(api.auth, new api.au.GoogleAuthProvider());
      } catch (err) {
        if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") {
          console.warn("sign-in failed", err.code || err);
        }
      }
    },
    async signOut() {
      await ready;
      if (api) await api.au.signOut(api.auth);
    },
  };
}
