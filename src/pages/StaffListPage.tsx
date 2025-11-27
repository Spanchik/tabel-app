import { useEffect, useState } from "react";
import AppLayout from "../components/AppLayout";
import { supabase } from "../lib/supabaseClient";
import "../styles/table.css";

type Employee = {
  id: string;
  full_name: string;
  main_district_id: string | null;
  is_active: boolean;
};

type District = {
  id: string;
  name: string;
  company_id: string;
};

type Mode = "none" | "edit" | "create";

export default function StaffListPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtMap, setDistrictMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "all"
  );

  // состояние модалки
  const [modalMode, setModalMode] = useState<Mode>("none");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formFullName, setFormFullName] = useState("");
  const [formDistrictId, setFormDistrictId] = useState<string>("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // 1. Округа (с company_id)
      const { data: districtData } = await supabase
        .from("districts")
        .select("id, name, company_id")
        .order("name");

      const distArr = (districtData || []) as District[];
      setDistricts(distArr);

      const dict: Record<string, string> = {};
      distArr.forEach((d) => {
        dict[d.id] = d.name;
      });
      setDistrictMap(dict);

      // 2. Співробітники
      const { data: empData } = await supabase
        .from("employees")
        .select("id, full_name, main_district_id, is_active")
        .order("full_name");

      setEmployees((empData || []) as Employee[]);
      setLoading(false);
    };

    load();
  }, []);

  // фильтрация по поиску/округу/статусу
  const filtered = employees.filter((e) => {
    if (
      search &&
      !e.full_name.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }

    if (
      selectedDistrictId !== "all" &&
      e.main_district_id !== selectedDistrictId
    ) {
      return false;
    }

    if (statusFilter === "active" && !e.is_active) return false;
    if (statusFilter === "inactive" && e.is_active) return false;

    return true;
  });

  // открыть модалку редактирования
  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormFullName(emp.full_name);
    setFormDistrictId(emp.main_district_id || "");
    setFormIsActive(emp.is_active);
    setError(null);
    setModalMode("edit");
  };

  // открыть модалку создания
  const openCreateModal = () => {
    setEditingEmployee(null);
    setFormFullName("");
    setFormDistrictId("");
    setFormIsActive(true);
    setError(null);
    setModalMode("create");
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode("none");
    setEditingEmployee(null);
    setFormFullName("");
    setFormDistrictId("");
    setFormIsActive(true);
    setError(null);
  };

  const handleSave = async () => {
    if (!formFullName.trim()) {
      setError("Вкажіть ПІБ співробітника.");
      return;
    }
    if (!formDistrictId) {
      setError("Оберіть округ.");
      return;
    }

    const district = districts.find((d) => d.id === formDistrictId);
    if (!district) {
      setError("Невідомий округ.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (modalMode === "edit" && editingEmployee) {
        // UPDATE
        const { error: updError } = await supabase
          .from("employees")
          .update({
            full_name: formFullName.trim(),
            main_district_id: formDistrictId,
            is_active: formIsActive,
          })
          .eq("id", editingEmployee.id);

        if (updError) {
          console.error("Помилка оновлення співробітника:", updError);
          setError("Не вдалося оновити співробітника.");
        } else {
          // обновляем локальное состояние
          setEmployees((prev) =>
            prev.map((e) =>
              e.id === editingEmployee.id
                ? {
                    ...e,
                    full_name: formFullName.trim(),
                    main_district_id: formDistrictId,
                    is_active: formIsActive,
                  }
                : e
            )
          );
          closeModal();
        }
      } else if (modalMode === "create") {
        // INSERT
        const { data, error: insError } = await supabase
          .from("employees")
          .insert({
            company_id: district.company_id,
            full_name: formFullName.trim(),
            main_district_id: formDistrictId,
            is_active: formIsActive,
          })
          .select("id, full_name, main_district_id, is_active")
          .single();

               if (insError) {
          console.error("Помилка створення співробітника:", insError);
          setError(
            "Не вдалося створити співробітника: " +
              (insError.message || "невідома помилка")
          );
        } else if (data) {

          setEmployees((prev) => [...prev, data as Employee].sort((a, b) =>
            a.full_name.localeCompare(b.full_name)
          ));
          closeModal();
        }
      }
    } catch (e) {
      console.error("Неочікувана помилка при збереженні співробітника:", e);
      setError("Сталася помилка при збереженні.");
    }

    setSaving(false);
  };

  return (
    <AppLayout>
      <h2>Персонал</h2>

      <div className="controls-row" style={{ marginTop: 12, marginBottom: 12 }}>
        <label>
          Пошук:{" "}
          <input
            type="text"
            placeholder="Введіть ім'я..."
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
            <option value="active">Тільки активні</option>
            <option value="inactive">Не працює</option>
          </select>
        </label>

        <button type="button" onClick={openCreateModal}>
          + Додати співробітника
        </button>
      </div>

      {loading && <p>Завантаження...</p>}

      {!loading && (
        <>
          <div className="table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>ПІБ</th>
                  <th>Округ</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => openEditModal(e)}
                  >
                    <td>{e.full_name}</td>
                    <td>{districtMap[e.main_district_id || ""] || "-"}</td>
                    <td>
                      {e.is_active ? (
                        <span style={{ color: "green" }}>Активний</span>
                      ) : (
                        <span style={{ color: "red" }}>Не працює</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filtered.length === 0 && (
            <p style={{ marginTop: 8 }}>Нічого не знайдено...</p>
          )}
        </>
      )}

      {/* Модалка створення / редагування */}
      {modalMode !== "none" && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              {modalMode === "edit"
                ? "Редагування співробітника"
                : "Новий співробітник"}
            </div>

            <div className="modal-body">
              {error && (
                <div style={{ color: "red", marginBottom: 4 }}>{error}</div>
              )}

              <label>
                ПІБ:
                <input
                  type="text"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
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
                  <option value="1">Активний</option>
                  <option value="0">Не працює</option>
                </select>
              </label>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Збереження..." : "Зберегти"}
              </button>
              <button type="button" onClick={closeModal} disabled={saving}>
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
