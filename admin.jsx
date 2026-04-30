// =============================================================================
// Admin / Analytics view — table of who watched what
// =============================================================================

function AdminView({ profiles, watchEvents, videos, onBack }) {
  const [selectedProfile, setSelectedProfile] = useState("all");

  const totalWatchTime = watchEvents.reduce((acc, e) => acc + (e.watchedSeconds || 0), 0);
  const totalCompletions = watchEvents.filter(e => e.completed).length;
  const activeProfiles = new Set(watchEvents.map(e => e.profileId)).size;

  const filtered = selectedProfile === "all"
    ? watchEvents
    : watchEvents.filter(e => e.profileId === selectedProfile);

  const sorted = [...filtered].sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  // Per-profile completion grid
  const completionMatrix = profiles.map(p => ({
    profile: p,
    videos: videos.map(v => {
      const ev = watchEvents.find(e => e.profileId === p.id && e.videoId === v.id);
      return { video: v, event: ev };
    })
  }));

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="brand-mark">
            <span className="admin-tag">Statistiques</span>
          </div>
          <button className="ghost-btn" onClick={onBack}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Retour
          </button>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-intro">
          <h1>Statistiques</h1>
          <p>Activité et taux de complétion par profil. Mis à jour en temps réel.</p>
        </div>

        <div className="kpi-row">
          <div className="kpi">
            <div className="kpi-label">Profils actifs</div>
            <div className="kpi-value">{activeProfiles}<span className="kpi-total">/{profiles.length}</span></div>
            <div className="kpi-trend">profils avec visionnage</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Modules terminés</div>
            <div className="kpi-value">{totalCompletions}</div>
            <div className="kpi-trend">tous profils confondus</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Temps total visionné</div>
            <div className="kpi-value">{Math.round(totalWatchTime / 60)}<span className="kpi-unit">min</span></div>
            <div className="kpi-trend">cumul</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Couverture du programme</div>
            <div className="kpi-value">{Math.round((totalCompletions / Math.max(profiles.length * videos.length, 1)) * 100)}<span className="kpi-unit">%</span></div>
            <div className="kpi-trend">du total possible</div>
          </div>
        </div>

        {/* Completion matrix */}
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>Matrice de complétion</h2>
            <span>Profil × Module</span>
          </div>
          <div className="matrix-wrap">
            <table className="matrix-table">
              <thead>
                <tr>
                  <th className="matrix-th-name">Profil</th>
                  {videos.map(v => (
                    <th key={v.id} className="matrix-th">
                      <div className="matrix-th-inner">
                        <span className="matrix-chapter">{v.chapter.replace("Module ", "M")}</span>
                        <span className="matrix-cat" style={{ color: v.accent }}>{v.category}</span>
                      </div>
                    </th>
                  ))}
                  <th className="matrix-th-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {completionMatrix.map(row => {
                  const color = AVATAR_COLORS[row.profile.avatarIndex % AVATAR_COLORS.length];
                  const completedCount = row.videos.filter(x => x.event?.completed).length;
                  return (
                    <tr key={row.profile.id}>
                      <td className="matrix-td-name">
                        <div className="matrix-profile">
                          <div className="matrix-avatar" style={{ background: color.bg }}>{getInitials(row.profile.name)}</div>
                          <div>
                            <div className="matrix-pname">{row.profile.name}</div>
                            {row.profile.role && <div className="matrix-prole">{row.profile.role}</div>}
                          </div>
                        </div>
                      </td>
                      {row.videos.map(({ video, event }) => {
                        let cellClass = "matrix-cell empty";
                        let label = "—";
                        if (event?.completed) { cellClass = "matrix-cell completed"; label = "✓"; }
                        else if (event?.progress >= 0.5) { cellClass = "matrix-cell progress-high"; label = `${Math.round(event.progress * 100)}%`; }
                        else if (event?.progress > 0) { cellClass = "matrix-cell progress-low"; label = `${Math.round(event.progress * 100)}%`; }
                        return (
                          <td key={video.id} className={cellClass} title={`${row.profile.name} — ${video.title}`}>
                            <span>{label}</span>
                          </td>
                        );
                      })}
                      <td className="matrix-td-total">
                        <div className="total-pill">
                          <span>{completedCount}</span>
                          <span className="total-pill-divider">/</span>
                          <span>{videos.length}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity log */}
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>Journal d'activité</h2>
            <select className="admin-select" value={selectedProfile} onChange={e => setSelectedProfile(e.target.value)}>
              <option value="all">Tous les profils</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {sorted.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">○</span>
              <h3>Pas encore d'activité</h3>
              <p>Les visionnages apparaîtront ici au fur et à mesure.</p>
            </div>
          ) : (
            <div className="log-table-wrap">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Profil</th>
                    <th>Module</th>
                    <th>Démarré</th>
                    <th>Vu pour la dernière fois</th>
                    <th>Visionné</th>
                    <th>Progression</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e, idx) => {
                    const p = profiles.find(x => x.id === e.profileId);
                    const v = videos.find(x => x.id === e.videoId);
                    if (!p || !v) return null;
                    const color = AVATAR_COLORS[p.avatarIndex % AVATAR_COLORS.length];
                    return (
                      <tr key={idx}>
                        <td>
                          <div className="log-profile">
                            <div className="log-avatar" style={{ background: color.bg }}>{getInitials(p.name)}</div>
                            <span>{p.name}</span>
                          </div>
                        </td>
                        <td>
                          <div className="log-module">
                            <span className="log-chapter">{v.chapter}</span>
                            <span className="log-title">{v.title}</span>
                          </div>
                        </td>
                        <td className="log-time">{formatTime(e.startedAt)}</td>
                        <td className="log-time">{formatTime(e.lastSeenAt)}</td>
                        <td className="log-mono">{Math.round((e.watchedSeconds || 0) / 60)}m {Math.round((e.watchedSeconds || 0) % 60)}s</td>
                        <td className="log-progress">
                          <div className="log-bar">
                            <div className="log-bar-fill" style={{ width: `${(e.progress || 0) * 100}%`, background: v.accent }}></div>
                          </div>
                          <span className="log-pct">{Math.round((e.progress || 0) * 100)}%</span>
                        </td>
                        <td>
                          <span className={`status-chip ${e.completed ? "completed" : e.progress > 0 ? "in-progress" : "started"}`}>
                            {e.completed ? "Terminé" : e.progress > 0 ? "En cours" : "Démarré"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="admin-footnote">
          Les données sont stockées localement dans ce navigateur. Pour un suivi multi-appareils, il faudra brancher un petit backend (par exemple un Worker Cloudflare avec KV/D1).
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { AdminView });
