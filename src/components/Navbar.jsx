import React, { useState } from 'react';
import UploadModal from './UploadModal';
import { RegisterModal, ForgotPasswordModal, ActivateModal } from './AuthModals';
import { PUBLIC_BASE } from '../../app.config.js';

export default function Navbar({ isLoggedIn, user, onLogin, onLogout }) {
  const [showUpload, setShowUpload] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeModal, setActiveModal] = useState(null); // 'register' | 'forgot' | 'activate'

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

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <>
      <nav className="header-bar bg-white border-bottom">
        <div className="header-inner px-3">
          {/* --- LOGO --- */}
          <div className="logo-container">
            <img
              src="resources/images/inrik_logo3_white.png"
              className="company-logo"
              alt="Logo"
            />
          </div>

          {!isLoggedIn ? (
            <div className="d-flex align-items-center gap-4">
              {/* LOGIN GROUP (Inputs on top, links underneath) */}
              <div className="login-section-wrapper d-flex flex-column align-items-end">
                <form onSubmit={handleSubmit} className="d-flex align-items-center gap-2">
                  <input
                    type="email"
                    className="form-control form-control-sm"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{ width: '135px' }}
                    required
                  />
                  <input
                    type="password"
                    className="form-control form-control-sm"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ width: '135px' }}
                    required
                  />
                  <button className="btn btn-primary btn-sm px-3 fw-bold" type="submit" style={{ height: '31px' }}>
                    Login
                  </button>
                </form>

                {/* Links aligned under the inputs */}
                <div className="d-flex gap-3 mt-1 pe-5">
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
              <div className="nav-center-group d-flex align-items-center gap-2 mx-auto">
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
                <button className="btn-icon" title="Settings">
                  <i className="bi bi-gear fs-5"></i>
                </button>

                <div className="d-flex align-items-center gap-2 pe-2 border-end border-secondary-subtle">
                  <div
                    className="rounded-circle overflow-hidden shadow-sm"
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