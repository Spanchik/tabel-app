import { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import { supabase } from "../lib/supabaseClient";
import "../styles/table.css";

type District = {
  id: string;
  name: string;
  company_id: string;
};

type Store = {
  id: string;
  name: string;
  district_id: string | null;
  company_id: string;
  is_active: boolean;
  opened_at: string | null; // YYYY-MM-DD
  closed_at: string | null; // YYYY-MM-DD
};

type Mode = "none" | "edit" | "create";

export default function StoresPage() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtMap, setDistrictMap] = useState<Record<string, District>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );

  // модалка
  const [modalMode, setModalMode] = useState<Mode>("none");
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [formName, setFormName] = useState("");
  const [formDistrictId, setFormDistrictId] = useState<string>("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formOpenedAt, setFormOpenedAt] = useState<string>("");
  const [formClosedAt, setFormClosedAt] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Округа
      const { data: districtData } = await supabase
        .from("districts")
        .select("id, name, company_id")
        .order("name");

      const distArr = (districtData || []) as District[];
      setDistricts(distArr);

      const dmap: Record<string, District> = {};
      distArr.forEach((d) => {
        dmap[d.id] = d;
      });
      setDistrictMap(dmap);

      // ТТ
      const { data: storeData } = await supabase
        .from("stores")
        .select(
          "id, name, district_id, company_id, is_active, opened_at, closed_at"
        )
        .order("name");

      setStores((storeData || []) as Store[]);
      setLoading(false);
    };

    load();
  }, []);

  const filtered = stores.filter((s) => {
    if (
      search &&
      !s.name.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }

    if (
      selectedDistrictId !== "all" &&
      s.district_id !== selectedDistrictId
    ) {
      return false;
    }

    if (statusFilter === "active" && !s.is_active) return false;
    if (statusFilter === "inactive" && s.is_active) return false;

    return true;
  });

  const openCreateModal = () => {
    setEditingStore(null);
    setFormName("");
    setFormDistrictId("");
    setFormIsActive(true);
    setFormOpenedAt("");
    setFormClosedAt("");
    setError(null);
    setModalMode("create");
  };

  const openEditModal = (store: Store) => {
    setEditingStore(store);
    setFormName(store.name);
    setFormDistrictId(store.district_id || "");
    setFormIsActive(store.is_active);
    setFormOpenedAt(store.opened_at || "");
    setFormClosedAt(store.closed_at || "");
    setError(null);
    setModalMode("edit");
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode("none");
    setEditingStore(null);
    setError(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError("Вкажіть назву ТТ.");
      return;
    }
    if (!formDistrictId) {
      setError("Оберіть округ.");
      return;
    }

    const district = districtMap[formDistrictId];
    if (!district) {
      setError("Невідомий округ.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      company_id: district.company_id,
      name: formName.trim(),
      district_id: formDistrictId,
      is_active: formIsActive,
      opened_at: formOpenedAt || null,
      closed_at: formClosedAt || null,
    };

    try {
      if (modalMode === "edit" && editingStore) {
        const { error: updError } = await supabase
          .from("stores")
          .update(payload)
          .eq("id", editingStore.id);

        if (updError) {
          console.error("Помилка оновлення ТТ:", updError);
          setError(
            "Не вдалося оновити ТТ: " +
              (updError.message || "невідома помилка")
          );
        } else {
          setStores((prev) =>
            prev.map((s) =>
              s.id === editingStore.id
                ? {
                    ...s,
                    ...payload,
                  }
                : s
            )
          );
          closeModal();
        }
      } else if (modalMode === "create") {
        const { data, error: insError } = await supabase
          .from("stores")
          .insert(payload)
          .select(
            "id, name, district_id, company_id, is_active, opened_at, closed_at"
          )
          .single();

        if (insError) {
          console.error("Помилка створення ТТ:", insError);
          setError(
            "Не вдалося створити ТТ: " +
              (insError.message || "невідома помилка")
          );
        } else if (data) {
          setStores((prev) =>
            [...prev, data as Store].sort((a, b) =>
              a.name.localeCompare(b.name)
            )
          );
          closeModal();
        }
      }
    } catch (e) {
      console.error("Неочікувана помилка при збереженні ТТ:", e);
      setError("Сталася помилка при збереженні ТТ.");
    }

    setSaving(false);
  };

  return (
    <AppLayout>
      <h2>Торговельні точки</h2>

      <div className="controls-row" style={{ marginTop: 12, marginBottom: 12 }}>
        <label>
          Пошук:{" "}
          <input
            type="text"
            placeholder="Введіть назву ТТ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
        </label>

        <label>
          Округ:{" "}
          <select
            value={selectedDistrictId}
            onChange={(e) => setSelectedDistrictId(e.target.value)}
          >
            <option value="all">Усі округи</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Статус:{" "}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "all" | "active" | "inactive")
            }
          >
            <option value="all">Усі</option>
            <option value="active">Відкриті</option>
            <option value="inactive">Закриті</option>
          </select>
        </label>

        <button type="button" onClick={openCreateModal}>
          + Додати ТТ
        </button>
      </div>

      {loading && <p>Завантаження...</p>}

      {!loading && (
        <>
          <div className="table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Назва</th>
                  <th>Округ</th>
                  <th>Статус</th>
                  <th>Відкрита</th>
                  <th>Закрита</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const dist = s.district_id
                    ? districtMap[s.district_id]
                    : null;
                  return (
                    <tr
                      key={s.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => openEditModal(s)}
                    >
                      <td>{s.name}</td>
                      <td>{dist ? dist.name : "-"}</td>
                      <td style={{ color: s.is_active ? "green" : "red" }}>
                        {s.is_active ? "Відкрита" : "Закрита"}
                      </td>
                      <td>{s.opened_at || "-"}</td>
                      <td>{s.closed_at || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <p style={{ marginTop: 8 }}>Нічого не знайдено...</p>
          )}
        </>
      )}

      {/* модалка створення / редагування ТТ */}
      {modalMode !== "none" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              {modalMode === "edit"
                ? "Редагування ТТ"
                : "Нова торговельна точка"}
            </div>

            <div className="modal-body">
              {error && (
                <div style={{ color: "red", marginBottom: 4 }}>{error}</div>
              )}

              <label>
                Назва ТТ:
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{ width: "100%" }}
                />
              </label>

              <label>
                Округ:
                <select
                  value={formDistrictId}
                  onChange={(e) => setFormDistrictId(e.target.value)}
                >
                  <option value="">(оберіть округ)</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Статус:
                <select
                  value={formIsActive ? "1" : "0"}
                  onChange={(e) => setFormIsActive(e.target.value === "1")}
                >
                  <option value="1">Відкрита</option>
                  <option value="0">Закрита</option>
                </select>
              </label>

              <label>
                Дата відкриття:
                <input
                  type="date"
                  value={formOpenedAt}
                  onChange={(e) => setFormOpenedAt(e.target.value)}
                />
              </label>

              <label>
                Дата закриття:
                <input
                  type="date"
                  value={formClosedAt}
                  onChange={(e) => setFormClosedAt(e.target.value)}
                />
              </label>
            </div>

            <div className="modal-footer">
              <button onClick={handleSave} disabled={saving}>
                {saving ? "Збереження..." : "Зберегти"}
              </button>
              <button onClick={closeModal} disabled={saving}>
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
