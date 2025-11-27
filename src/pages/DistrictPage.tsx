import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import "../styles/table.css";
import AppLayout from "../components/AppLayout";

type Employee = {
  id: string;
  full_name: string;
  main_district_id: string | null;
};

type ShiftType = {
  id: string;
  code: string;
  color_key: string | null;
};

type Store = {
  id: string;
  name: string;
  district_id: string;
  opened_at: string | null; // YYYY-MM-DD
  closed_at: string | null; // YYYY-MM-DD
  is_active: boolean;
};

type Shift = {
  id: string;
  employee_id: string;
  date: string; // '2025-01-01'
  store_id: string;
  shift_type_id: string | null;
  is_substitution: boolean;
};

type EditingCell = {
  storeId: string;
  day: number;
};

type CellInfo = {
  employeeId: string | null;
  shiftTypeCode: string | null;
  isSubstitution: boolean;
};

type Conflict = {
  employeeId: string;
  date: string; // YYYY-MM-DD
  storeIds: string[];
};

export default function DistrictPage() {
  const { id: districtId } = useParams(); // id округа

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [districtName, setDistrictName] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedShiftCode, setSelectedShiftCode] = useState<string>("");

  // месяц / год
  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(1); // 1 = январь

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const loadData = async () => {
    if (!districtId) return;
    setLoading(true);
    setError(null);

    try {
      // 1) округ + company_id
      const { data: district, error: districtError } = await supabase
        .from("districts")
        .select("name, company_id")
        .eq("id", districtId)
        .single();

      if (districtError || !district) {
        console.error("Ошибка округу:", districtError);
        setLoading(false);
        return;
      }

      setDistrictName(district.name);
      setCompanyId(district.company_id);
      const currentCompanyId = district.company_id as string;

      // 2) ВСЕ сотрудники компании (для підмін з інших округів)
      const { data: employeeData, error: empError } = await supabase
        .from("employees")
        .select("id, full_name, main_district_id")
        .eq("company_id", currentCompanyId)
        .order("full_name");

      if (empError) {
        console.error("Ошибка співробітників:", empError);
        setEmployees([]);
      } else {
        setEmployees((employeeData || []) as Employee[]);
      }

      // 3) ТТ цього округу з датами відкриття/закриття
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .select(
          "id, name, district_id, opened_at, closed_at, is_active"
        )
        .eq("company_id", currentCompanyId)
        .eq("district_id", districtId)
        .order("name");

      if (storeError) {
        console.error("Ошибка ТТ:", storeError);
        setStores([]);
      } else {
        const allStores = (storeData || []) as Store[];

        // фільтруємо ТТ по місяцю: не показуємо, якщо місяць повністю до відкриття або після закриття
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month - 1, daysInMonth);

        const storesForMonth = allStores.filter((store) => {
          const open = store.opened_at
            ? new Date(store.opened_at + "T00:00:00")
            : null;
          const close = store.closed_at
            ? new Date(store.closed_at + "T00:00:00")
            : null;

          // якщо відкривається після кінця місяця → ще не показуємо
          if (open && open > monthEnd) return false;

          // якщо закрита до початку місяця → вже не показуємо
          if (close && close < monthStart) return false;

          return true;
        });

        setStores(storesForMonth);
      }

      // 4) справочник типов смен
      const { data: shiftTypesData, error: shiftTypesError } = await supabase
        .from("shift_types")
        .select("id, code, color_key")
        .eq("company_id", currentCompanyId)
        .order("code");

      if (shiftTypesError) {
        console.error("Ошибка типів змін:", shiftTypesError);
        setShiftTypes([]);
      } else {
        setShiftTypes((shiftTypesData || []) as ShiftType[]);
      }

      // 5) смены за месяц по ТТ округа (тільки для тих ТТ, що показуються в цьому місяці)
      if (!storeData || storeData.length === 0) {
        setShifts([]);
        setLoading(false);
        return;
      }

      const filteredStores =
        (storeData as Store[]).filter((store) => {
          const open = store.opened_at
            ? new Date(store.opened_at + "T00:00:00")
            : null;
          const close = store.closed_at
            ? new Date(store.closed_at + "T00:00:00")
            : null;

          const monthStart = new Date(year, month - 1, 1);
          const monthEnd = new Date(year, month - 1, daysInMonth);

          if (open && open > monthEnd) return false;
          if (close && close < monthStart) return false;
          return true;
        }) || [];

      const storeIds = filteredStores.map((s) => s.id);

      if (storeIds.length === 0) {
        setShifts([]);
        setLoading(false);
        return;
      }

      const monthStr = month.toString().padStart(2, "0");
      const startDate = `${year}-${monthStr}-01`;
      const endDate = `${year}-${monthStr}-${daysInMonth
        .toString()
        .padStart(2, "0")}`;

      const { data: shiftsData, error: shiftError } = await supabase
        .from("shifts")
        .select(
          "id, employee_id, date, store_id, shift_type_id, is_substitution"
        )
        .in("store_id", storeIds)
        .gte("date", startDate)
        .lte("date", endDate);

      if (shiftError) {
        console.error("Ошибка змін:", shiftError);
        setShifts([]);
      } else {
        setShifts((shiftsData || []) as Shift[]);
      }
    } catch (e) {
      console.error("Неочікувана помилка:", e);
      setError("Сталася помилка при завантаженні даних.");
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districtId, year, month, daysInMonth]);

  // словари по id
  const employeesById: Record<string, Employee> = {};
  for (const e of employees) {
    employeesById[e.id] = e;
  }

  const shiftTypeById: Record<
    string,
    { code: string; color_key: string | null }
  > = {};
  for (const st of shiftTypes) {
    shiftTypeById[st.id] = { code: st.code, color_key: st.color_key };
  }

  // ==== довідник ТТ по id ====
  const storesById: Record<string, Store> = {};
  for (const s of stores) {
    storesById[s.id] = s;
  }

  // допоміжна функція: чи день виходить за межі життя ТТ
  const isDayOutsideStoreActiveRange = (store: Store, day: number): boolean => {
    const date = new Date(year, month - 1, day);

    const open = store.opened_at
      ? new Date(store.opened_at + "T00:00:00")
      : null;
    const close = store.closed_at
      ? new Date(store.closed_at + "T00:00:00")
      : null;

    if (open && date < open) return true;
    if (close && date > close) return true;
    return false;
  };

  // ==== пошук помилок: співробітник на 2+ ТТ в один день ====
  const conflicts: Conflict[] = [];
  const conflictMap: Record<
    string,
    { employeeId: string; date: string; storeIds: string[] }
  > = {};

  for (const sh of shifts) {
    const key = `${sh.employee_id}-${sh.date}`;
    if (!conflictMap[key]) {
      conflictMap[key] = {
        employeeId: sh.employee_id,
        date: sh.date,
        storeIds: [],
      };
    }
    conflictMap[key].storeIds.push(sh.store_id);
  }

  for (const key of Object.keys(conflictMap)) {
    const item = conflictMap[key];
    if (item.storeIds.length > 1) {
      conflicts.push(item);
    }
  }

  // структура: { [storeId]: { [dayNumber]: CellInfo } }
  const shiftsByStore: Record<string, Record<number, CellInfo>> = {};
  for (const store of stores) {
    shiftsByStore[store.id] = {};
  }

  for (const shift of shifts) {
    const store = storesById[shift.store_id];
    if (!store) continue;

    const day = new Date(shift.date).getDate();

    // якщо на цю дату ТТ ще не існує або вже закрита — ігноруємо зміну
    if (isDayOutsideStoreActiveRange(store, day)) {
      continue;
    }

    const stInfo = shift.shift_type_id
      ? shiftTypeById[shift.shift_type_id]
      : null;
    const code = stInfo?.code ?? null;

    let isSubstitution = shift.is_substitution;
    const emp = employeesById[shift.employee_id];
    if (!isSubstitution && emp && emp.main_district_id) {
      if (store) {
        isSubstitution = emp.main_district_id !== store.district_id;
      }
    }

    if (!shiftsByStore[shift.store_id]) {
      shiftsByStore[shift.store_id] = {};
    }

    shiftsByStore[shift.store_id][day] = {
      employeeId: shift.employee_id,
      shiftTypeCode: code,
      isSubstitution,
    };
  }

  const handleCellClick = (storeId: string, day: number) => {
    const store = storesById[storeId];
    if (store && isDayOutsideStoreActiveRange(store, day)) {
      // не даём відкрити редактор, якщо ТТ ще не відкрита / вже закрита
      return;
    }

    const cell = shiftsByStore[storeId]?.[day];
    setEditingCell({ storeId, day });
    setSelectedEmployeeId(cell?.employeeId ?? "");
    setSelectedShiftCode(cell?.shiftTypeCode ?? "");
    setError(null);
  };

  const handleSaveShift = async () => {
    if (!editingCell || !companyId) {
      setError("Немає даних для збереження (company).");
      return;
    }

    const { storeId, day } = editingCell;
    const store = storesById[storeId];

    if (store && isDayOutsideStoreActiveRange(store, day)) {
      setError("На цю дату ТТ ще не відкрита або вже закрита.");
      return;
    }

    const monthStr = month.toString().padStart(2, "0");
    const dayStr = day.toString().padStart(2, "0");
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    setSaving(true);
    setError(null);

    try {
      // если ничего не выбрано — удаляем смену на этой ТТ/день
      if (!selectedEmployeeId || !selectedShiftCode) {
        const { error: delError } = await supabase
          .from("shifts")
          .delete()
          .eq("store_id", storeId)
          .eq("date", dateStr);

        if (delError) {
          console.error("Ошибка видалення:", delError);
          setError("Не вдалося видалити зміну.");
        } else {
          await loadData();
          closeEditor();
        }
        setSaving(false);
        return;
      }

      const shiftType = shiftTypes.find(
        (st) => st.code === selectedShiftCode
      );
      if (!shiftType) {
        setError("Невідомий тип зміни.");
        setSaving(false);
        return;
      }

      const emp = employeesById[selectedEmployeeId];
      const currentStore = storesById[storeId];
      const isSubstitution =
        emp && currentStore && emp.main_district_id
          ? emp.main_district_id !== currentStore.district_id
          : false;

      // 1) на этой ТТ и дате может быть только один продавец → чистим
      const { error: delInStoreError } = await supabase
        .from("shifts")
        .delete()
        .eq("store_id", storeId)
        .eq("date", dateStr);

      if (delInStoreError) {
        console.error("Ошибка очистки ТТ:", delInStoreError);
      }

      // 2) создаём/обновляем смену для сотрудника в этот день
      const { error: upsertError } = await supabase.from("shifts").upsert(
        {
          company_id: companyId,
          employee_id: selectedEmployeeId,
          store_id: storeId,
          shift_type_id: shiftType.id,
          date: dateStr,
          is_substitution: isSubstitution,
        },
        {
          // гарантируем, что у сотрудника только одна смена в этот день
          onConflict: "employee_id,date",
        }
      );

      if (upsertError) {
        console.error("Ошибка збереження:", upsertError);
        setError("Не вдалося зберегти зміну.");
      } else {
        await loadData();
        closeEditor();
      }
    } catch (e) {
      console.error("Неочікувана помилка при збереженні:", e);
      setError("Сталася помилка при збереженні.");
    }

    setSaving(false);
  };

  const closeEditor = () => {
    if (saving) return;
    setEditingCell(null);
    setSelectedEmployeeId("");
    setSelectedShiftCode("");
  };

  const monthNames = [
    "",
    "Січень",
    "Лютий",
    "Березень",
    "Квітень",
    "Травень",
    "Червень",
    "Липень",
    "Серпень",
    "Вересень",
    "Жовтень",
    "Листопад",
    "Грудень",
  ];

  const getBgColorForCell = (
    store: Store,
    day: number,
    cell?: CellInfo
  ): string => {
    // якщо день поза життям ТТ — робимо сірий фон і блокуємо редагування
    if (isDayOutsideStoreActiveRange(store, day)) {
      return "#f5f5f5";
    }

    if (!cell || !cell.shiftTypeCode) return "#fff";
    if (cell.isSubstitution) return "#ffe7ba"; // подмена — оранжевый

    const st = shiftTypes.find((s) => s.code === cell.shiftTypeCode);
    const colorKey = st?.color_key;

    switch (colorKey) {
      case "green":
        return "#d9f7be";
      case "gray":
        return "#f5f5f5";
      default:
        return "#fff";
    }
  };

  return (
    <AppLayout>
      <Link to="/">← Назад к списку округів</Link>

      <div className="page-header">
        <h1>{districtName || "Округ"}</h1>
        <Link to={`/district/${districtId}`}>Табель</Link>
      </div>

      {/* выбор месяца и года */}
      <div className="controls-row">
        <label>
          Місяць:{" "}
          <select
            value={month}
            onChange={(e) => {
              setMonth(Number(e.target.value));
              setEditingCell(null);
            }}
          >
            {monthNames.map((name, idx) =>
              idx === 0 ? null : (
                <option key={idx} value={idx}>
                  {name}
                </option>
              )
            )}
          </select>
        </label>

        <label>
          Рік:{" "}
          <input
            type="number"
            value={year}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setEditingCell(null);
            }}
          />
        </label>

        <Link to={`/district/${districtId}/summary`}>📊 Перейти до сводки</Link>
      </div>

      <h2>
        Табель по ТТ за {month.toString().padStart(2, "0")}.{year}
      </h2>

      {/* блок з помилками по графіку */}
      <div className="card" style={{ marginTop: 8, marginBottom: 12 }}>
        <strong>Проблеми:</strong>
        {conflicts.length === 0 && (
          <div style={{ marginTop: 4, fontSize: 13, color: "#16a34a" }}>
            Конфліктів не знайдено — у кожного співробітника не більше однієї ТТ
            на день.
          </div>
        )}

        {conflicts.length > 0 && (
          <ul style={{ margin: "4px 0 0 16px", fontSize: 13 }}>
            {conflicts.slice(0, 10).map((c, idx) => {
              const emp = employeesById[c.employeeId];
              const empName = emp ? emp.full_name : "(невідомий)";
              const dateObj = new Date(c.date + "T00:00:00");
              const day = dateObj.getDate().toString().padStart(2, "0");
              const monthStr = (dateObj.getMonth() + 1)
                .toString()
                .padStart(2, "0");

              const storeNames = c.storeIds
                .map((id) => storesById[id]?.name || "?")
                .join(", ");

              return (
                <li key={idx}>
                  {empName} — {day}.{monthStr}.{dateObj.getFullYear()} —{" "}
                  {storeNames}
                </li>
              );
            })}
            {conflicts.length > 10 && (
              <li>...та ще {conflicts.length - 10} записів</li>
            )}
          </ul>
        )}
      </div>

      {loading && <p>Загрузка...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && stores.length === 0 && (
        <p>В цьому окрузі в цей місяць немає торгових точок (або вони ще не відкриті / вже закриті).</p>
      )}

      {!loading && stores.length > 0 && (
        <>
          <div className="table-wrapper">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>ТТ</th>
                  {days.map((day) => (
                    <th key={day}>{day}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr key={store.id}>
                    <td>{store.name}</td>
                    {days.map((day) => {
                      const cell = shiftsByStore[store.id]?.[day];
                      const empName =
                        cell?.employeeId && employeesById[cell.employeeId]
                          ? employeesById[cell.employeeId].full_name
                          : "";

                      const isEditing =
                        editingCell &&
                        editingCell.storeId === store.id &&
                        editingCell.day === day;

                      const bg = isEditing
                        ? "#e0f2fe"
                        : getBgColorForCell(store, day, cell);

                      const disabled = isDayOutsideStoreActiveRange(
                        store,
                        day
                      );

                      return (
                        <td
                          key={day}
                          onClick={() => handleCellClick(store.id, day)}
                          className="cell-normal"
                          style={{
                            backgroundColor: bg,
                            color: disabled ? "#999" : undefined,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                        >
                          {empName}
                          {cell?.shiftTypeCode
                            ? ` (${cell.shiftTypeCode})`
                            : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* модалка редактирования */}
          {editingCell && (
            <div className="modal-backdrop" onClick={closeEditor}>
              <div
                className="modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  Редагування зміни:{" "}
                  {storesById[editingCell.storeId]?.name} –{" "}
                  {editingCell.day.toString().padStart(2, "0")}.
                  {month.toString().padStart(2, "0")}.{year}
                </div>

                <div className="modal-body">
                  <label>
                    Співробітник:
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    >
                      <option value="">(порожньо)</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.full_name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Тип зміни:
                    <select
                      value={selectedShiftCode}
                      onChange={(e) => setSelectedShiftCode(e.target.value)}
                    >
                      <option value="">(порожньо)</option>
                      {shiftTypes.map((st) => (
                        <option key={st.id} value={st.code}>
                          {st.code}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="modal-footer">
                  <button onClick={handleSaveShift} disabled={saving}>
                    {saving ? "Збереження..." : "Зберегти"}
                  </button>
                  <button onClick={closeEditor} disabled={saving}>
                    Скасувати
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppLayout>
  );
}
