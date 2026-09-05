import { Navigate, NavLink, Outlet } from "react-router-dom";
import { usePlatform } from "./PlatformContext";

export function PlatformLayout() {
  const { token, user, loading, forbidden, logout } = usePlatform();

  if (!token) {
    return <Navigate to="/platform/login" replace />;
  }

  if (loading) {
    return <p className="admin-loading">Carregando...</p>;
  }

  // Logged in, but not a platform_admin: explicit 403, not a silent
  // redirect back to login (that would look like the login failed).
  if (forbidden) {
    return (
      <div className="platform-forbidden">
        <h1>403 — Acesso restrito</h1>
        <p>Esta área é exclusiva da equipe Konvert (platform_admin).</p>
        <button onClick={logout}>Voltar ao login</button>
      </div>
    );
  }

  return (
    <div className="admin-app">
      <header className="admin-topbar platform-topbar">
        <span className="admin-brand">Konvert · Plataforma</span>
        <nav className="admin-nav">
          <NavLink to="/platform" end>
            Métricas globais
          </NavLink>
          <NavLink to="/platform/accounts">Contas</NavLink>
        </nav>
        <span className="admin-user">{user?.email}</span>
        <button onClick={logout}>Sair</button>
      </header>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
