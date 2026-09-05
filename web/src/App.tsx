import { BrowserRouter, Route, Routes } from "react-router-dom";
import StorefrontApp from "./StorefrontApp";
import { AdminStoreProvider } from "./admin/AdminStoreContext";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminLoginPage } from "./admin/pages/AdminLoginPage";
import { DashboardPage } from "./admin/pages/DashboardPage";
import { ProductsPage } from "./admin/pages/ProductsPage";
import { SettingsPage } from "./admin/pages/SettingsPage";

// Two audiences, two subtrees: the public storefront ("/") never shares
// state with the staff panel ("/admin/*"), which carries its own
// AdminStoreProvider (staff auth + selected store) scoped to it alone.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StorefrontApp />} />
        <Route
          path="/admin/*"
          element={
            <AdminStoreProvider>
              <Routes>
                <Route path="login" element={<AdminLoginPage />} />
                <Route element={<AdminLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="products" element={<ProductsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
              </Routes>
            </AdminStoreProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
