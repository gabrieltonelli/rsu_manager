import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../api/http';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState({ geofenceRadiusMeters: 250 });
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch('/auth/me');
      setUser(data.user || null);
      if (data.config) setConfig(data.config);
      return data.user;
    } catch (err) {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(data.user);
    return data.user;
  };

  const startGoogleOAuth = async () => {
    const data = await apiFetch('/auth/google');
    if (data?.url) {
      window.location.href = data.url;
    }
    return data;
  };

  const registerGooglePending = async (email, nombre_completo) => {
    const data = await apiFetch('/auth/google-register-request', {
      method: 'POST',
      body: JSON.stringify({ email, nombre_completo }),
    });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (err) {
      // Ignorar si ya expiró
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        config,
        loading,
        login,
        startGoogleOAuth,
        registerGooglePending,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

