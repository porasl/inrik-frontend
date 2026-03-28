import React, { useEffect, useRef, useState } from 'react';
import UploadModal from './UploadModal';
import { RegisterModal, ForgotPasswordModal, ActivateModal } from './AuthModals';
import { PUBLIC_BASE } from '../../app.config.js';

export default function Navbar({ isLoggedIn, user, onLogin, onLogout }) {
  const [showUpload, setShowUpload] = useState(false);
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

  const getProfileImage = () => {
    if (!user || !user.avatar || user.avatar === "null" || user.avatar === "") return null;
    return user.avatar.startsWith('http') ? user.avatar : `${PUBLIC_BASE}${user.avatar}`;
  };

  const profileImg = getProfileImage();

  useEffect(() => {
    setShowMobileMenu(false);
  }, [isLoggedIn]);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  const closeMobileMenu = () => setShowMobileMenu(false);

  return (
    <>
      <nav className={`header-bar bg-white border-bottom ${isLoggedIn ? 'header-bar-logged' : 'header-bar-auth'}`}>
        <div className="header-inner px-3">
          {/* --- LOGO --- */}
          <div className="logo-container">
            <div className="mobile-menu-anchor d-md-none" ref={mobileMenuRef}>
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
            <img
              src="resources/images/inrik_logo3_white.png"
              className="company-logo"
              alt="Logo"
            />
          </div>

          {!isLoggedIn ? (
            <div className="header-auth-area d-flex align-items-center gap-2">
              {/* LOGIN GROUP (Inputs on top, links underneath) */}
              <div className="login-section-wrapper d-flex flex-column align-items-end">
                <form onSubmit={handleSubmit} className="login-header-form d-flex align-items-center gap-2">
                  <input
                    type="email"
                    className="form-control form-control-sm login-header-input"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <input
                    type="password"
                    className="form-control form-control-sm login-header-input"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button className="btn btn-primary btn-sm px-3 fw-bold login-header-btn" type="submit">
                    Login
                  </button>
                </form>

                {/* Links aligned under the inputs */}
                <div className="login-sub-links d-flex gap-3 mt-1 pe-5">
                  <button
                    className="btn btn-link p-0 header-sub-link"
                    style={{ fontSize: '11px', color: '#6c757d', textDecoration: 'none' }}
                    onClick={() => setActiveModal('register')}
                    type="button"
                  >
                    Sign On
                  </button>
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
          ) : (
            /* --- LOGGED IN VIEW --- */
            <div className="d-flex align-items-center justify-content-between flex-grow-1 ms-4">
              <div className="nav-center-group desktop-nav-actions d-flex align-items-center gap-2 mx-auto">
                <button className="btn-icon" title="My Content">
                  <i className="bi bi-collection-play fs-5"></i>
                </button>

                <button
                  className="btn-icon"
                  title="Upload"
                  onClick={() => setShowUpload(true)}
                >
                  <i className="bi bi-plus-circle fs-5 text-primary"></i>
                </button>

                <button className="btn btn-sm btn-outline-primary mobile-connection-toggle ms-2" style={{ display: 'none' }} onClick={toggleRightbar}>
                  <i className="bi bi-people-fill"></i>
                </button>

                <button className="btn-icon" title="Marketplace">
                  <i className="bi bi-shop fs-5"></i>
                </button>
              </div>

              <div className="nav-right-group d-flex align-items-center gap-3">
                <button className="btn-icon desktop-settings-btn" title="Settings">
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
                      <div className="w-100 h-100 d-flex align-items-center justify-content-center fw-bold text-secondary">
                        {(user?.email || user?.name || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="text-dark small fw-bold d-none d-md-inline ms-1">
                    {user?.name || user?.email?.split('@')[0] || "User"}
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
      {activeModal === 'register' && <RegisterModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'forgot' && <ForgotPasswordModal onClose={() => setActiveModal(null)} />}
      {activeModal === 'activate' && <ActivateModal onClose={() => setActiveModal(null)} />}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </>
  );
}