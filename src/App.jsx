import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Rightbar from './components/Rightbar';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem("token"));


  const [user, setUser] = useState(() => {
    // 1. Check if user data exists in localStorage on startup
    const savedUser = localStorage.getItem("user");
    try {
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
      console.error("Failed to parse user from localStorage", error);
      return null;
    }
  });



  const API_BASE = "http://localhost:8082";

  // 1. Fetch User Data on Load or Login
  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, { // Change this to your "get current user" endpoint
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      }
    } catch (err) {
      console.error("Failed to fetch user profile", err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      setIsLoggedIn(true);
      fetchUserProfile(token);
    }
  }, []);

  // 2. Updated handleLogin
  const handleLogin = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("token", data.token);

        const userData = {
          email: email, // Use the email from the input field
          name: data.username || data.name || "Member",
          avatar: data.profileImageUrl || data.avatar || null 
        };

        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);
        setIsLoggedIn(true);
      } else {
        alert("Login failed: Invalid email or password");
      }
    } catch (err) {
      console.error("Connection error:", err);
      alert("Cannot connect to Java Server. Make sure it is running on port 8082.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
    setUser(null);
  };

  return (
    <div className="app-container">
      <Navbar 
        isLoggedIn={isLoggedIn} 
        user={user} 
        onLogin={handleLogin} 
        onLogout={handleLogout} 
      />
      <div className="app-body-wrapper">
        <Sidebar />
        <main className="main-content">
          <h2 className="text-dark">Main Feed</h2>
          <div className="video-grid">
             {/* This is where your video components will go */}
             <p className="text-secondary">Videos will load here soon...</p>
          </div>
        </main>
        <Rightbar />
      </div>
      {isLoggedIn && (
  <div className="mobile-nav d-md-none fixed-bottom bg-white border-top d-flex justify-content-around py-2 shadow-lg">
    {/* 1. HOME (Matches Sidebar Home) */}
    <button className="btn btn-link text-dark p-1">
      <img src="resources/images/home.png" alt="Home" style={{ width: '30px', height: '30px' }} />
      <div style={{ fontSize: '10px', color: '#555' }}>Home</div>
    </button>

    {/* 2. EXPLORE / CONTENT (Matches Sidebar My Content) */}
    <button className="btn btn-link text-dark p-1">
      <img src="resources/images/photo.png" alt="Explore" style={{ width: '30px', height: '30px' }} />
      <div style={{ fontSize: '10px', color: '#555' }}>Photos</div>
    </button>

    {/* 3. ADD / UPLOAD (The primary action) */}
    <button className="btn btn-link text-dark p-1">
      <img src="resources/images/cut.png" alt="Videos" style={{ width: '30px', height: '30px' }} />
      <div style={{ fontSize: '10px', color: '#555' }}>Slice</div>
    </button>

    {/* 4. SUBSCRIPTIONS (Matches Sidebar Subscriptions) */}
    <button className="btn btn-link text-dark p-1">
      <img src="resources/images/video.png" alt="Videos" style={{ width: '30px', height: '30px' }} />
      <div style={{ fontSize: '10px', color: '#555' }}>Videos</div>
    </button>

    {/* 5. SETTINGS / PROFILE (Matches Header/Sidebar logic) */}
    <button className="btn btn-link text-dark p-1">
      <img src="resources/images/music.png" alt="Settings" style={{ width: '30px', height: '30px' }} />
      <div style={{ fontSize: '10px', color: '#555' }}>Audios</div>
    </button>
  </div>
)}
    </div>
     
  );
}

export default App;