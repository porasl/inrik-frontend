import React, { useState } from 'react';
import UploadModal from './UploadModal';

const APPLICATION_IP = "192.168.4.63";
const PUBLIC_BASE = `http://${APPLICATION_IP}:3000`;

export default function Navbar({ isLoggedIn, user, onLogin, onLogout }) {
  const [showUpload, setShowUpload] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
    <nav className="header-bar bg-white border-bottom">
      <div className="header-inner px-3">
        {/* --- LOGO --- */}
        <div className="logo-container">
          <img 
            src="resources/images/inrik_logo3_white.png" 
            className="company-logo" 
            alt="Logo" 
            style={{ height: '35px', width: 'auto' }} 
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
              <a href="#signon" className="header-sub-link" style={{ fontSize: '11px', color: '#6c757d', textDecoration: 'none' }}>
                  Sign On
                </a>
                <a href="#forgot" className="header-sub-link" style={{ fontSize: '11px', color: '#6c757d', textDecoration: 'none' }}>
                  Forgot Password
                </a>
                <a href="#activate" className="header-sub-link" style={{ fontSize: '11px', color: '#6c757d', textDecoration: 'none' }}>
                  Activate Account
                </a>
              </div>
            </div>
          </div>
        ) : (
          /* --- LOGGED IN VIEW --- */
          <div className="d-flex align-items-center justify-content-between flex-grow-1 ms-4">
            <div className="nav-center-group d-flex align-items-center gap-4 mx-auto">
              <img src="resources/images/myContent.png" className="header-icon-action" alt="Folder" />
              <img 
                src="resources/images/add.png" 
                className="header-icon-action" 
                alt="Add" 
                onClick={() => setShowUpload(true)} 
                style={{ cursor: 'pointer' }}
              />
              <i className="bi bi-shop fs-4 cursor-pointer text-dark"></i>
            </div>

            <div className="nav-right-group d-flex align-items-center gap-3">
              <i className="bi bi-gear-fill fs-5 cursor-pointer text-secondary"></i>
              
              <div className="d-flex align-items-center gap-2 pe-2 border-end">
                <div 
                  className="rounded-circle overflow-hidden border shadow-sm"
                  style={{ width: '38px', height: '38px', backgroundColor: '#f0f2f5' }}
                >
                  {profileImg ? (
                    <img src={profileImg} alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="w-100 h-100 d-flex align-items-center justify-content-center fw-bold text-secondary">
                      {(user?.email || user?.name || 'U').charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="text-dark small fw-bold d-none d-md-inline">
                  {user?.email || "User Account"}
                </span>
              </div>

              <button onClick={onLogout} className="btn btn-link p-0 border-0">
                <img src="/resources/images/logout.png" alt="Logout" style={{ width: '22px' }} />
              </button>

              <button className="btn btn-sm btn-outline-primary mobile-connection-toggle ms-2" style={{ display: 'none' }} onClick={toggleRightbar}>
                 <i className="bi bi-people-fill"></i>
              </button>
            </div>
          </div>
        )}
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </nav>
  );
}