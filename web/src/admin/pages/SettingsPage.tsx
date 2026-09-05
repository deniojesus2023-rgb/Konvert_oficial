import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAdminStore } from "../AdminStoreContext";
import { adminApi, AdminApiError } from "../adminApi";

const FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "pixKey", label: "Chave PIX" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "openingHours", label: "Horário de funcionamento" },
];

export function SettingsPage() {
  const { storeId } = useOutletContext<{ storeId: string }>();
  const { token } = useAdminStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const settings = await adminApi.getSettings(token, storeId);
      setValues(settings);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    try {
      await Promise.all(
        FIELDS.map((field) =>
          adminApi.setSetting(token, { storeId, key: field.key, value: values[field.key] ?? "" }),
        ),
      );
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível salvar as configurações.");
    }
  }

  if (loading) return <p>Carregando...</p>;

  return (
    <div className="settings-page">
      <h1>Configurações da loja</h1>
      <form onSubmit={handleSubmit}>
        {FIELDS.map((field) => (
          <div key={field.key} className="field">
            <label htmlFor={field.key}>{field.label}</label>
            <input
              id={field.key}
              value={values[field.key] ?? ""}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.key]: event.target.value }))
              }
            />
          </div>
        ))}

        {error && <p className="error">{error}</p>}
        {savedAt && <p className="success">Configurações salvas.</p>}

        <button type="submit">Salvar</button>
      </form>
    </div>
  );
}
