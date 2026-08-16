import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TerminalPage from './pages/TerminalPage';
import AdminUsers from './pages/AdminUsers';
import AdminServers from './pages/AdminServers';
import Layout from './components/Layout';
import TitleManager from './components/TitleManager';
import './index.css';

function App() {
  return (
    <Router>
      <TitleManager />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Authenticated routes wrapped in Layout */}
        <Route element={<Layout />}>
          <Route path="/servers" element={<Dashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/servers" element={<AdminServers />} />
          {/* We can add /users, /settings etc here */}
        </Route>
        
        <Route path="/server/:uuid" element={<TerminalPage />} />
        <Route path="/" element={<Navigate to="/servers" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
