import { Navigate, NavLink, Outlet } from "react-router-dom";
import { useAdminStore } from "./AdminStoreContext";

export function AdminLayout() {
  const { token, user, stores, selectedStoreId, setSelectedStoreId, loading, logout } =
    useAdminStore();

  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }

  if (loading) {
    return <p className="admin-loading">Carregando...</p>;
  }

  return (
    <div className="admin-app">
      <header className="admin-topbar">
        <span className="admin-brand">Konvert</span>

        {stores.length > 1 && (
          <select
            value={selectedStoreId ?? ""}
            onChange={(event) => setSelectedStoreId(event.target.value)}
            aria-label="Loja selecionada"
          >
            <option value="" disabled>
              Selecione uma loja
            </option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        )}
        {stores.length === 1 && <span className="admin-store-name">{stores[0]!.name}</span>}

        <nav className="admin-nav">
          <NavLink to="/admin" end>
            Pedidos
          </NavLink>
          <NavLink to="/admin/products">Produtos</NavLink>
          <NavLink to="/admin/settings">Configurações</NavLink>
        </nav>

        <span className="admin-user">
          {user?.email} ({user?.role})
        </span>
        <button onClick={logout}>Sair</button>
      </header>

      <main className="admin-content">
        {!selectedStoreId ? (
          <p>Selecione uma loja para continuar.</p>
        ) : (
          <Outlet context={{ storeId: selectedStoreId }} />
        )}
      </main>
    </div>
  );
}
