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
const VIDEOS = [
  {
    id: "v1",
    title: "Roadmap & Démarrage",
    category: "Stratégie",
    durationSeconds: 11568,
    description: "Les fondations pour démarrer comme marchand de biens. Pourquoi la méthode prime sur le talent : s'entourer de profils complémentaires, identifier ses forces, trouver son white space marketing, et accepter l'échec comme étape normale du parcours.",
    chapter: "Module 01",
    vimeoId: "1188097028",
    vimeoHash: "6d3a59dbeb",
    thumbnail: "thumbnails/Roadmap_Demarrage_Marchand_de_Biens.jpg",
    poster: "linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)",
    accent: "#3B82F6"
  },
  {
    id: "v2",
    title: "Mindset & Scaling",
    category: "Mindset",
    durationSeconds: 10387,
    description: "Le profil du marchand de biens performant : chasseur, dealmaker, négociateur, opérateur, créateur de valeur, structureur. Études de cas vécues et leviers concrets pour scaler son activité.",
    chapter: "Module 02",
    vimeoId: "1188092005",
    vimeoHash: "e8d84a9afe",
    thumbnail: "thumbnails/Mindset_et_Scaling_Marchand_de_Biens.jpg",
    poster: "linear-gradient(135deg, #134e4a 0%, #0f172a 100%)",
    accent: "#14B8A6"
  },
  {
    id: "v3",
    title: "Femmes Marchandes de Biens",
    category: "Roundtable",
    durationSeconds: 5596,
    description: "Roundtable avec trois marchandes de biens : parcours, plafond de verre vs « plancher collant », réseau, mentorat — et comment s'imposer dans un secteur historiquement masculin.",
    chapter: "Module 03",
    vimeoId: "1188090539",
    vimeoHash: "e527cc4135",
    thumbnail: "thumbnails/Femmes_Marchandes_de_Biens.jpg",
    poster: "linear-gradient(135deg, #831843 0%, #0f172a 100%)",
    accent: "#EC4899"
  },
  {
    id: "v4",
    title: "Opération Palace — Aix-les-Bains",
    category: "Étude de cas",
    durationSeconds: 8255,
    description: "Décryptage live d'une opération en cours : deux plateaux d'un ancien palace au centre d'Aix-les-Bains, divisés en 14 appartements. Montage, présentation aux banquiers et investisseurs, pré-commercialisation, rénovation second œuvre.",
    chapter: "Module 04",
    vimeoId: "1188094841",
    vimeoHash: "59ded8f8bf",
    thumbnail: "thumbnails/Operation_Palace_Aix-les-Bains.jpg",
    poster: "linear-gradient(135deg, #581c87 0%, #0f172a 100%)",
    accent: "#A855F7"
  },
  {
    id: "v5",
    title: "Debug d'Opérations",
    category: "Pratique",
    durationSeconds: 3424,
    description: "Cas réels d'opérations passées en revue avec le comité projet. Marge, rendement, pré-commercialisation, trésorerie : les arbitrages contextuels à connaître avant de signer.",
    chapter: "Module 05",
    vimeoId: "1188089654",
    vimeoHash: "8daf33a8bd",
    thumbnail: "thumbnails/Debug_Operations.jpg",
    poster: "linear-gradient(135deg, #7c2d12 0%, #0f172a 100%)",
    accent: "#F97316"
  },
  {
    id: "v6",
    title: "Contrôle Fiscal",
    category: "Fiscalité",
    durationSeconds: 6469,
    description: "Comprendre et préparer un contrôle fiscal de marchand de biens. Procédure contradictoire vs taxation d'office, vérification de comptabilité, FEC, prescription triennale — et les bons réflexes le jour J.",
    chapter: "Module 06",
    vimeoId: "1188087799",
    vimeoHash: "df6039e1eb",
    thumbnail: "thumbnails/Controle_Fiscal.jpg",
    poster: "linear-gradient(135deg, #14532d 0%, #0f172a 100%)",
    accent: "#22C55E"
  }
];

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

// ── Storage layer (mock backend) ─────────────────────────────────────────────
const STORAGE_KEY = "jg_lms_state_v1";

const defaultState = {
  profiles: [],
  activeProfileId: null,
  // watchEvents: [{profileId, videoId, startedAt, lastSeenAt, progress, completed, watchedSeconds}]
  watchEvents: []
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    return { ...defaultState, ...parsed };
  } catch (e) {
    return defaultState;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* noop */ }
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

// ── Root App ─────────────────────────────────────────────────────────────────
function App() {
  const [state, setState] = useState(loadState);
  const [hash, navigate] = useHashRoute();
  const [pageTransition, setPageTransition] = useState(false);

  useEffect(() => { saveState(state); }, [state]);

  // Page transition trigger on hash change
  useEffect(() => {
    setPageTransition(true);
    const t = setTimeout(() => setPageTransition(false), 50);
    return () => clearTimeout(t);
  }, [hash]);

  // Route guard: if no active profile, force to /profiles
  const activeProfile = state.profiles.find(p => p.id === state.activeProfileId);
  const route = hash.replace(/^#/, "");

  useEffect(() => {
    const needsProfile = route.startsWith("/home") || route.startsWith("/watch");
    if (needsProfile && !activeProfile) {
      navigate("#/profiles");
    }
  }, [route, activeProfile, navigate]);

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
    const video = VIDEOS.find(v => v.id === videoId);
    page = video ? <VideoPlayer video={video} profile={activeProfile} watchEvents={state.watchEvents} onRecord={recordWatch} onBack={() => navigate("#/home")} /> : <NotFound onBack={() => navigate("#/home")} />;
  } else if (route.startsWith("/admin")) {
    page = <AdminView profiles={state.profiles} watchEvents={state.watchEvents} videos={VIDEOS} onBack={() => navigate(activeProfile ? "#/home" : "#/profiles")} />;
  } else if (route.startsWith("/home")) {
    page = <HomePage profile={activeProfile} watchEvents={state.watchEvents} videos={VIDEOS} onWatch={(id) => navigate(`#/watch/${id}`)} onSwitchProfile={switchProfile} onAdmin={() => navigate("#/admin")} />;
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
  VIDEOS, AVATAR_COLORS, getInitials, formatTime, formatDuration, formatDurationShort, TWEAKS
});
