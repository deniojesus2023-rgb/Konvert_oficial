import { BrowserRouter, Route, Routes } from "react-router-dom";
import StorefrontApp from "./StorefrontApp";
import { AdminStoreProvider } from "./admin/AdminStoreContext";
import { AdminLayout } from "./admin/AdminLayout";
import { AdminLoginPage } from "./admin/pages/AdminLoginPage";
import { DashboardPage } from "./admin/pages/DashboardPage";
import { ProductsPage } from "./admin/pages/ProductsPage";
import { SettingsPage } from "./admin/pages/SettingsPage";
import { PlatformProvider } from "./platform/PlatformContext";
import { PlatformLayout } from "./platform/PlatformLayout";
import { PlatformLoginPage } from "./platform/pages/PlatformLoginPage";
import { AccountsListPage } from "./platform/pages/AccountsListPage";
import { AccountDetailPage } from "./platform/pages/AccountDetailPage";
import { GlobalMetricsPage } from "./platform/pages/GlobalMetricsPage";

// Three audiences, three subtrees, three contexts that never share state:
// the public storefront ("/"), the store admin panel ("/admin/*", a
// selected-store notion via AdminStoreProvider), and the Konvert
// super-admin panel ("/platform/*", account-scoped via PlatformProvider —
// there is no "selected store" here at all, only accounts).
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
        <Route
          path="/platform/*"
          element={
            <PlatformProvider>
              <Routes>
                <Route path="login" element={<PlatformLoginPage />} />
                <Route element={<PlatformLayout />}>
                  <Route index element={<GlobalMetricsPage />} />
                  <Route path="accounts" element={<AccountsListPage />} />
                  <Route path="accounts/:accountId" element={<AccountDetailPage />} />
                </Route>
              </Routes>
            </PlatformProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
