import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../index.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success) {
        navigate('/servers');
      } else {
        alert(data.error || 'Login failed');
      }
    } catch (err) {
      alert('Error connecting to backend');
    }
  };

  return (
    <div className="app-container login-page">
      <div className="glass-panel login-card">
        <img src="/title.png" alt="MonikaShell" className="login-logo" />
        <h1 className="login-title animate-rise">Welcome to MonikaShell!</h1>
        <p className="login-subtitle animate-rise delay-1">Please login to continue</p>
        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field animate-rise delay-2">
            <label className="login-label">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="login-input"
              required
            />
          </div>
          <div className="login-field animate-rise delay-3">
            <label className="login-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
            />
          </div>
          <button type="submit" className="btn btn-primary login-button animate-rise delay-4">
            Connect
          </button>
        </form>
      </div>
    </div>
  );
}
