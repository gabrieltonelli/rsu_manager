import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import { LoginPage, OAuthCallbackPage, PendingApprovalPage } from './pages/LoginPage';
import PublicVolquetesPage from './pages/PublicVolquetesPage';
import AdminUsuariosPage from './pages/AdminUsuariosPage';
import AdminTiposResiduoPage from './pages/AdminTiposResiduoPage';
import AdminPuntosPage from './pages/AdminPuntosPage';
import AdminRecolectoresPage from './pages/AdminRecolectoresPage';
import AdminRutasPage from './pages/AdminRutasPage';
import AdminVolquetesPage from './pages/AdminVolquetesPage';
import AdminClientesPage from './pages/AdminClientesPage';
import AdminAuditoriaPage from './pages/AdminAuditoriaPage';
import RecolectorHomePage from './pages/RecolectorHomePage';
import ClienteDashboardPage from './pages/ClienteDashboardPage';
import TrazabilidadPage from './pages/TrazabilidadPage';

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Verificando sesión segura...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.rol_codigo === 'pendiente_aprobacion') return <Navigate to="/pendiente" replace />;
  if (user.rol_codigo === 'recolector') return <Navigate to="/recolector" replace />;
  if (user.rol_codigo === 'cliente') return <Navigate to="/mi-dashboard" replace />;
  return <Navigate to="/usuarios" replace />;
}

function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Verificando permisos en tiempo real...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.rol_codigo === 'pendiente_aprobacion') return <Navigate to="/pendiente" replace />;
  if (allowedRoles && !allowedRoles.includes(user.rol_codigo)) {
    return <HomeRedirect />;
  }
  return <AppLayout>{children}</AppLayout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Rutas Públicas y de Autenticación */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/oauth-callback" element={<OAuthCallbackPage />} />
          <Route path="/pendiente" element={<PendingApprovalPage />} />
          <Route path="/volquetes/solicitud" element={<PublicVolquetesPage />} />

          {/* Rutas de Administración */}
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute allowedRoles={['administrador']}>
                <AdminUsuariosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tipos-residuo"
            element={
              <ProtectedRoute allowedRoles={['administrador']}>
                <AdminTiposResiduoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/puntos"
            element={
              <ProtectedRoute allowedRoles={['administrador']}>
                <AdminPuntosPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/recolectores"
            element={
              <ProtectedRoute allowedRoles={['administrador']}>
                <AdminRecolectoresPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rutas"
            element={
              <ProtectedRoute allowedRoles={['administrador']}>
                <AdminRutasPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/volquetes-admin"
            element={
              <ProtectedRoute allowedRoles={['administrador']}>
                <AdminVolquetesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/clientes"
            element={
              <ProtectedRoute allowedRoles={['administrador']}>
                <AdminClientesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/auditoria"
            element={
              <ProtectedRoute allowedRoles={['administrador']}>
                <AdminAuditoriaPage />
              </ProtectedRoute>
            }
          />

          {/* Rutas de Recolector */}
          <Route
            path="/recolector"
            element={
              <ProtectedRoute allowedRoles={['recolector', 'administrador']}>
                <RecolectorHomePage />
              </ProtectedRoute>
            }
          />

          {/* Rutas de Cliente */}
          <Route
            path="/mi-dashboard"
            element={
              <ProtectedRoute allowedRoles={['cliente', 'administrador']}>
                <ClienteDashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Reporte General de Trazabilidad (Todos los perfiles) */}
          <Route
            path="/trazabilidad"
            element={
              <ProtectedRoute allowedRoles={['administrador', 'recolector', 'cliente']}>
                <TrazabilidadPage />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

