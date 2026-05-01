// =============================================================================
// Video platform — dark editorial aesthetic, Netflix-style profile picker
// =============================================================================

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ── Tweakable defaults ───────────────────────────────────────────────────────
const TWEAKS = /*EDITMODE-BEGIN*/{
  "accentColor": "#2563EB",
  "accentColorHover": "#1D4ED8"
}/*EDITMODE-END*/;

// ── Video catalog ────────────────────────────────────────────────────────────
const R2_BASE = "https://pub-f7a0c015c98f48b0b6b872c167a332f9.r2.dev";

const VIDEOS = [
  {
    id: "v1",
    title: "Négociation",
    category: "Démarrage",
    durationSeconds: 2959,
    description: "Sa toute première opération expliquée pas à pas, puis les fondamentaux de la négociation : processus en sept étapes, dix qualités du bon négociateur, comment négocier son split de rémunération et un investisseur. Du tactique pur, prêt à appliquer dès lundi matin.",
    chapter: "Module 01",
    thumbnail: `${R2_BASE}/thumbnails/roadmap.jpg`,
    videoUrl: `${R2_BASE}/videos/roadmap.mp4`,
    poster: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
    accent: "#3B82F6"
  },
  {
    id: "v2",
    title: "Mindset",
    category: "Mindset",
    durationSeconds: 5665,
    description: "Le parcours de zéro à plus de 100M$ de profits raconté en huit histoires concrètes, avec les shifts de mindset à chaque étape. Les dix lois du succès empruntées à Jim Rohn, et pourquoi la majorité ne passe jamais à l'action.",
    chapter: "Module 02",
    thumbnail: `${R2_BASE}/thumbnails/mindset-scaling.jpg`,
    videoUrl: `${R2_BASE}/videos/mindset-scaling.mp4`,
    poster: "linear-gradient(135deg, #134e4a 0%, #0f172a 100%)",
    accent: "#14B8A6"
  },
  {
    id: "v3",
    title: "(Un des) Game Plan pour devenir multimillionnaire",
    category: "Stratégie",
    durationSeconds: 7012,
    description: "Conférence BIFF Versailles 2025 : un game plan complet pour aller chercher un patrimoine multimillionnaire. Trois leviers concrets, et la mentalité à adopter pour traiter ses problèmes en devenant riche plutôt qu'en attendant que ça passe.",
    chapter: "Module 03",
    thumbnail: `${R2_BASE}/thumbnails/game-plan.jpg`,
    videoUrl: `${R2_BASE}/videos/game-plan.mp4`,
    poster: "linear-gradient(135deg, #422006 0%, #0f172a 100%)",
    accent: "#CA8A04",
    hidden: true
  },
  {
    id: "v4",
    title: "Inside la Machine à Lever des Millions",
    category: "Levée de fonds",
    durationSeconds: 7501,
    description: "Session VIP du BIFF 2025 : ce qu'il a appris en levant +200M$ et en visant 500M$. Méthode pour lever sans réseau ni expérience, ce qui fait dire oui (et ce qui tue le deal), comment construire une offre claire et crédible, et un plan d'action pour pitcher dès lundi.",
    chapter: "Module 04",
    thumbnail: `${R2_BASE}/thumbnails/lever-des-millions.jpg`,
    videoUrl: `${R2_BASE}/videos/lever-des-millions.mp4`,
    poster: "linear-gradient(135deg, #831843 0%, #0f172a 100%)",
    accent: "#EC4899",
    hidden: true
  }
];

const VISIBLE_VIDEOS = VIDEOS.filter(v => !v.hidden);

// ── Avatar palette ───────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  { bg: "linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)", solid: "#3B82F6" },
  { bg: "linear-gradient(135deg, #134e4a 0%, #14b8a6 100%)", solid: "#14B8A6" },
  { bg: "linear-gradient(135deg, #581c87 0%, #a855f7 100%)", solid: "#A855F7" },
  { bg: "linear-gradient(135deg, #7c2d12 0%, #f97316 100%)", solid: "#F97316" },
  { bg: "linear-gradient(135deg, #831843 0%, #ec4899 100%)", solid: "#EC4899" },
  { bg: "linear-gradient(135deg, #14532d 0%, #22c55e 100%)", solid: "#22C55E" },
  { bg: "linear-gradient(135deg, #1e3a8a 0%, #6366f1 100%)", solid: "#6366F1" },
  { bg: "linear-gradient(135deg, #422006 0%, #ca8a04 100%)", solid: "#CA8A04" }
];

