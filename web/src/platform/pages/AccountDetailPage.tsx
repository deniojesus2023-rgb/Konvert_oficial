import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { usePlatform } from "../PlatformContext";
import {
  platformApi,
  PlatformApiError,
  type AccountDetail,
  type AccountPlan,
} from "../platformApi";

const PLANS: AccountPlan[] = ["trial", "basic", "pro", "enterprise"];

export function AccountDetailPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const { token } = usePlatform();
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [impersonateToken, setImpersonateToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !accountId) return;
    setError(null);
    try {
      setDetail(await platformApi.getAccountDetail(token, accountId));
    } catch (err) {
      setError(err instanceof PlatformApiError ? err.message : "Não foi possível carregar a conta.");
    }
  }, [token, accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSuspend() {
    if (!token || !accountId) return;
    setActionError(null);
    try {
      await platformApi.suspendAccount(token, { accountId, reason: reason || "Sem motivo informado" });
      setReason("");
      await load();
    } catch (err) {
      setActionError(err instanceof PlatformApiError ? err.message : "Não foi possível suspender a conta.");
    }
  }

  async function handleReactivate() {
    if (!token || !accountId) return;
    setActionError(null);
    try {
      await platformApi.reactivateAccount(token, { accountId, reason: reason || "Sem motivo informado" });
      setReason("");
      await load();
    } catch (err) {
      setActionError(err instanceof PlatformApiError ? err.message : "Não foi possível reativar a conta.");
    }
  }

  async function handleChangePlan(newPlan: AccountPlan) {
    if (!token || !accountId) return;
    setActionError(null);
    try {
      await platformApi.changeAccountPlan(token, { accountId, newPlan });
      await load();
    } catch (err) {
      setActionError(err instanceof PlatformApiError ? err.message : "Não foi possível trocar o plano.");
    }
  }

  async function handleImpersonate() {
    if (!token || !accountId) return;
    setActionError(null);
    try {
      const result = await platformApi.impersonateAccount(token, accountId);
      setImpersonateToken(result.token);
    } catch (err) {
      setActionError(err instanceof PlatformApiError ? err.message : "Não foi possível iniciar o modo suporte.");
    }
  }

  async function handleEndImpersonation() {
    if (!token || !accountId) return;
    await platformApi.endImpersonation(token, accountId);
    setImpersonateToken(null);
  }

  if (error) return <p className="error">{error}</p>;
  if (!detail) return <p>Carregando...</p>;

  return (
    <div className="account-detail-page">
      <h1>{detail.account.name}</h1>
      <p>
        Plano: <strong>{detail.account.plan}</strong> · Status: <strong>{detail.account.status}</strong>
      </p>

      <section>
        <h2>Métricas (todas as lojas desta conta)</h2>
        <p>Pedidos: {detail.metrics.orderCount}</p>
        <p>Receita: R$ {Number(detail.metrics.revenue).toFixed(2)}</p>
      </section>

      <section>
        <h2>Lojas</h2>
        <ul>
          {detail.stores.map((store) => (
            <li key={store.id}>
              {store.name} ({store.status})
            </li>
          ))}
        </ul>
      </section>

      <section className="platform-actions">
        <h2>Ações</h2>
        {actionError && <p className="error">{actionError}</p>}

        <input
          placeholder="Motivo (suspender/reativar)"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="button-row">
          {detail.account.status === "active" ? (
            <button className="danger" onClick={handleSuspend}>
              Suspender conta
            </button>
          ) : (
            <button onClick={handleReactivate}>Reativar conta</button>
          )}
        </div>

        <label htmlFor="plan-select">Trocar plano</label>
        <select
          id="plan-select"
          value={detail.account.plan}
          onChange={(event) => handleChangePlan(event.target.value as AccountPlan)}
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <div className="button-row">
          {!impersonateToken ? (
            <button onClick={handleImpersonate}>Entrar como suporte (15 min)</button>
          ) : (
            <button className="danger" onClick={handleEndImpersonation}>
              Encerrar modo suporte
            </button>
          )}
        </div>
        {impersonateToken && (
          <p className="hint">
            Sessão de suporte ativa. Toda ação nesse modo é feita como o admin desta conta e fica
            registrada no log de auditoria.
          </p>
        )}
      </section>
    </div>
  );
}
