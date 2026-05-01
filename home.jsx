// =============================================================================
// Home page — library of training videos
// =============================================================================

function HomePage({ profile, watchEvents, videos, onWatch, onSwitchProfile }) {
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

  const featured = videos[0];
  const featuredEvent = myEvents.find(e => e.videoId === featured.id);

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

      {/* All modules */}
      <section className="row-section">
        <div className="row-header">
          <h2 className="row-title">Tous les modules</h2>
          <span className="row-meta">{videos.length} modules</span>
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

Object.assign(window, { HomePage, VideoCard, NotFound });
