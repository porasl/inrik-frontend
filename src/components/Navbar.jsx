import React, { useState } from 'react';
import UploadModal from './UploadModal';

export default function Navbar({ isLoggedIn, user, onLogin, onLogout }) {
  const [showUpload, setShowUpload] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  return (
    <nav className="header-bar bg-white border-bottom">
      <div className="header-inner px-3">
        {/* --- LEFT: LOGO --- */}
        <div className="logo-container">
          <img 
            src="resources/images/inrik_logo3_white.png" 
            className="company-logo" 
            alt="Logo" 
            style={{ height: '35px' }} 
          />
        </div>

        {!isLoggedIn ? (
          <>
            {/* --- GUEST: LINKS (Centered) --- */}
            <div className="auth-links-container d-none d-lg-block">
              <ul className="d-flex gap-4 m-0 list-unstyled">
                <li><a href="#create" className="top-link small text-dark text-decoration-none">Create Account</a></li>
                <li><a href="#forgot" className="top-link small text-dark text-decoration-none">Forgot Password</a></li>
                <li><a href="#activate" className="top-link small text-dark text-decoration-none">Activate Account</a></li>
              </ul>
            </div>

            {/* --- GUEST: LOGIN FORM (Right) --- */}
            <div className="login-form">
              <form onSubmit={handleSubmit} className="d-flex align-items-center gap-2">
                <input 
                  type="email" 
                  className="form-control form-control-sm" 
                  placeholder="Email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '130px' }}
                  required 
                />
                <input 
                  type="password" 
                  className="form-control form-control-sm" 
                  placeholder="Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '130px' }}
                  required 
                />
                <button className="btn btn-primary btn-sm px-3 fw-bold" type="submit">Login</button>
              </form>
            </div>
          </>
        ) : (
          /* --- LOGGED-IN VIEW: THE 5 CONTROLS --- */
          <div className="d-flex align-items-center justify-content-between flex-grow-1 ms-4">
            
            {/* CENTER: 3) Add, 4) Folder, 5) Bazaar */}
            <div className="nav-center-group d-flex align-items-center gap-4 mx-auto">
              <img 
                src="resources/images/myContent.png" 
                alt="Folder" 
                className="header-icon-action" 
                title="My Folder"
              />
              <img 
                src="resources/images/add.png" 
                alt="Add" 
                className="header-icon-action" 
                title="Upload Video"
                onClick={() => setShowUpload(true)} 
              />
              <i className="bi bi-shop fs-4 cursor-pointer text-dark" title="Bazaar"></i>
            </div>

            {/* RIGHT: 2) Settings, 1) User Profile, Logout */}
            <div className="nav-right-group d-flex align-items-center gap-3">
              <i className="bi bi-gear-fill fs-5 cursor-pointer text-secondary" title="Settings"></i>
              
              <div className="d-flex align-items-center gap-2 pe-2 border-end">
                <div 
                  className="rounded-circle overflow-hidden border"
                  style={{ width: '35px', height: '35px', backgroundColor: '#eee' }}
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt="User" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="w-100 h-100 d-flex align-items-center justify-content-center fw-bold text-secondary">
                      {user?.name?.charAt(0) || 'U'}
                    </div>
                  )}
                </div>
                <span className="text-dark small fw-bold d-none d-md-inline">
                  {user?.name || "Member"}
                </span>
              </div>

              <button onClick={onLogout} className="btn btn-link p-0 text-decoration-none">
                <img src="/resources/images/logout.png" alt="Logout" style={{ width: '22px' }} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* REACT POPUP FOR ADD ICON */}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </nav>
  );
}