// ── Storage layer (server-side JSON file via Go API) ─────────────────────────
const STATE_URL = "/api/state";
const SAVE_DEBOUNCE_MS = 800;

const defaultState = {
  profiles: [],
  activeProfileId: null,
  // watchEvents: [{profileId, videoId, startedAt, lastSeenAt, progress, completed, watchedSeconds}]
  watchEvents: []
};

async function fetchState() {
  const r = await fetch(STATE_URL, { cache: "no-store" });
  if (!r.ok) throw new Error("fetch state failed: " + r.status);
  const parsed = await r.json();
  return { ...defaultState, ...parsed };
}

async function postState(state) {
  const r = await fetch(STATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
  if (!r.ok) throw new Error("save state failed: " + r.status);
}

// ── Utility ──────────────────────────────────────────────────────────────────
function getInitials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() || "").join("");
}

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDuration(seconds) {
  if (!seconds || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDurationShort(seconds) {
  if (!seconds || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m} min`;
}

// ── Routing (hash-based) ─────────────────────────────────────────────────────
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || "#/profiles");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/profiles");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((to) => {
    window.location.hash = to;
  }, []);
  return [hash, navigate];
}

// ── Access gate ──────────────────────────────────────────────────────────────
const ACCESS_PASSWORD = "nour";
const ACCESS_KEY = "jgmdb-access-ok";

function PasswordGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = (e) => {
    e?.preventDefault();
    if (value.trim().toLowerCase() === ACCESS_PASSWORD) {
      try { sessionStorage.setItem(ACCESS_KEY, "1"); } catch {}
      onUnlock();
    } else {
      setError(true);
    }
  };

  return (
    <div className="gate-page">
      <main className="gate-main">
        <form className="gate-form" onSubmit={submit}>
          <h1 className="gate-title">Accès protégé</h1>
          <input
            className={`field-input ${error ? "error" : ""}`}
            type="password"
            value={value}
            onChange={e => { setValue(e.target.value); if (error) setError(false); }}
            placeholder="Mot de passe"
            autoFocus
            autoComplete="off"
          />
          {error && <span className="field-error">Mot de passe incorrect</span>}
          <button type="submit" className="primary-btn" disabled={!value.trim()}>
            Entrer
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>
        </form>
      </main>
    </div>
  );
}

// ── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const [unlocked, setUnlocked] = useState(() => {
    try { return sessionStorage.getItem(ACCESS_KEY) === "1"; } catch { return false; }
  });
  const [state, setState] = useState(null); // null until first fetch resolves
  const [hash, navigate] = useHashRoute();
  const [pageTransition, setPageTransition] = useState(false);
  const saveTimer = useRef(null);
  const hydratedRef = useRef(false);

  // Initial hydration from server
  useEffect(() => {
    let cancelled = false;
    fetchState()
      .then(s => { if (!cancelled) { setState(s); hydratedRef.current = true; } })
      .catch(err => {
        console.warn("[state] hydration failed, starting empty:", err);
        if (!cancelled) { setState(defaultState); hydratedRef.current = true; }
      });
    return () => { cancelled = true; };
  }, []);

  // Debounced server save on every state change (after hydration)
  useEffect(() => {
    if (!hydratedRef.current || state == null) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      postState(state).catch(err => console.warn("[state] save failed:", err));
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  // Page transition trigger on hash change
  useEffect(() => {
    setPageTransition(true);
    const t = setTimeout(() => setPageTransition(false), 50);
    return () => clearTimeout(t);
  }, [hash]);

  // Route guard (computed before early-return so hooks run in stable order)
  const route = hash.replace(/^#/, "");
  const activeProfile = state ? state.profiles.find(p => p.id === state.activeProfileId) : null;

  useEffect(() => {
    if (state == null) return;
    const needsProfile = route.startsWith("/home") || route.startsWith("/watch");
    if (needsProfile && !activeProfile) {
      navigate("#/profiles");
    }
  }, [route, activeProfile, navigate, state]);

  // Password gate before anything else
  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  // Loading splash while we wait for the first server response
  if (state == null) {
    return (
      <div className="boot-screen">
        <div className="loader-ring"></div>
      </div>
    );
  }

  // Handlers
  const setActiveProfile = (id) => {
    setState(s => ({ ...s, activeProfileId: id }));
    setTimeout(() => navigate("#/home"), 280);
  };

  const addProfile = (profile) => {
    const id = "p_" + Math.random().toString(36).slice(2, 10);
    setState(s => ({ ...s, profiles: [...s.profiles, { ...profile, id, createdAt: Date.now() }] }));
    return id;
  };

  const deleteProfile = (id) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.filter(p => p.id !== id),
      activeProfileId: s.activeProfileId === id ? null : s.activeProfileId,
      watchEvents: s.watchEvents.filter(e => e.profileId !== id)
    }));
  };

  const updateProfile = (id, updates) => {
    setState(s => ({
      ...s,
      profiles: s.profiles.map(p => p.id === id ? { ...p, ...updates } : p)
    }));
  };

  const recordWatch = (videoId, payload) => {
    if (!state.activeProfileId) return;
    setState(s => {
      const existing = s.watchEvents.find(
        e => e.profileId === s.activeProfileId && e.videoId === videoId
      );
      const merged = {
        profileId: s.activeProfileId,
        videoId,
        startedAt: existing?.startedAt || Date.now(),
        lastSeenAt: Date.now(),
        progress: 0,
        watchedSeconds: 0,
        completed: false,
        ...(existing || {}),
        ...payload
      };
      return {
        ...s,
        watchEvents: [
          ...s.watchEvents.filter(e => !(e.profileId === s.activeProfileId && e.videoId === videoId)),
          merged
        ]
      };
    });
  };

  const switchProfile = () => {
    setState(s => ({ ...s, activeProfileId: null }));
    navigate("#/profiles");
  };

  // Route resolution
  let page;
  if (route.startsWith("/profiles/new")) {
    page = <CreateProfile onSave={(p) => { addProfile(p); navigate("#/profiles"); }} onCancel={() => navigate("#/profiles")} />;
  } else if (route.startsWith("/profiles/edit")) {
    page = <EditProfiles profiles={state.profiles} onUpdate={updateProfile} onDelete={deleteProfile} onDone={() => navigate("#/profiles")} />;
  } else if (route.startsWith("/profiles") || route === "" || route === "/") {
    page = <ProfilePicker profiles={state.profiles} onSelect={setActiveProfile} onAdd={() => navigate("#/profiles/new")} onEdit={() => navigate("#/profiles/edit")} />;
  } else if (route.startsWith("/watch/")) {
    const videoId = route.replace("/watch/", "");
    const video = VISIBLE_VIDEOS.find(v => v.id === videoId);
    page = video ? <VideoPlayer video={video} profile={activeProfile} watchEvents={state.watchEvents} onRecord={recordWatch} onBack={() => navigate("#/home")} /> : <NotFound onBack={() => navigate("#/home")} />;
  } else if (route.startsWith("/admin")) {
    page = <AdminView profiles={state.profiles} watchEvents={state.watchEvents} videos={VISIBLE_VIDEOS} onBack={() => navigate(activeProfile ? "#/home" : "#/profiles")} />;
  } else if (route.startsWith("/home")) {
    page = <HomePage profile={activeProfile} watchEvents={state.watchEvents} videos={VISIBLE_VIDEOS} onWatch={(id) => navigate(`#/watch/${id}`)} onSwitchProfile={switchProfile} onAdmin={() => navigate("#/admin")} />;
  } else {
    page = <NotFound onBack={() => navigate("#/profiles")} />;
  }

  return (
    <div className="app-root">
      <div key={route} className={`route-fade ${pageTransition ? "entering" : "entered"}`}>
        {page}
      </div>
    </div>
  );
}

// Mount
ReactDOM.createRoot(document.getElementById("root")).render(<App />);

// Expose to window for cross-script access
Object.assign(window, {
  VIDEOS, VISIBLE_VIDEOS, AVATAR_COLORS, getInitials, formatTime, formatDuration, formatDurationShort, TWEAKS
});
