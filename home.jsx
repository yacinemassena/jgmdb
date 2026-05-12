// =============================================================================
// Home page — library of training videos
// =============================================================================

function HomePage({ profile, watchEvents, videos, onWatch, onOpenModule, onSwitchProfile }) {
  const [scrolled, setScrolled] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const myEvents = watchEvents.filter(e => e.profileId === profile?.id);
  const completed = myEvents.filter(e => e.completed).length;
  const totalMinutes = myEvents.reduce((acc, e) => acc + Math.round(e.watchedSeconds / 60), 0);

  // Group videos by category — preserving the order in which categories first appear
  const modules = useMemo(() => {
    const map = new Map();
    videos.forEach(v => {
      const key = v.category || "Autres";
      if (!map.has(key)) map.set(key, { category: key, videos: [], accent: v.accent });
      map.get(key).videos.push(v);
    });
    return Array.from(map.values());
  }, [videos]);

  const featured = videos[0];
  const featuredEvent = featured ? myEvents.find(e => e.videoId === featured.id) : null;

  const color = profile ? AVATAR_COLORS[profile.avatarIndex % AVATAR_COLORS.length] : AVATAR_COLORS[0];

  return (
    <div className="home-page">
      <header className={`home-header ${scrolled ? "scrolled" : ""}`}>
        <div className="header-inner">
          <nav className="home-nav">
            <a href="#" className="nav-item active">Bibliothèque</a>
          </nav>
          <div className="header-right">
            <button className="icon-btn search-btn" aria-label="Search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </button>
            <button className="profile-pill" onClick={() => setMenuOpen(v => !v)}>
              <div className="profile-pill-avatar" style={{ background: color.bg }}>
                <span>{getInitials(profile?.name || "")}</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={menuOpen ? "rotated" : ""}><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {menuOpen && (
              <div className="profile-menu" onMouseLeave={() => setMenuOpen(false)}>
                <div className="profile-menu-header">
                  <div className="menu-avatar" style={{ background: color.bg }}>{getInitials(profile?.name || "")}</div>
                  <div>
                    <div className="menu-name">{profile?.name}</div>
                    {profile?.role && <div className="menu-role">{profile.role}</div>}
                  </div>
                </div>
                <button className="menu-item" onClick={() => { setMenuOpen(false); onSwitchProfile(); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11l-3-3m0 0l3-3m-3 3h6"/></svg>
                  Changer de profil
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="hero"
        style={{
          backgroundImage: `url(${featured.thumbnail})`,
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      >
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="eyebrow-dot" style={{ background: featured.accent }}></span>
            À LA UNE · {featured.category.toUpperCase()}
          </div>
          <h1 className="hero-title">{featured.title}</h1>
          <p className="hero-description">{featured.description}</p>
          <div className="hero-meta">
            <span>{featured.chapter}</span>
            <span className="dot-sep">·</span>
            <span>{formatDurationShort(featured.durationSeconds)}</span>
          </div>
          <div className="hero-actions">
            <button className="play-btn" onClick={() => onWatch(featured.id)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              {featuredEvent?.progress > 0 ? "Reprendre" : "Commencer"}
            </button>
            <div className="hero-progress-info">
              {featuredEvent?.progress > 0 && (
                <>
                  <div className="hero-progress-bar">
                    <div className="hero-progress-fill" style={{ width: `${Math.round(featuredEvent.progress * 100)}%`, background: featured.accent }}></div>
                  </div>
                  <span>{Math.round(featuredEvent.progress * 100)}% vu</span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Welcome strip */}
      <section className="welcome-strip">
        <div className="welcome-text">
          <h2>Bon retour, <span style={{ color: color.solid }}>{profile?.name?.split(" ")[0]}</span>.</h2>
          <p>Reprenez là où vous vous étiez arrêté.</p>
        </div>
        <div className="welcome-stats">
          <div className="stat">
            <div className="stat-value">{completed}<span className="stat-total">/{videos.length}</span></div>
            <div className="stat-label">Modules terminés</div>
          </div>
          <div className="stat">
            <div className="stat-value">{totalMinutes}<span className="stat-unit">m</span></div>
            <div className="stat-label">Temps de visionnage</div>
          </div>
          <div className="stat">
            <div className="stat-value">{Math.round((completed / videos.length) * 100)}<span className="stat-unit">%</span></div>
            <div className="stat-label">Progression</div>
          </div>
        </div>
      </section>

      {/* All modules — grouped by category */}
      <section className="row-section">
        <div className="row-header">
          <h2 className="row-title">Tous les modules</h2>
          <span className="row-meta">{modules.length} module{modules.length > 1 ? "s" : ""} · {videos.length} vidéo{videos.length > 1 ? "s" : ""}</span>
        </div>
        <div className="module-grid">
          {modules.map((m, idx) => {
            const completedInModule = m.videos.filter(v => myEvents.find(e => e.videoId === v.id && e.completed)).length;
            const startedInModule = m.videos.filter(v => {
              const e = myEvents.find(ev => ev.videoId === v.id);
              return e && (e.progress > 0 || e.completed);
            }).length;
            const totalDuration = m.videos.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);
            return (
              <ModuleCard
                key={m.category}
                module={m}
                completed={completedInModule}
                started={startedInModule}
                totalDuration={totalDuration}
                onClick={() => onOpenModule(m.category)}
                hovered={hoveredId === m.category}
                onHoverStart={() => setHoveredId(m.category)}
                onHoverEnd={() => setHoveredId(null)}
                index={idx}
              />
            );
          })}
        </div>
      </section>

      <footer className="home-footer"></footer>
    </div>
  );
}

// =============================================================================
// Video Card
// =============================================================================
function VideoCard({ video, event, onClick, hovered, onHoverStart, onHoverEnd, variant, index = 0 }) {
  const progress = event?.progress || 0;
  const completed = event?.completed;

  return (
    <button
      className={`video-card ${variant === "continue" ? "card-continue" : ""} ${hovered ? "hovered" : ""}`}
      onClick={onClick}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className="card-poster"
        style={{
          backgroundImage: `url(${video.thumbnail})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#0f172a"
        }}
      >
        <div className="card-poster-overlay"></div>
        <div className="card-poster-pattern" style={{ borderColor: video.accent + "30" }}></div>
        <div className="card-chapter">{video.chapter}</div>
        <div className="card-play">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
        {completed && (
          <div className="card-completed">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
        )}
      </div>
      <div className="card-body">
        <div className="card-category-row">
          <span className="card-category" style={{ color: video.accent }}>{video.category}</span>
          <span className="card-duration">{formatDurationShort(video.durationSeconds)}</span>
        </div>
        <h3 className="card-title">{video.title}</h3>
        <p className="card-description">{video.description}</p>
        {progress > 0 && (
          <div className="card-progress">
            <div className="card-progress-bar">
              <div className="card-progress-fill" style={{ width: `${progress * 100}%`, background: video.accent }}></div>
            </div>
            <span className="card-progress-label">
              {completed ? "Terminé" : `${Math.round(progress * 100)}% vu`}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}

// =============================================================================
// Module Card — represents a category grouping on the homepage (level 1)
// =============================================================================
function ModuleCard({ module: m, completed, started, totalDuration, onClick, hovered, onHoverStart, onHoverEnd, index = 0 }) {
  const total = m.videos.length;
  const accent = m.accent || m.videos[0]?.accent || "#3B82F6";
  const totalMin = Math.round(totalDuration / 60);
  const allDone = completed === total && total > 0;
  const progressRatio = total > 0 ? completed / total : 0;

  return (
    <button
      className={`module-card ${hovered ? "hovered" : ""} ${allDone ? "module-done" : ""}`}
      onClick={onClick}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      style={{ animationDelay: `${index * 60}ms`, "--module-accent": accent }}
    >
      <div className="module-card-stack">
        {m.videos.slice(0, 3).map((v, i) => (
          <div
            key={v.id}
            className={`module-card-layer module-card-layer-${i}`}
            style={{
              backgroundImage: `url(${v.thumbnail})`,
              backgroundSize: "cover",
              backgroundPosition: "center"
            }}
          />
        ))}
        <div className="module-card-overlay"></div>
        <div className="module-card-count-pill">{total} vidéo{total > 1 ? "s" : ""}</div>
        {allDone && (
          <div className="module-card-done-badge" aria-label="Module terminé">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
        )}
      </div>
      <div className="module-card-body">
        <div className="module-card-eyebrow" style={{ color: accent }}>Module</div>
        <h3 className="module-card-title">{m.category}</h3>
        <p className="module-card-meta">
          {totalMin > 60 ? `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, "0")}` : `${totalMin} min`}
          {started > 0 && (
            <>
              <span className="dot-sep">·</span>
              <span>{allDone ? "Terminé" : `${completed}/${total} vu${completed > 1 ? "s" : ""}`}</span>
            </>
          )}
        </p>
        <div className="module-card-progress">
          <div className="module-card-progress-bar">
            <div
              className="module-card-progress-fill"
              style={{ width: `${progressRatio * 100}%`, background: accent }}
            ></div>
          </div>
        </div>
      </div>
      <div className="module-card-arrow" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
      </div>
    </button>
  );
}

// =============================================================================
// Module page — list of videos in one category (level 0)
// =============================================================================
function ModulePage({ profile, watchEvents, videos, category, onWatch, onBack, onSwitchProfile }) {
  const [scrolled, setScrolled] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const myEvents = watchEvents.filter(e => e.profileId === profile?.id);
  const color = profile ? AVATAR_COLORS[profile.avatarIndex % AVATAR_COLORS.length] : AVATAR_COLORS[0];

  const accent = videos[0]?.accent || "#3B82F6";
  const cover = videos[0]?.thumbnail;
  const totalDuration = videos.reduce((acc, v) => acc + (v.durationSeconds || 0), 0);
  const totalMin = Math.round(totalDuration / 60);
  const completedCount = videos.filter(v => myEvents.find(e => e.videoId === v.id && e.completed)).length;

  return (
    <div className="home-page module-page">
      <header className={`home-header ${scrolled ? "scrolled" : ""}`}>
        <div className="header-inner">
          <button className="nav-back-btn" onClick={onBack} aria-label="Retour à la bibliothèque">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            <span>Bibliothèque</span>
          </button>
          <nav className="home-nav">
            <span className="nav-item active">{category}</span>
          </nav>
          <div className="header-right">
            <button className="profile-pill" onClick={() => setMenuOpen(v => !v)}>
              <div className="profile-pill-avatar" style={{ background: color.bg }}>
                <span>{getInitials(profile?.name || "")}</span>
              </div>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={menuOpen ? "rotated" : ""}><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {menuOpen && (
              <div className="profile-menu" onMouseLeave={() => setMenuOpen(false)}>
                <div className="profile-menu-header">
                  <div className="menu-avatar" style={{ background: color.bg }}>{getInitials(profile?.name || "")}</div>
                  <div>
                    <div className="menu-name">{profile?.name}</div>
                    {profile?.role && <div className="menu-role">{profile.role}</div>}
                  </div>
                </div>
                <button className="menu-item" onClick={() => { setMenuOpen(false); onSwitchProfile(); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11l-3-3m0 0l3-3m-3 3h6"/></svg>
                  Changer de profil
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section
        className="module-hero"
        style={cover ? { backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: `linear-gradient(135deg, ${accent}40, var(--bg-0))` }}
      >
        <div className="module-hero-overlay"></div>
        <div className="module-hero-content">
          <button className="module-hero-crumb" onClick={onBack}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            Tous les modules
          </button>
          <div className="hero-eyebrow">
            <span className="eyebrow-dot" style={{ background: accent }}></span>
            MODULE
          </div>
          <h1 className="hero-title">{category}</h1>
          <p className="module-hero-meta">
            <span>{videos.length} vidéo{videos.length > 1 ? "s" : ""}</span>
            <span className="dot-sep">·</span>
            <span>{totalMin > 60 ? `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, "0")}min` : `${totalMin} min`}</span>
            {completedCount > 0 && (
              <>
                <span className="dot-sep">·</span>
                <span>{completedCount}/{videos.length} terminée{completedCount > 1 ? "s" : ""}</span>
              </>
            )}
          </p>
        </div>
      </section>

      <section className="row-section">
        <div className="row-header">
          <h2 className="row-title">Sessions</h2>
          <span className="row-meta">{videos.length} vidéo{videos.length > 1 ? "s" : ""}</span>
        </div>
        <div className="card-grid">
          {videos.map((v, idx) => {
            const event = myEvents.find(e => e.videoId === v.id);
            return (
              <VideoCard
                key={v.id}
                video={v}
                event={event}
                onClick={() => onWatch(v.id)}
                hovered={hoveredId === v.id}
                onHoverStart={() => setHoveredId(v.id)}
                onHoverEnd={() => setHoveredId(null)}
                index={idx}
              />
            );
          })}
        </div>
      </section>

      <footer className="home-footer"></footer>
    </div>
  );
}

// =============================================================================
// 404
// =============================================================================
function NotFound({ onBack }) {
  return (
    <div className="notfound-page">
      <h1>404 — module introuvable</h1>
      <button className="primary-btn" onClick={onBack}>Retour</button>
    </div>
  );
}

Object.assign(window, { HomePage, ModuleCard, ModulePage, VideoCard, NotFound });
