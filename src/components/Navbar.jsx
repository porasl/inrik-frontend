import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import UploadModal from './UploadModal';
import { RegisterModal, ForgotPasswordModal, ActivateModal } from './AuthModals';
import { PUBLIC_BASE } from '../../app.config.js';

export default function Navbar({ isLoggedIn, user, onLogin, onLogout, onHome, onNotes, onVideos, onPosts, onSlice, onBox, onAudio, onPhotos }) {
  const [showUpload, setShowUpload] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profile');
  const [settingsStatus, setSettingsStatus] = useState('');

  const [profileForm, setProfileForm] = useState({ displayName: '', bio: '', avatarUrl: '' });
  const [privacyForm, setPrivacyForm] = useState({ profileVisible: true, allowConnectionRequests: true });
  const [notificationsForm, setNotificationsForm] = useState({ inApp: true, email: false, connectionRequests: true });
  const [accountForm, setAccountForm] = useState({ twoFactorEnabled: false, requirePasswordForActions: true });
  const [displayNameOverride, setDisplayNameOverride] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeModal, setActiveModal] = useState(null); // 'register' | 'forgot' | 'activate'
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef(null);

  const toggleRightbar = () => {
    const rightBar = document.getElementById('rightbar-id');
    if (rightBar) {
      rightBar.classList.toggle('show-mobile');
    }
  };

  const parseStoredBoolean = (value, fallbackValue) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallbackValue;
  };

  const getProfileImage = () => {
    const savedAvatar = String(localStorage.getItem('userProfileImageUrl') || '').trim();
    if (savedAvatar && savedAvatar !== 'null') {
      return savedAvatar.startsWith('http') ? savedAvatar : `${PUBLIC_BASE}${savedAvatar}`;
    }
    if (!user || !user.avatar || user.avatar === "null" || user.avatar === "") return null;
    return user.avatar.startsWith('http') ? user.avatar : `${PUBLIC_BASE}${user.avatar}`;
  };

  const profileImg = getProfileImage();

  useEffect(() => {
    setShowMobileMenu(false);
    if (!isLoggedIn) {
      setEmail('');
      setPassword('');
      const active = document.activeElement;
      if (active && typeof active.blur === 'function') {
        active.blur();
      }
    }
  }, [isLoggedIn]);

  useEffect(() => {
    const storedDisplayName = String(localStorage.getItem('settings.profile.displayName') || '').trim();
    if (storedDisplayName) setDisplayNameOverride(storedDisplayName);
  }, []);

  useEffect(() => {
    if (!showSettingsModal) return;

    const fallbackDisplayName = displayNameOverride || user?.name || user?.email?.split('@')[0] || '';
    const fallbackAvatar = String(localStorage.getItem('userProfileImageUrl') || user?.avatar || '').trim();

    setProfileForm({
      displayName: String(localStorage.getItem('settings.profile.displayName') || fallbackDisplayName),
      bio: String(localStorage.getItem('settings.profile.bio') || ''),
      avatarUrl: String(localStorage.getItem('settings.profile.avatarUrl') || fallbackAvatar),
    });

    setPrivacyForm({
      profileVisible: parseStoredBoolean(localStorage.getItem('settings.privacy.profileVisible'), true),
      allowConnectionRequests: parseStoredBoolean(localStorage.getItem('settings.privacy.allowConnectionRequests'), true),
    });

    setNotificationsForm({
      inApp: parseStoredBoolean(localStorage.getItem('settings.notifications.inApp'), true),
      email: parseStoredBoolean(localStorage.getItem('settings.notifications.email'), false),
      connectionRequests: parseStoredBoolean(localStorage.getItem('settings.notifications.connectionRequests'), true),
    });

    setAccountForm({
      twoFactorEnabled: parseStoredBoolean(localStorage.getItem('settings.account.twoFactorEnabled'), false),
      requirePasswordForActions: parseStoredBoolean(localStorage.getItem('settings.account.requirePasswordForActions'), true),
    });

    setSettingsStatus('');
  }, [showSettingsModal, user, displayNameOverride]);

  useEffect(() => {
    if (!showMobileMenu) return;

    const handleOutsidePointer = (event) => {
      const container = mobileMenuRef.current;
      if (container && !container.contains(event.target)) {
        setShowMobileMenu(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setShowMobileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer, { passive: true });
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showMobileMenu]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onLogin(email, password);
    setActiveModal(null);
  };

  const closeMobileMenu = () => setShowMobileMenu(false);

  const saveProfileSettings = () => {
    const displayName = String(profileForm.displayName || '').trim();
    const bio = String(profileForm.bio || '').trim();
    const avatarUrl = String(profileForm.avatarUrl || '').trim();

    localStorage.setItem('settings.profile.displayName', displayName);
    localStorage.setItem('settings.profile.bio', bio);
    localStorage.setItem('settings.profile.avatarUrl', avatarUrl);
    localStorage.setItem('userName', displayName);

    if (displayName) {
      const parts = displayName.split(/\s+/).filter(Boolean);
      localStorage.setItem('userFirstName', parts[0] || '');
      localStorage.setItem('userLastName', parts.slice(1).join(' '));
      setDisplayNameOverride(displayName);
    }

    if (avatarUrl) {
      localStorage.setItem('userProfileImageUrl', avatarUrl);
    }

    setSettingsStatus('Profile settings saved.');
  };

  const savePrivacySettings = () => {
    localStorage.setItem('settings.privacy.profileVisible', String(privacyForm.profileVisible));
    localStorage.setItem('settings.privacy.allowConnectionRequests', String(privacyForm.allowConnectionRequests));
    setSettingsStatus('Privacy settings saved.');
  };

  const saveNotificationSettings = () => {
    localStorage.setItem('settings.notifications.inApp', String(notificationsForm.inApp));
    localStorage.setItem('settings.notifications.email', String(notificationsForm.email));
    localStorage.setItem('settings.notifications.connectionRequests', String(notificationsForm.connectionRequests));
    setSettingsStatus('Notification settings saved.');
  };

  const saveAccountSettings = () => {
    localStorage.setItem('settings.account.twoFactorEnabled', String(accountForm.twoFactorEnabled));
    localStorage.setItem('settings.account.requirePasswordForActions', String(accountForm.requirePasswordForActions));
    setSettingsStatus('Account settings saved.');
  };

  return (
    <>
      <nav className={`header-bar bg-white border-bottom ${isLoggedIn ? 'header-bar-logged' : 'header-bar-auth'}`}>
        <div className="header-inner px-3">
          {/* --- LOGO --- */}
          <div className="logo-container">
            <div className="mobile-menu-anchor d-lg-none" ref={mobileMenuRef}>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary mobile-header-menu-btn mobile-menu-left"
                onClick={() => setShowMobileMenu(v => !v)}
                aria-label="Open header menu"
                aria-expanded={showMobileMenu}
              >
                <span className="five-line-icon" aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
              </button>

              {showMobileMenu && (
                <div className="mobile-header-menu-panel">
                  {!isLoggedIn ? (
                    <>
                      <button
                        type="button"
                        className="mobile-header-menu-item"
                        onClick={() => {
                          setActiveModal('login');
                          closeMobileMenu();
                        }}
                      >
                        <i className="bi bi-box-arrow-in-right me-2"></i> Login
                      </button>
                      <button
                        type="button"
                        className="mobile-header-menu-item"
                        onClick={() => {
                          setActiveModal('register');
                          closeMobileMenu();
                        }}
                      >
                        <i className="bi bi-person-plus me-2"></i> Sign On
                      </button>
                      <button
                        type="button"
                        className="mobile-header-menu-item"
                        onClick={() => {
                          setActiveModal('forgot');
                          closeMobileMenu();
                        }}
                      >
                        <i className="bi bi-key me-2"></i> Forgot Password
                      </button>
                      <button
                        type="button"
                        className="mobile-header-menu-item"
                        onClick={() => {
                          setActiveModal('activate');
                          closeMobileMenu();
                        }}
                      >
                        <i className="bi bi-envelope-check me-2"></i> Activate Account
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="mobile-header-menu-item"
                        onClick={() => {
                          setShowUpload(true);
                          closeMobileMenu();
                        }}
                      >
                        <i className="bi bi-cloud-upload me-2"></i> Upload
                      </button>
                      <button
                        type="button"
                        className="mobile-header-menu-item"
                        onClick={() => {
                          toggleRightbar();
                          closeMobileMenu();
                        }}
                      >
                        <i className="bi bi-people me-2"></i> Connections
                      </button>
                      <button
                        type="button"
                        className="mobile-header-menu-item text-danger"
                        onClick={() => {
                          onLogout();
                          closeMobileMenu();
                        }}
                      >
                        <i className="bi bi-box-arrow-right me-2"></i> Logout
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onHome}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}
              aria-label="Go to home"
            >
              <img
                src="/resources/images/inrik_logo.png"
                className="company-logo"
                alt="Logo"
              />
            </button>
          </div>

          {!isLoggedIn ? (
            <div className="d-none d-lg-flex align-items-center justify-content-between flex-grow-1 ms-4 gap-3">
              <div className="nav-center-group desktop-nav-actions d-flex align-items-center gap-1 header-nav-links">
                <button type="button" className="btn btn-sm header-nav-link" onClick={onHome}>
                  <i className="bi bi-house-door me-1"></i><span className="header-nav-link-text">Home</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onNotes}>
                  <i className="bi bi-journal-text me-1"></i><span className="header-nav-link-text">Notes</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onVideos}>
                  <i className="bi bi-play-btn me-1"></i><span className="header-nav-link-text">Videos</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onPosts}>
                  <i className="bi bi-card-text me-1"></i><span className="header-nav-link-text">PostView</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onSlice}>
                  <i className="bi bi-film me-1"></i><span className="header-nav-link-text">Slice</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onBox}>
                  <i className="bi bi-window-stack me-1"></i><span className="header-nav-link-text">BoxView</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onAudio}>
                  <i className="bi bi-music-note-beamed me-1"></i><span className="header-nav-link-text">Audio</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onPhotos}>
                  <i className="bi bi-images me-1"></i><span className="header-nav-link-text">Photos</span>
                </button>
              </div>

              <div className="header-auth-area d-flex align-items-center gap-2">
                <div className="login-section-wrapper d-flex flex-column align-items-end">
                  <div className="d-flex align-items-center gap-2">
                    <button
                      className="btn btn-primary btn-sm px-3 fw-bold login-header-btn"
                      type="button"
                      onClick={() => setActiveModal('login')}
                    >
                      Login
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm px-3"
                      type="button"
                      onClick={() => setActiveModal('register')}
                    >
                      Sign On
                    </button>
                  </div>

                  <div className="login-sub-links d-flex gap-3 mt-1 pe-1">
                    <button
                      className="btn btn-link p-0 header-sub-link"
                      style={{ fontSize: '11px', color: '#6c757d', textDecoration: 'none' }}
                      onClick={() => setActiveModal('forgot')}
                      type="button"
                    >
                      Forgot Password
                    </button>
                    <button
                      className="btn btn-link p-0 header-sub-link"
                      style={{ fontSize: '11px', color: '#6c757d', textDecoration: 'none' }}
                      onClick={() => setActiveModal('activate')}
                      type="button"
                    >
                      Activate Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* --- LOGGED IN VIEW --- */
            <div className="d-flex align-items-center justify-content-between flex-grow-1 ms-4">
              <div className="nav-center-group desktop-nav-actions d-none d-lg-flex align-items-center gap-1 mx-auto header-nav-links">
                <button type="button" className="btn btn-sm header-nav-link" onClick={onHome}>
                  <i className="bi bi-house-door me-1"></i><span className="header-nav-link-text">Home</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onNotes}>
                  <i className="bi bi-journal-text me-1"></i><span className="header-nav-link-text">Notes</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onVideos}>
                  <i className="bi bi-play-btn me-1"></i><span className="header-nav-link-text">Videos</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onPosts}>
                  <i className="bi bi-card-text me-1"></i><span className="header-nav-link-text">PostView</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onSlice}>
                  <i className="bi bi-film me-1"></i><span className="header-nav-link-text">Slice</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onBox}>
                  <i className="bi bi-window-stack me-1"></i><span className="header-nav-link-text">BoxView</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onAudio}>
                  <i className="bi bi-music-note-beamed me-1"></i><span className="header-nav-link-text">Audio</span>
                </button>
                <button type="button" className="btn btn-sm header-nav-link" onClick={onPhotos}>
                  <i className="bi bi-images me-1"></i><span className="header-nav-link-text">Photos</span>
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary ms-1"
                  title="Upload"
                  onClick={() => setShowUpload(true)}
                >
                  <i className="bi bi-plus-circle me-1"></i>Upload
                </button>

                <button className="btn btn-sm btn-outline-primary mobile-connection-toggle ms-2" style={{ display: 'none' }} onClick={toggleRightbar}>
                  <i className="bi bi-people-fill"></i>
                </button>
              </div>

              <div className="nav-right-group d-flex align-items-center gap-3">
                <button
                  className="btn-icon desktop-settings-btn"
                  title="Settings"
                  type="button"
                  onClick={() => {
                    setSettingsTab('profile');
                    setShowSettingsModal(true);
                  }}
                >
                  <i className="bi bi-gear fs-5"></i>
                </button>

                <div className="d-flex align-items-center gap-2 pe-2 border-end border-secondary-subtle nav-user-block">
                  <div
                    className="rounded-circle overflow-hidden shadow-sm nav-user-avatar"
                    style={{ width: '38px', height: '38px', backgroundColor: '#e9ecef' }}
                  >
                    {profileImg ? (
                      <img src={profileImg} alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <i className="bi bi-person-fill text-secondary d-flex justify-content-center align-items-center w-100 h-100"></i>
                    )}
                  </div>
                  <span className="text-dark small fw-bold d-none d-md-inline ms-1">
                    {displayNameOverride || user?.name || user?.email?.split('@')[0] || "User"}
                  </span>
                </div>

                <button onClick={onLogout} className="btn-icon text-danger" title="Logout">
                  <i className="bi bi-box-arrow-right fs-5"></i>
                </button>
              </div>
            </div>
          )}
        </div>

      </nav>

      {/* --- AUTH MODALS --- */}
      {activeModal === 'login' && (
        <div className="modal-overlay" aria-modal="true">
          <div className="modal-content-custom" style={{ maxWidth: 420 }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 fw-bold">Login</h5>
              <button type="button" className="btn btn-sm btn-light" onClick={() => setActiveModal(null)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="d-flex flex-column gap-2">
              <input
                type="email"
                className="form-control"
                style={{ fontSize: '16px' }}
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="form-control"
                style={{ fontSize: '16px' }}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button className="btn btn-primary mt-2" type="submit">Login</button>
            </form>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="modal-overlay" aria-modal="true" onClick={() => setShowSettingsModal(false)}>
          <div className="modal-content-custom" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0 fw-bold">Settings</h5>
              <button type="button" className="btn btn-sm btn-light" onClick={() => setShowSettingsModal(false)}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            <div className="d-grid gap-2 mb-3">
              <button
                type="button"
                className={`btn text-start ${settingsTab === 'profile' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSettingsTab('profile')}
              >
                Profile
              </button>
              <button
                type="button"
                className={`btn text-start ${settingsTab === 'privacy' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSettingsTab('privacy')}
              >
                Privacy
              </button>
              <button
                type="button"
                className={`btn text-start ${settingsTab === 'notifications' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSettingsTab('notifications')}
              >
                Notifications
              </button>
              <button
                type="button"
                className={`btn text-start ${settingsTab === 'account' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setSettingsTab('account')}
              >
                Account
              </button>
            </div>

            <div className="border rounded-3 p-3 bg-light" style={{ minHeight: 120 }}>
              {settingsTab === 'profile' && (
                <div className="d-flex flex-column gap-2">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Display name"
                    value={profileForm.displayName}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, displayName: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Avatar URL"
                    value={profileForm.avatarUrl}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                  />
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Bio"
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))}
                  />
                  <div className="d-flex justify-content-end">
                    <button type="button" className="btn btn-sm btn-primary" onClick={saveProfileSettings}>Save Profile</button>
                  </div>
                </div>
              )}
              {settingsTab === 'privacy' && (
                <div className="d-flex flex-column gap-2">
                  <label className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={privacyForm.profileVisible}
                      onChange={(e) => setPrivacyForm((prev) => ({ ...prev, profileVisible: e.target.checked }))}
                    />
                    <span className="form-check-label">Public profile visible</span>
                  </label>
                  <label className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={privacyForm.allowConnectionRequests}
                      onChange={(e) => setPrivacyForm((prev) => ({ ...prev, allowConnectionRequests: e.target.checked }))}
                    />
                    <span className="form-check-label">Allow connection requests</span>
                  </label>
                  <div className="d-flex justify-content-end">
                    <button type="button" className="btn btn-sm btn-primary" onClick={savePrivacySettings}>Save Privacy</button>
                  </div>
                </div>
              )}
              {settingsTab === 'notifications' && (
                <div className="d-flex flex-column gap-2">
                  <label className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationsForm.inApp}
                      onChange={(e) => setNotificationsForm((prev) => ({ ...prev, inApp: e.target.checked }))}
                    />
                    <span className="form-check-label">In-app notifications</span>
                  </label>
                  <label className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationsForm.email}
                      onChange={(e) => setNotificationsForm((prev) => ({ ...prev, email: e.target.checked }))}
                    />
                    <span className="form-check-label">Email notifications</span>
                  </label>
                  <label className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={notificationsForm.connectionRequests}
                      onChange={(e) => setNotificationsForm((prev) => ({ ...prev, connectionRequests: e.target.checked }))}
                    />
                    <span className="form-check-label">Connection request alerts</span>
                  </label>
                  <div className="d-flex justify-content-end">
                    <button type="button" className="btn btn-sm btn-primary" onClick={saveNotificationSettings}>Save Notifications</button>
                  </div>
                </div>
              )}
              {settingsTab === 'account' && (
                <div className="d-flex flex-column gap-2">
                  <label className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={accountForm.twoFactorEnabled}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, twoFactorEnabled: e.target.checked }))}
                    />
                    <span className="form-check-label">Enable two-factor authentication</span>
                  </label>
                  <label className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={accountForm.requirePasswordForActions}
                      onChange={(e) => setAccountForm((prev) => ({ ...prev, requirePasswordForActions: e.target.checked }))}
                    />
                    <span className="form-check-label">Require password for sensitive actions</span>
                  </label>
                  <div className="d-flex justify-content-end">
                    <button type="button" className="btn btn-sm btn-primary" onClick={saveAccountSettings}>Save Account</button>
                  </div>
                </div>
              )}
            </div>

            {settingsStatus && (
              <div className="small text-success mt-2">{settingsStatus}</div>
            )}
          </div>
        </div>
      )}
      {activeModal === 'register' && <RegisterModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'forgot' && <ForgotPasswordModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'activate' && <ActivateModal onClose={() => setActiveModal(null)} />}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </>
  );
}

Navbar.propTypes = {
  isLoggedIn: PropTypes.bool,
  user: PropTypes.shape({
    avatar: PropTypes.string,
    name: PropTypes.string,
    email: PropTypes.string,
  }),
  onLogin: PropTypes.func,
  onLogout: PropTypes.func,
  onHome: PropTypes.func,
  onNotes: PropTypes.func,
  onVideos: PropTypes.func,
  onPosts: PropTypes.func,
  onSlice: PropTypes.func,
  onBox: PropTypes.func,
  onAudio: PropTypes.func,
  onPhotos: PropTypes.func,
};