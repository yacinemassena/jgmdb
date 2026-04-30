// =============================================================================
// Video Player — Vimeo embed with real progress tracking via Vimeo Player API
// =============================================================================

function VideoPlayer({ video, profile, watchEvents, onRecord, onBack }) {
  const [loading, setLoading] = useState(true);
  const [showControls, setShowControls] = useState(true);
  const iframeRef = useRef(null);
  const lastRecordRef = useRef(0);
  const watchedRef = useRef(0);
  const progressRef = useRef(0);

  const event = watchEvents.find(e => e.profileId === profile?.id && e.videoId === video.id);
  const totalSeconds = video.durationSeconds;
  const initialSeconds = event?.watchedSeconds || 0;
  const [watchedSeconds, setWatchedSeconds] = useState(initialSeconds);

  // Record initial view
  useEffect(() => {
    onRecord(video.id, { lastSeenAt: Date.now() });
  }, []);

  // Vimeo Player API integration
  useEffect(() => {
    if (!iframeRef.current || !window.Vimeo) {
      // Fallback: Vimeo SDK didn't load — just hide loader after a beat
      const t = setTimeout(() => setLoading(false), 1200);
      return () => clearTimeout(t);
    }
    const player = new window.Vimeo.Player(iframeRef.current);

    const recordSnapshot = (force) => {
      const now = Date.now();
      if (!force && now - lastRecordRef.current < 5000) return;
      lastRecordRef.current = now;
      onRecord(video.id, {
        watchedSeconds: watchedRef.current,
        progress: progressRef.current,
        completed: progressRef.current >= 0.95,
        lastSeenAt: now
      });
    };

    const onTimeUpdate = ({ seconds, percent }) => {
      watchedRef.current = seconds;
      progressRef.current = percent;
      setWatchedSeconds(seconds);
      recordSnapshot(false);
    };
    const onEnded = () => {
      progressRef.current = 1;
      onRecord(video.id, {
        watchedSeconds: totalSeconds,
        progress: 1,
        completed: true,
        lastSeenAt: Date.now()
      });
    };
    const onLoaded = () => {
      setLoading(false);
      if (initialSeconds > 0 && initialSeconds < totalSeconds - 5) {
        player.setCurrentTime(initialSeconds).catch(() => {});
      }
    };

    player.on("timeupdate", onTimeUpdate);
    player.on("ended", onEnded);
    player.on("loaded", onLoaded);

    return () => {
      // Final snapshot on unmount
      recordSnapshot(true);
      player.off("timeupdate", onTimeUpdate);
      player.off("ended", onEnded);
      player.off("loaded", onLoaded);
    };
  }, [video.id, totalSeconds]);

  // Auto-hide controls
  useEffect(() => {
    let timeout;
    const reset = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3500);
    };
    reset();
    window.addEventListener("mousemove", reset);
    return () => {
      window.removeEventListener("mousemove", reset);
      clearTimeout(timeout);
    };
  }, []);

  const progress = watchedSeconds / totalSeconds;
  const completed = progress >= 0.95;
  const color = profile ? AVATAR_COLORS[profile.avatarIndex % AVATAR_COLORS.length] : AVATAR_COLORS[0];
  const embedSrc = `https://player.vimeo.com/video/${video.vimeoId}?h=${video.vimeoHash}&title=0&byline=0&portrait=0&dnt=1`;

  return (
    <div className="player-page">
      <header className={`player-header ${showControls ? "" : "hidden"}`}>
        <button className="back-btn" onClick={onBack}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          <span>Retour à la bibliothèque</span>
        </button>
        <div className="player-header-meta">
          <span className="header-chapter">{video.chapter}</span>
          <span className="dot-sep">·</span>
          <span className="header-category" style={{ color: video.accent }}>{video.category}</span>
        </div>
        <div className="player-header-profile">
          <div className="player-profile-avatar" style={{ background: color.bg }}>
            <span>{getInitials(profile?.name || "")}</span>
          </div>
          <span className="player-profile-name">{profile?.name}</span>
        </div>
      </header>

      <div className="player-stage">
        {loading && (
          <div className="player-loader">
            <div className="loader-ring" style={{ borderTopColor: video.accent }}></div>
            <span>Chargement de {video.title}…</span>
          </div>
        )}
        <div className="vimeo-wrap" style={{ background: video.poster }}>
          <iframe
            ref={iframeRef}
            src={embedSrc}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title={video.title}
          />
        </div>
      </div>

      <div className={`player-info ${showControls ? "" : "hidden"}`}>
        <div className="player-info-inner">
          <div className="player-info-left">
            <div className="player-eyebrow">
              <span className="eyebrow-dot" style={{ background: video.accent }}></span>
              {video.chapter} · {video.category}
            </div>
            <h1 className="player-title">{video.title}</h1>
            <p className="player-description">{video.description}</p>
            <div className="player-meta">
              <span><strong>Durée :</strong> {formatDuration(totalSeconds)}</span>
            </div>
          </div>
          <div className="player-info-right">
            <div className="progress-card">
              <div className="progress-card-header">
                <span className="progress-card-label">Votre progression</span>
                {completed && <span className="badge-completed">✓ Terminé</span>}
              </div>
              <div className="progress-card-bar">
                <div className="progress-card-fill" style={{ width: `${progress * 100}%`, background: video.accent }}></div>
              </div>
              <div className="progress-card-stats">
                <span>{formatDuration(watchedSeconds)} / {formatDuration(totalSeconds)}</span>
                <span>{Math.round(progress * 100)}%</span>
              </div>
              <div className="progress-card-tracking">
                <div className="tracking-row">
                  <span className="tracking-label">Profil</span>
                  <span className="tracking-value">{profile?.name}</span>
                </div>
                <div className="tracking-row">
                  <span className="tracking-label">Démarré</span>
                  <span className="tracking-value">{formatTime(event?.startedAt || Date.now())}</span>
                </div>
                <div className="tracking-row">
                  <span className="tracking-label">Statut</span>
                  <span className="tracking-value" style={{ color: completed ? "#22C55E" : video.accent }}>
                    {completed ? "Terminé" : progress > 0 ? "En cours" : "Démarré"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VideoPlayer });
