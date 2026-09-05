import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAdminStore } from "../AdminStoreContext";
import { adminApi, AdminApiError, type AdminOrder, type OrderStatus } from "../adminApi";

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  canceled: "Cancelado",
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "confirmed",
  confirmed: "preparing",
  preparing: "out_for_delivery",
  out_for_delivery: "delivered",
};

const CANCELABLE: OrderStatus[] = ["pending", "confirmed", "preparing", "out_for_delivery"];

export function DashboardPage() {
  const { storeId } = useOutletContext<{ storeId: string }>();
  const { token } = useAdminStore();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.listOrders(token, {
        storeId,
        status: statusFilter || undefined,
      });
      setOrders(result.items);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível carregar os pedidos.");
    } finally {
      setLoading(false);
    }
  }, [token, storeId, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(order: AdminOrder) {
    const next = NEXT_STATUS[order.status];
    if (!next || !token) return;
    setActionError(null);
    try {
      await adminApi.updateOrderStatus(token, { orderId: order.id, storeId, status: next });
      await load();
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Não foi possível atualizar o pedido.");
    }
  }

  async function cancel(order: AdminOrder) {
    if (!token) return;
    setActionError(null);
    try {
      await adminApi.updateOrderStatus(token, { orderId: order.id, storeId, status: "canceled" });
      await load();
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : "Não foi possível cancelar o pedido.");
    }
  }

  return (
    <div className="dashboard-page">
      <h1>Pedidos</h1>

      <label htmlFor="status-filter">Filtrar por status</label>
      <select
        id="status-filter"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "")}
      >
        <option value="">Todos</option>
        {Object.entries(STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      {error && <p className="error">{error}</p>}
      {actionError && <p className="error">{actionError}</p>}
      {loading && <p>Carregando...</p>}

      {!loading && orders.length === 0 && <p>Nenhum pedido encontrado.</p>}

      <table className="orders-table">
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Status</th>
            <th>Endereço</th>
            <th>Total</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id}>
              <td>{order.id.slice(0, 8)}</td>
              <td>{STATUS_LABELS[order.status]}</td>
              <td>{order.deliveryAddress}</td>
              <td>R$ {Number(order.total).toFixed(2)}</td>
              <td>
                {NEXT_STATUS[order.status] && (
                  <button onClick={() => advance(order)}>
                    Avançar para {STATUS_LABELS[NEXT_STATUS[order.status]!]}
                  </button>
                )}
                {CANCELABLE.includes(order.status) && (
                  <button className="danger" onClick={() => cancel(order)}>
                    Cancelar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
