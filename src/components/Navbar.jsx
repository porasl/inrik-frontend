import React, { useState } from 'react';

export default function Navbar({ isLoggedIn, user, onLogin, onLogout }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
            style={{ height: '35px' }} 
          />
        </div>

        {!isLoggedIn ? (
          <>
            {/* --- GUEST LINKS --- */}
            <div className="auth-links-container d-none d-lg-block">
              <ul className="d-flex gap-4 m-0 list-unstyled">
                <li><a href="#create" className="top-link small fw-bold text-dark text-decoration-none">Create Account</a></li>
                <li><a href="#forgot" className="top-link small fw-bold text-dark text-decoration-none">Forgot Password</a></li>
                <li><a href="#activate" className="top-link small fw-bold text-dark text-decoration-none">Activate Account</a></li>
              </ul>
            </div>

            {/* --- LOGIN FORM --- */}
            <div className="login-form">
              <form onSubmit={handleSubmit} className="d-flex align-items-center gap-2">
                <input 
                  type="email" 
                  className="form-control form-control-sm" 
                  placeholder="Email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '150px' }}
                  required 
                />
                <input 
                  type="password" 
                  className="form-control form-control-sm" 
                  placeholder="Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '150px' }}
                  required 
                />
                <button className="btn btn-primary btn-sm px-3" type="submit">Login</button>
              </form>
            </div>
          </>
        ) : (
          /* --- LOGGED-IN VIEW --- */
         
          <div className="user-controls d-flex align-items-center gap-3">
          <div className="d-flex align-items-center gap-2">
            {/* Profile Circle - Using a light gray instead of dark */}
            <div 
              className="rounded-circle d-flex align-items-center justify-content-center"
              style={{ 
                width: '35px', 
                height: '35px', 
                backgroundColor: '#e9ecef', // Light Gray
                border: '1px solid #dee2e6' 
              }}
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="P" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '12px', color: '#6c757d', fontWeight: 'bold' }}>
                  {user?.name?.charAt(0) || 'U'}
                </span>
              )}
            </div>
            
            <span className="text-dark small fw-bold">
              {user?.name || "Member"}
            </span>
          </div>
        
          <button 
            onClick={onLogout}
            className="btn btn-link p-0 ms-2"
            style={{ borderLeft: '1px solid #ddd', paddingLeft: '10px' }}
          >
            <img 
              src="/resources/images/logout.png" 
              alt="Logout" 
              style={{ width: '20px', height: '20px' }} 
            />
          </button>
        </div>
        )}
      </div>
    </nav>
  );
}