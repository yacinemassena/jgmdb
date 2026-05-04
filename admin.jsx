// =============================================================================
// Admin panel — stats + management (videos, profiles, password, CSV export)
// =============================================================================

// ── Upload helpers ───────────────────────────────────────────────────────────

const ACCENT_PRESETS = ["#3B82F6", "#14B8A6", "#A855F7", "#F97316", "#EC4899", "#22C55E", "#6366F1", "#CA8A04"];

async function uploadThumbnail({ file, adminPass, signal }) {
  const presignRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Pass": adminPass },
    body: JSON.stringify({ kind: "thumbnail", filename: file.name, contentType: file.type })
  });
  if (!presignRes.ok) throw new Error("thumbnail presign failed: " + presignRes.status);
  const { uploadUrl, publicUrl } = await presignRes.json();
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error("thumbnail status " + xhr.status));
    xhr.onerror = () => reject(new Error("thumbnail network error"));
    xhr.onabort = () => reject(new Error("aborted"));
    if (signal) signal.addEventListener("abort", () => xhr.abort());
    xhr.send(file);
  });
  return publicUrl;
}

async function uploadVideo({ file, adminPass, onProgress, signal }) {
  const initRes = await fetch("/api/upload-init", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Pass": adminPass },
    body: JSON.stringify({ filename: file.name, contentType: file.type })
  });
  if (!initRes.ok) throw new Error("init failed: " + initRes.status);
  const { uploadId, key, publicUrl, partSize, maxBytes } = await initRes.json();

  if (file.size > maxBytes) {
    fetch("/api/upload-abort", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Pass": adminPass },
      body: JSON.stringify({ key, uploadId })
    }).catch(() => {});
    throw new Error(`Fichier trop volumineux : ${(file.size / 1e9).toFixed(2)} GB (max ${(maxBytes / 1e9).toFixed(0)} GB)`);
  }

  const totalParts = Math.ceil(file.size / partSize);
  const uploadedBytes = new Array(totalParts).fill(0);
  const parts = new Array(totalParts);

  const reportProgress = () => {
    const sum = uploadedBytes.reduce((a, b) => a + b, 0);
    onProgress?.(sum, file.size);
  };

  let nextPart = 0;
  const aborted = { value: false };
  const onAbort = () => { aborted.value = true; };
  if (signal) signal.addEventListener("abort", onAbort);

  async function worker() {
    while (true) {
      if (aborted.value) throw new Error("aborted");
      const partIdx = nextPart++;
      if (partIdx >= totalParts) return;
      const partNumber = partIdx + 1;
      const start = partIdx * partSize;
      const end = Math.min(start + partSize, file.size);
      const blob = file.slice(start, end);

      const presignRes = await fetch("/api/upload-part", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Pass": adminPass },
        body: JSON.stringify({ key, uploadId, partNumber })
      });
      if (!presignRes.ok) throw new Error(`presign part ${partNumber} failed`);
      const { url } = await presignRes.json();

      const etag = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", url);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) { uploadedBytes[partIdx] = e.loaded; reportProgress(); }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const tag = xhr.getResponseHeader("ETag") || xhr.getResponseHeader("etag");
            if (!tag) reject(new Error("ETag absent — vérifier R2 CORS ExposeHeaders"));
            else { uploadedBytes[partIdx] = blob.size; reportProgress(); resolve(tag.replace(/"/g, "")); }
          } else reject(new Error(`part ${partNumber} status ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error(`part ${partNumber} network error`));
        xhr.onabort = () => reject(new Error("aborted"));
        if (signal) signal.addEventListener("abort", () => xhr.abort());
        xhr.send(blob);
      });

      parts[partIdx] = { etag, partNumber };
    }
  }

  const CONCURRENCY = Math.min(3, totalParts);
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  } catch (e) {
    fetch("/api/upload-abort", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Pass": adminPass },
      body: JSON.stringify({ key, uploadId })
    }).catch(() => {});
    throw e;
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }

  const completeRes = await fetch("/api/upload-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Pass": adminPass },
    body: JSON.stringify({ key, uploadId, parts })
  });
  if (!completeRes.ok) throw new Error("complete failed: " + completeRes.status);
  const { publicUrl: finalUrl } = await completeRes.json();
  return finalUrl || publicUrl;
}

async function extractThumbnail(videoFile) {
  const url = URL.createObjectURL(videoFile);
  try {
    const v = document.createElement("video");
    v.src = url; v.muted = true; v.preload = "metadata"; v.crossOrigin = "anonymous";
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("metadata")); });
    v.currentTime = Math.min(5, Math.max(0.5, v.duration / 2));
    await new Promise((res, rej) => { v.onseeked = res; v.onerror = () => rej(new Error("seek")); });
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.85));
    if (!blob) throw new Error("toBlob");
    return new File([blob], "auto-thumb.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function getVideoDuration(videoFile) {
  const url = URL.createObjectURL(videoFile);
  try {
    const v = document.createElement("video");
    v.src = url; v.preload = "metadata";
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("duration")); });
    return Math.round(v.duration);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Upload form section ──────────────────────────────────────────────────────

function UploadVideoSection({ adminPass, currentCount, onAdd }) {
  const [videoFile, setVideoFile] = useState(null);
  const [thumbFile, setThumbFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [chapter, setChapter] = useState("");
  const [category, setCategory] = useState("");
  const [accent, setAccent] = useState(ACCENT_PRESETS[0]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0, started: 0 });
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  useEffect(() => {
    if (!chapter) setChapter(`Module ${String(currentCount + 1).padStart(2, "0")}`);
  }, [currentCount]); // eslint-disable-line

  const reset = () => {
    setVideoFile(null); setThumbFile(null);
    setTitle(""); setDescription(""); setCategory("");
    setChapter(`Module ${String(currentCount + 1).padStart(2, "0")}`);
    setAccent(ACCENT_PRESETS[0]);
    setProgress({ loaded: 0, total: 0, started: 0 });
    setError("");
  };

  const onPickVideo = (file) => {
    if (!file) return;
    setVideoFile(file);
    setError("");
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const formValid = !!videoFile && title.trim().length > 0 && description.trim().length > 0 && !uploading;

  const submit = async () => {
    if (!formValid) return;
    setUploading(true); setError("");
    setProgress({ loaded: 0, total: videoFile.size, started: Date.now() });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const durationSeconds = await getVideoDuration(videoFile).catch(() => 0);
      let thumb = thumbFile;
      if (!thumb) thumb = await extractThumbnail(videoFile).catch(() => null);

      const videoUrl = await uploadVideo({
        file: videoFile, adminPass, signal: ctrl.signal,
        onProgress: (loaded, total) => setProgress(p => ({ ...p, loaded, total }))
      });

      let thumbnailUrl = null;
      if (thumb) {
        thumbnailUrl = await uploadThumbnail({ file: thumb, adminPass, signal: ctrl.signal }).catch(err => {
          console.warn("[upload] thumbnail failed:", err);
          return null;
        });
      }

      onAdd({
        title: title.trim(),
        description: description.trim(),
        chapter: chapter.trim() || `Module ${String(currentCount + 1).padStart(2, "0")}`,
        category: category.trim() || "Module",
        accent,
        videoUrl,
        thumbnail: thumbnailUrl,
        durationSeconds
      });
      reset();
    } catch (e) {
      console.warn("[upload]", e);
      if (e?.message !== "aborted") setError(e?.message || "Upload échoué");
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  };

  const cancel = () => abortRef.current?.abort();

  const pct = progress.total ? (progress.loaded / progress.total) * 100 : 0;
  const elapsed = progress.started ? (Date.now() - progress.started) / 1000 : 0;
  const speedMBs = elapsed > 0 ? (progress.loaded / 1e6) / elapsed : 0;

  return (
    <div className="admin-section">
      <div className="admin-section-header">
        <h2>Téléverser une vidéo</h2>
        <span>R2 · max 10 GB · MP4 / MOV</span>
      </div>

      <div className="upload-card">
        <div className="upload-drop-row">
          <label className={`upload-drop ${videoFile ? "filled" : ""} ${uploading ? "disabled" : ""}`}>
            <input type="file" accept="video/mp4,video/quicktime"
              onChange={e => onPickVideo(e.target.files?.[0])}
              disabled={uploading} style={{ display: "none" }} />
            <div className="upload-drop-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
              </svg>
            </div>
            <div className="upload-drop-text">
              <strong>{videoFile ? videoFile.name : "Choisir une vidéo"}</strong>
              <span>{videoFile ? `${(videoFile.size / 1e9).toFixed(2)} GB` : "MP4 ou MOV — jusqu'à 10 GB"}</span>
            </div>
          </label>

          <label className={`upload-drop subtle ${thumbFile ? "filled" : ""} ${uploading ? "disabled" : ""}`}>
            <input type="file" accept="image/jpeg,image/png"
              onChange={e => setThumbFile(e.target.files?.[0] || null)}
              disabled={uploading} style={{ display: "none" }} />
            <div className="upload-drop-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
            <div className="upload-drop-text">
              <strong>{thumbFile ? thumbFile.name : "Vignette (optionnel)"}</strong>
              <span>{thumbFile ? `${(thumbFile.size / 1024).toFixed(0)} KB` : "Auto-extraite à 5s sinon"}</span>
            </div>
          </label>
        </div>

        <div className="upload-fields">
          <div className="upload-field">
            <label>Titre</label>
            <input className="field-input" value={title} onChange={e => setTitle(e.target.value)} disabled={uploading} placeholder="Titre du module" />
          </div>

          <div className="upload-field">
            <label>Description</label>
            <textarea className="field-input upload-textarea" rows={3} value={description}
              onChange={e => setDescription(e.target.value)} disabled={uploading}
              placeholder="Ce que les élèves vont apprendre..." />
          </div>

          <div className="upload-field-row">
            <div className="upload-field">
              <label>Chapitre</label>
              <input className="field-input" value={chapter} onChange={e => setChapter(e.target.value)} disabled={uploading} />
            </div>
            <div className="upload-field">
              <label>Catégorie</label>
              <input className="field-input" value={category} onChange={e => setCategory(e.target.value)} disabled={uploading} placeholder="Stratégie, Mindset…" />
            </div>
            <div className="upload-field">
              <label>Couleur d'accent</label>
              <div className="upload-swatches">
                {ACCENT_PRESETS.map(c => (
                  <button key={c} type="button"
                    className={`upload-swatch ${accent === c ? "active" : ""}`}
                    style={{ background: c }} onClick={() => setAccent(c)}
                    disabled={uploading} aria-label={c} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {uploading && (
          <div className="upload-progress">
            <div className="upload-bar"><div className="upload-bar-fill" style={{ width: `${pct}%`, background: accent }} /></div>
            <div className="upload-progress-meta">
              <span>{(progress.loaded / 1e6).toFixed(0)} / {(progress.total / 1e6).toFixed(0)} MB</span>
              <span>·</span>
              <span>{speedMBs.toFixed(1)} MB/s</span>
              <span>·</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
          </div>
        )}

        {error && <div className="upload-error">{error}</div>}

        <div className="upload-actions">
          {uploading ? (
            <button className="ghost-btn" onClick={cancel}>Annuler</button>
          ) : (
            <>
              <button className="ghost-btn" onClick={reset} disabled={!videoFile && !title && !description}>Vider</button>
              <button className="primary-btn" onClick={submit} disabled={!formValid}>
                Téléverser
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Drag-and-drop video ordering ─────────────────────────────────────────────

function VideoOrderGrid({ videos, onReorder, onUpdateVideo, onDeleteCustom }) {
  const ref = useRef(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => {
    if (!ref.current || !window.Sortable) return;
    const s = window.Sortable.create(ref.current, {
      animation: 180,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      handle: ".dragcard-handle",
      forceFallback: true, // consistent visuals + touch support
      fallbackClass: "sortable-fallback",
      onEnd: () => {
        const ids = Array.from(ref.current.children).map(el => el.dataset.id).filter(Boolean);
        onReorder(ids);
      }
    });
    return () => s.destroy();
  }, [videos.length]);

  return (
    <div className="dragcard-grid" ref={ref}>
      {videos.map(v => (
        <div key={v.id} data-id={v.id} className={`dragcard ${v.hidden ? "is-hidden" : ""}`}>
          <button className="dragcard-handle" aria-label="Réordonner" type="button">
            <svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor">
              <circle cx="4" cy="4" r="1.6"/><circle cx="10" cy="4" r="1.6"/>
              <circle cx="4" cy="10" r="1.6"/><circle cx="10" cy="10" r="1.6"/>
              <circle cx="4" cy="16" r="1.6"/><circle cx="10" cy="16" r="1.6"/>
            </svg>
          </button>
          <div className="dragcard-thumb"
            style={{
              backgroundImage: v.thumbnail ? `url(${v.thumbnail})` : undefined,
              backgroundColor: v.thumbnail ? "#0f172a" : "transparent",
              background: v.thumbnail ? undefined : (v.poster || `linear-gradient(135deg, ${v.accent || "#2563EB"}33 0%, #0f172a 100%)`)
            }}>
            {!v.thumbnail && <span className="dragcard-thumb-tag">{(v.chapter || "").replace("Module ", "M")}</span>}
          </div>
          <div className="dragcard-body">
            <div className="dragcard-meta">
              <span className="dragcard-chapter">{v.chapter}</span>
              <span className="dragcard-cat" style={{ color: v.accent }}>{v.category}</span>
            </div>
            <input
              className="field-input dragcard-title"
              value={v.title}
              onChange={e => onUpdateVideo(v.id, { title: e.target.value })}
              placeholder="Titre"
            />
          </div>
          <div className="dragcard-actions">
            <button
              className={v.hidden ? "ghost-btn-sm" : "danger-btn-sm"}
              onClick={() => onUpdateVideo(v.id, { hidden: !v.hidden })}
            >
              {v.hidden ? "Afficher" : "Masquer"}
            </button>
            {v.id.startsWith("cv_") && (
              confirmDel === v.id ? (
                <div className="manage-confirm">
                  <button className="danger-btn-sm" onClick={() => { onDeleteCustom(v.id); setConfirmDel(null); }}>Confirmer</button>
                  <button className="ghost-btn-sm" onClick={() => setConfirmDel(null)}>Annuler</button>
                </div>
              ) : (
                <button className="icon-btn" onClick={() => setConfirmDel(v.id)} aria-label="Supprimer la vidéo">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                </button>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function csvEscape(cell) {
  const s = String(cell ?? "");
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadStatsCsv(profiles, watchEvents, videos) {
  const header = ["profil", "role", "module", "titre", "demarre_le", "vu_le", "secondes_visionnees", "progression_pct", "termine"];
  const rows = watchEvents.map(e => {
    const p = profiles.find(x => x.id === e.profileId);
    const v = videos.find(x => x.id === e.videoId);
    if (!p || !v) return null;
    return [
      p.name,
      p.role || "",
      v.chapter,
      v.title,
      e.startedAt ? new Date(e.startedAt).toISOString() : "",
      e.lastSeenAt ? new Date(e.lastSeenAt).toISOString() : "",
      Math.round(e.watchedSeconds || 0),
      Math.round((e.progress || 0) * 100),
      e.completed ? "1" : "0"
    ];
  }).filter(Boolean);

  const csv = [header, ...rows].map(r => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jgmdb-stats-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function AdminView({
  profiles,
  watchEvents,
  videos,
  currentPassword,
  adminPassword,
  onUpdateVideo,
  onUpdateProfile,
  onDeleteProfile,
  onUpdatePassword,
  onAddCustomVideo,
  onDeleteCustomVideo,
  onSetVideoOrder,
  onBack
}) {
  const [selectedProfile, setSelectedProfile] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [pwdDraft, setPwdDraft] = useState(currentPassword || "");
  const [pwdSaved, setPwdSaved] = useState(false);

  useEffect(() => { setPwdDraft(currentPassword || ""); }, [currentPassword]);

  const totalWatchTime = watchEvents.reduce((acc, e) => acc + (e.watchedSeconds || 0), 0);
  const totalCompletions = watchEvents.filter(e => e.completed).length;
  const activeProfiles = new Set(watchEvents.map(e => e.profileId)).size;

  const filtered = selectedProfile === "all"
    ? watchEvents
    : watchEvents.filter(e => e.profileId === selectedProfile);
  const sorted = [...filtered].sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  const completionMatrix = profiles.map(p => ({
    profile: p,
    videos: videos.map(v => {
      const ev = watchEvents.find(e => e.profileId === p.id && e.videoId === v.id);
      return { video: v, event: ev };
    })
  }));

  const savePassword = () => {
    const v = pwdDraft.trim();
    if (!v) return;
    onUpdatePassword(v);
    setPwdSaved(true);
    setTimeout(() => setPwdSaved(false), 1800);
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="brand-mark">
            <span className="admin-tag">Admin</span>
          </div>
          <div className="admin-header-actions">
            <button className="ghost-btn" onClick={() => downloadStatsCsv(profiles, watchEvents, videos)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
              Exporter CSV
            </button>
            <button className="ghost-btn" onClick={onBack}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              Bibliothèque
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="admin-intro">
          <h1>Panneau admin</h1>
          <p>Statistiques, gestion du contenu et des profils.</p>
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

        {/* Upload video */}
        <UploadVideoSection
          adminPass={adminPassword}
          currentCount={videos.length}
          onAdd={onAddCustomVideo}
        />

        {/* Order modules — drag and drop */}
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>Ordre des modules</h2>
            <span>Glisser-déposer · titre éditable</span>
          </div>
          <VideoOrderGrid
            videos={videos}
            onReorder={onSetVideoOrder}
            onUpdateVideo={onUpdateVideo}
            onDeleteCustom={onDeleteCustomVideo}
          />
        </div>

        {/* Manage profiles */}
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>Profils</h2>
            <span>Renommer / supprimer</span>
          </div>
          {profiles.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">○</span>
              <h3>Aucun profil</h3>
              <p>Les profils créés apparaîtront ici.</p>
            </div>
          ) : (
            <div className="manage-list">
              {profiles.map(p => {
                const color = AVATAR_COLORS[p.avatarIndex % AVATAR_COLORS.length];
                return (
                  <div key={p.id} className="manage-row">
                    <div className="manage-avatar" style={{ background: color.bg }}>{getInitials(p.name)}</div>
                    <input
                      className="field-input"
                      value={p.name}
                      onChange={e => onUpdateProfile(p.id, { name: e.target.value })}
                      placeholder="Nom"
                    />
                    <input
                      className="field-input subtle"
                      value={p.role || ""}
                      onChange={e => onUpdateProfile(p.id, { role: e.target.value })}
                      placeholder="Rôle"
                    />
                    {confirmDelete === p.id ? (
                      <div className="manage-confirm">
                        <button className="danger-btn-sm" onClick={() => { onDeleteProfile(p.id); setConfirmDelete(null); }}>Confirmer</button>
                        <button className="ghost-btn-sm" onClick={() => setConfirmDelete(null)}>Annuler</button>
                      </div>
                    ) : (
                      <button className="icon-btn" onClick={() => setConfirmDelete(p.id)} aria-label="Supprimer le profil">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Change access password */}
        <div className="admin-section">
          <div className="admin-section-header">
            <h2>Mot de passe d'accès</h2>
            <span>Page d'entrée</span>
          </div>
          <div className="manage-row pwd-row">
            <input
              className="field-input"
              type="text"
              value={pwdDraft}
              onChange={e => { setPwdDraft(e.target.value); setPwdSaved(false); }}
              placeholder="Nouveau mot de passe"
            />
            <button
              className="primary-btn"
              onClick={savePassword}
              disabled={!pwdDraft.trim() || pwdDraft.trim() === (currentPassword || "").trim()}
            >
              {pwdSaved ? "Enregistré ✓" : "Enregistrer"}
            </button>
          </div>
          <p className="pwd-hint">Le mot de passe admin est séparé et n'est pas modifiable ici.</p>
        </div>

      </main>
    </div>
  );
}

Object.assign(window, { AdminView });
