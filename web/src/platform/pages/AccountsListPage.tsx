import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePlatform } from "../PlatformContext";
import { platformApi, PlatformApiError, type Account, type AccountPlan, type AccountStatus } from "../platformApi";

const PLAN_LABELS: Record<AccountPlan, string> = {
  trial: "Trial",
  basic: "Basic",
  pro: "Pro",
  enterprise: "Enterprise",
};

const STATUS_LABELS: Record<AccountStatus, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  canceled: "Cancelada",
};

export function AccountsListPage() {
  const { token } = usePlatform();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState<AccountPlan | "">("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await platformApi.listAccounts(token, {
        search: search || undefined,
        plan: plan || undefined,
        status: status || undefined,
      });
      setAccounts(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof PlatformApiError ? err.message : "Não foi possível carregar as contas.");
    } finally {
      setLoading(false);
    }
  }, [token, search, plan, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="accounts-list-page">
      <h1>Contas ({total})</h1>

      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <input
          placeholder="Buscar por nome da conta ou e-mail do dono"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select value={plan} onChange={(event) => setPlan(event.target.value as AccountPlan | "")}>
          <option value="">Todos os planos</option>
          {Object.entries(PLAN_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(event) => setStatus(event.target.value as AccountStatus | "")}>
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button type="submit">Buscar</button>
      </form>

      {error && <p className="error">{error}</p>}
      {loading && <p>Carregando...</p>}

      <table className="orders-table">
        <thead>
          <tr>
            <th>Conta</th>
            <th>Plano</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => (
            <tr key={account.id}>
              <td>{account.name}</td>
              <td>{PLAN_LABELS[account.plan]}</td>
              <td>
                <span className={`status-badge status-${account.status}`}>
                  {STATUS_LABELS[account.status]}
                </span>
              </td>
              <td>
                <Link to={`/platform/accounts/${account.id}`}>Ver detalhes</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
