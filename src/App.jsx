import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Rightbar from './components/Rightbar';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);

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
        
        // If your login response includes user info, set it here
        // Otherwise, call fetchUserProfile(data.token)
        setUser({
          name: data.username || data.name || "Authenticated User",
          avatar: data.profileImageUrl || null
        });
        
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
    </div>
  );
}

export default App;