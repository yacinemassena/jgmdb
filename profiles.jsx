// =============================================================================
// Profile Picker — Netflix-style
// =============================================================================

function ProfilePicker({ profiles, onSelect, onAdd, onEdit, onAdminAccess }) {
  const [selectingId, setSelectingId] = useState(null);

  const handleSelect = (id) => {
    setSelectingId(id);
    setTimeout(() => onSelect(id), 260);
  };

  return (
    <div className="picker-page">
      <header className="brand-header">
        <div className="brand-mark"></div>
      </header>

      <main className="picker-main">
        <div className="picker-intro">
          <h1 className="picker-title">Qui regarde aujourd'hui ?</h1>
          <p className="picker-subtitle">Choisissez votre profil pour reprendre votre parcours.</p>
        </div>

        <div className="profiles-grid">
          {profiles.map((p, idx) => {
            const color = AVATAR_COLORS[p.avatarIndex % AVATAR_COLORS.length];
            const isSelecting = selectingId === p.id;
            return (
              <button
                key={p.id}
                className={`profile-card ${isSelecting ? "selecting" : ""}`}
                onClick={() => handleSelect(p.id)}
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="profile-avatar" style={{ background: color.bg }}>
                  <span className="profile-initials">{getInitials(p.name)}</span>
                  <div className="profile-ring" style={{ borderColor: color.solid }}></div>
                </div>
                <div className="profile-meta">
                  <span className="profile-name">{p.name}</span>
                  {p.role && <span className="profile-role">{p.role}</span>}
                </div>
              </button>
            );
          })}

          <button
            className="profile-card add-card"
            onClick={onAdd}
            style={{ animationDelay: `${profiles.length * 60}ms` }}
          >
            <div className="profile-avatar add-avatar">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <div className="profile-meta">
              <span className="profile-name">Ajouter un profil</span>
              <span className="profile-role">Nouveau</span>
            </div>
          </button>
        </div>

        {profiles.length > 0 && (
          <div className="picker-actions">
            <button className="ghost-btn" onClick={onEdit}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Gérer les profils
            </button>
          </div>
        )}
      </main>

      <footer className="picker-footer"></footer>

      {onAdminAccess && (
        <button type="button" className="gate-admin-link" onClick={onAdminAccess}>
          Accès admin →
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Create Profile
// =============================================================================
function CreateProfile({ onSave, onCancel }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [avatarIndex, setAvatarIndex] = useState(() => Math.floor(Math.random() * AVATAR_COLORS.length));
  const [touched, setTouched] = useState(false);

  const valid = name.trim().length >= 2;

  const handleSubmit = (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSave({ name: name.trim(), role: role.trim(), avatarIndex });
  };

  const color = AVATAR_COLORS[avatarIndex];

  return (
    <div className="create-page">
      <header className="brand-header">
        <div className="brand-mark"></div>
      </header>

      <main className="create-main">
        <form className="create-form" onSubmit={handleSubmit}>
          <h1 className="create-title">Créer un profil</h1>
          <p className="create-subtitle">Indiquez votre nom pour suivre votre progression.</p>

          <div className="avatar-preview-wrap">
            <div className="avatar-preview" style={{ background: color.bg }}>
              <span className="avatar-preview-initials">{getInitials(name) || "?"}</span>
            </div>
            <div className="avatar-glow" style={{ background: `radial-gradient(circle, ${color.solid}40 0%, transparent 70%)` }}></div>
          </div>

          <div className="avatar-picker">
            {AVATAR_COLORS.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`avatar-swatch ${i === avatarIndex ? "selected" : ""}`}
                style={{ background: c.bg }}
                onClick={() => setAvatarIndex(i)}
                aria-label={`Avatar color ${i + 1}`}
              />
            ))}
          </div>

          <div className="form-fields">
            <div className="field">
              <label className="field-label">Nom complet</label>
              <input
                className={`field-input ${touched && !valid ? "error" : ""}`}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ex. Jordan Smith"
                autoFocus
                maxLength={40}
              />
              {touched && !valid && <span className="field-error">Merci de saisir votre nom complet</span>}
            </div>

          </div>

          <div className="form-actions">
            <button type="submit" className={`primary-btn ${!valid ? "disabled" : ""}`} disabled={!valid}>
              Créer le profil
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
            </button>
            <button type="button" className="ghost-btn" onClick={onCancel}>Annuler</button>
          </div>
        </form>
      </main>
    </div>
  );
}

// =============================================================================
// Edit Profiles
// =============================================================================
function EditProfiles({ profiles, onUpdate, onDone }) {
  return (
    <div className="edit-page">
      <header className="brand-header">
        <div className="brand-mark"></div>
      </header>

      <main className="edit-main">
        <h1 className="edit-title">Gérer les profils</h1>
        <p className="edit-subtitle">Modifiez les noms et rôles de vos profils.</p>

        <div className="edit-list">
          {profiles.map(p => {
            const color = AVATAR_COLORS[p.avatarIndex % AVATAR_COLORS.length];
            return (
              <div key={p.id} className="edit-row">
                <div className="edit-avatar" style={{ background: color.bg }}>
                  <span>{getInitials(p.name)}</span>
                </div>
                <div className="edit-fields">
                  <input
                    className="edit-input"
                    value={p.name}
                    onChange={e => onUpdate(p.id, { name: e.target.value })}
                    placeholder="Nom"
                  />
                  <input
                    className="edit-input subtle"
                    value={p.role || ""}
                    onChange={e => onUpdate(p.id, { role: e.target.value })}
                    placeholder="Rôle (optionnel)"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="form-actions">
          <button className="primary-btn" onClick={onDone}>Terminé</button>
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { ProfilePicker, CreateProfile, EditProfiles });
