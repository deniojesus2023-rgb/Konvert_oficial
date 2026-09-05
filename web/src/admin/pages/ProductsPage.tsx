import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useAdminStore } from "../AdminStoreContext";
import { adminApi, AdminApiError, type AdminCategory, type AdminProduct } from "../adminApi";

export function ProductsPage() {
  const { storeId } = useOutletContext<{ storeId: string }>();
  const { token } = useAdminStore();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");

  const [newProduct, setNewProduct] = useState({
    name: "",
    categoryId: "",
    price: "",
    description: "",
    imageUrl: "",
  });

  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", price: "", categoryId: "" });

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const [cats, prods] = await Promise.all([
        adminApi.listCategories(token, storeId),
        adminApi.listProducts(token, storeId),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível carregar o cardápio.");
    }
  }, [token, storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreateCategory(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !newCategoryName.trim()) return;
    try {
      await adminApi.createCategory(token, { storeId, name: newCategoryName.trim() });
      setNewCategoryName("");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível criar a categoria.");
    }
  }

  async function handleToggleCategory(category: AdminCategory) {
    if (!token) return;
    try {
      if (category.active) {
        await adminApi.deleteCategory(token, { categoryId: category.id, storeId });
      } else {
        await adminApi.updateCategory(token, { categoryId: category.id, storeId });
      }
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível atualizar a categoria.");
    }
  }

  async function handleCreateProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    const price = Number(newProduct.price.replace(",", "."));
    if (!newProduct.name.trim() || !newProduct.categoryId || Number.isNaN(price)) {
      setError("Preencha nome, categoria e preço válidos.");
      return;
    }
    try {
      await adminApi.createProduct(token, {
        storeId,
        categoryId: newProduct.categoryId,
        name: newProduct.name.trim(),
        description: newProduct.description.trim() || undefined,
        price,
        imageUrl: newProduct.imageUrl.trim() || undefined,
      });
      setNewProduct({ name: "", categoryId: "", price: "", description: "", imageUrl: "" });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível criar o produto.");
    }
  }

  function startEdit(product: AdminProduct) {
    setEditingProductId(product.id);
    setEditDraft({ name: product.name, price: product.price, categoryId: product.categoryId });
  }

  async function saveEdit(productId: string) {
    if (!token) return;
    const price = Number(editDraft.price.replace(",", "."));
    try {
      await adminApi.updateProduct(token, {
        productId,
        storeId,
        name: editDraft.name.trim(),
        categoryId: editDraft.categoryId,
        price: Number.isNaN(price) ? undefined : price,
      });
      setEditingProductId(null);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível salvar o produto.");
    }
  }

  async function toggleProductActive(product: AdminProduct) {
    if (!token) return;
    try {
      if (product.active) {
        await adminApi.deleteProduct(token, { productId: product.id, storeId });
      } else {
        await adminApi.updateProduct(token, { productId: product.id, storeId, active: true });
      }
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Não foi possível atualizar o produto.");
    }
  }

  return (
    <div className="products-page">
      {error && <p className="error">{error}</p>}

      <section>
        <h2>Categorias</h2>
        <ul className="category-list">
          {categories.map((category) => (
            <li key={category.id}>
              <span className={category.active ? "" : "inactive"}>{category.name}</span>
              <button onClick={() => handleToggleCategory(category)}>
                {category.active ? "Desativar" : "Reativar"}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={handleCreateCategory} className="inline-form">
          <input
            placeholder="Nova categoria"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
          />
          <button type="submit">Adicionar</button>
        </form>
      </section>

      <section>
        <h2>Produtos</h2>
        <table className="products-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th>Ativo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const category = categories.find((c) => c.id === product.categoryId);
              const isEditing = editingProductId === product.id;
              return (
                <tr key={product.id}>
                  {isEditing ? (
                    <>
                      <td>
                        <input
                          value={editDraft.name}
                          onChange={(event) =>
                            setEditDraft((draft) => ({ ...draft, name: event.target.value }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={editDraft.categoryId}
                          onChange={(event) =>
                            setEditDraft((draft) => ({ ...draft, categoryId: event.target.value }))
                          }
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          value={editDraft.price}
                          onChange={(event) =>
                            setEditDraft((draft) => ({ ...draft, price: event.target.value }))
                          }
                        />
                      </td>
                      <td>{product.active ? "Sim" : "Não"}</td>
                      <td>
                        <button onClick={() => saveEdit(product.id)}>Salvar</button>
                        <button onClick={() => setEditingProductId(null)}>Cancelar</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{product.name}</td>
                      <td>{category?.name ?? "-"}</td>
                      <td>R$ {Number(product.price).toFixed(2)}</td>
                      <td>{product.active ? "Sim" : "Não"}</td>
                      <td>
                        <button onClick={() => startEdit(product)}>Editar</button>
                        <button className="danger" onClick={() => toggleProductActive(product)}>
                          {product.active ? "Desativar" : "Reativar"}
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <form onSubmit={handleCreateProduct} className="product-form">
          <h3>Novo produto</h3>
          <input
            placeholder="Nome"
            value={newProduct.name}
            onChange={(event) => setNewProduct((p) => ({ ...p, name: event.target.value }))}
          />
          <select
            value={newProduct.categoryId}
            onChange={(event) => setNewProduct((p) => ({ ...p, categoryId: event.target.value }))}
          >
            <option value="">Categoria...</option>
            {categories
              .filter((c) => c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <input
            placeholder="Preço (ex: 29.90)"
            value={newProduct.price}
            onChange={(event) => setNewProduct((p) => ({ ...p, price: event.target.value }))}
          />
          <input
            placeholder="Descrição (opcional)"
            value={newProduct.description}
            onChange={(event) => setNewProduct((p) => ({ ...p, description: event.target.value }))}
          />
          <input
            placeholder="URL da imagem (opcional — upload direto vem com o adapter de storage)"
            value={newProduct.imageUrl}
            onChange={(event) => setNewProduct((p) => ({ ...p, imageUrl: event.target.value }))}
          />
          <button type="submit">Criar produto</button>
        </form>
      </section>
    </div>
  );
}
