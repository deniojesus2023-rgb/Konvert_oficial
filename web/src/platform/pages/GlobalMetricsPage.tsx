import { useCallback, useEffect, useState } from "react";
import { usePlatform } from "../PlatformContext";
import { platformApi, PlatformApiError, type GlobalMetrics } from "../platformApi";

export function GlobalMetricsPage() {
  const { token } = usePlatform();
  const [metrics, setMetrics] = useState<GlobalMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setMetrics(await platformApi.getGlobalMetrics(token));
    } catch (err) {
      setError(err instanceof PlatformApiError ? err.message : "Não foi possível carregar as métricas.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="global-metrics-page">
      <h1>Métricas globais da plataforma</h1>
      <p className="hint">
        Única tela do sistema que agrega dados entre contas diferentes — em qualquer outro lugar, isso
        seria vazamento de isolamento entre clientes.
      </p>

      {error && <p className="error">{error}</p>}

      {metrics && (
        <div className="metrics-grid">
          <div className="metric-tile">
            <span className="metric-value">{metrics.activeAccounts}</span>
            <span className="metric-label">Contas ativas</span>
          </div>
          <div className="metric-tile">
            <span className="metric-value">{metrics.totalStores}</span>
            <span className="metric-label">Lojas totais</span>
          </div>
          <div className="metric-tile">
            <span className="metric-value">R$ {Number(metrics.totalRevenue).toFixed(2)}</span>
            <span className="metric-label">Receita agregada</span>
          </div>
        </div>
      )}
    </div>
  );
}
