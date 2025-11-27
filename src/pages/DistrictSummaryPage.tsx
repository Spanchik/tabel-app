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

type Store = {
  id: string;
  name: string;
  district_id: string;
  company_id: string;
  opened_at: string | null; // YYYY-MM-DD
  closed_at: string | null; // YYYY-MM-DD
  is_active: boolean;
};

type ShiftType = {
  id: string;
  code: string;
  color_key: string | null;
};

type Shift = {
  id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  store_id: string;
  shift_type_id: string | null;
  is_substitution: boolean;
};

type District = {
  id: string;
  name: string;
  company_id: string;
};

type Conflict = {
  employeeId: string;
  date: string;
  storeIds: string[];
};

export default function DistrictSummaryPage() {
  const { id: districtId } = useParams();

  const [district, setDistrict] = useState<District | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState(2025);
  const [month, setMonth] = useState(1);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const loadData = async () => {
    if (!districtId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Округ + company_id
      const { data: districtData, error: districtError } = await supabase
        .from("districts")
        .select("id, name, company_id")
        .eq("id", districtId)
        .single();

      if (districtError || !districtData) {
        console.error("Помилка округу:", districtError);
        setLoading(false);
        return;
      }

      const currentDistrict = districtData as District;
      setDistrict(currentDistrict);
      const companyId = currentDistrict.company_id;

      // 2. Співробітники цього округу (по main_district_id)
      const { data: empData, error: empError } = await supabase
        .from("employees")
        .select("id, full_name, main_district_id")
        .eq("company_id", companyId)
        .eq("main_district_id", districtId)
        .order("full_name");

      if (empError) {
        console.error("Помилка співробітників:", empError);
        setEmployees([]);
      } else {
        setEmployees((empData || []) as Employee[]);
      }

      // 3. ВСІ ТТ компанії з датами відкриття/закриття
      const { data: storeData, error: storeError } = await supabase
        .from("stores")
        .select(
          "id, name, district_id, company_id, opened_at, closed_at, is_active"
        )
        .eq("company_id", companyId)
        .order("name");

      if (storeError) {
        console.error("Помилка ТТ:", storeError);
        setStores([]);
      } else {
        setStores((storeData || []) as Store[]);
      }

      // 4. Типи змін
      const { data: shiftTypesData, error: shiftTypesError } = await supabase
        .from("shift_types")
        .select("id, code, color_key")
        .eq("company_id", companyId)
        .order("code");

      if (shiftTypesError) {
        console.error("Помилка типів змін:", shiftTypesError);
        setShiftTypes([]);
      } else {
        setShiftTypes((shiftTypesData || []) as ShiftType[]);
      }

      // 5. Зміни співробітників цього округу на всіх ТТ
      if (!empData || empData.length === 0) {
        setShifts([]);
        setLoading(false);
        return;
      }

      const empIds = (empData as Employee[]).map((e) => e.id);
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
        .in("employee_id", empIds)
        .gte("date", startDate)
        .lte("date", endDate);

      if (shiftError) {
        console.error("Помилка змін:", shiftError);
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

  // довідники
  const employeesById: Record<string, Employee> = {};
  for (const e of employees) {
    employeesById[e.id] = e;
  }

  const storesById: Record<string, Store> = {};
  for (const s of stores) {
    storesById[s.id] = s;
  }

  const shiftTypeById: Record<
    string,
    { code: string; color_key: string | null }
  > = {};
  for (const st of shiftTypes) {
    shiftTypeById[st.id] = { code: st.code, color_key: st.color_key };
  }

  // допоміжна функція: чи дата виходить за межі життя ТТ
  const isDateOutsideStoreRange = (store: Store, dateStr: string): boolean => {
    const date = new Date(dateStr + "T00:00:00");

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

  // shiftsByEmployee[employeeId][day] = список змін (враховуючи відкриття/закриття ТТ)
  const shiftsByEmployee: Record<string, Record<number, Shift[]>> = {};
  for (const emp of employees) {
    shiftsByEmployee[emp.id] = {};
    for (const d of days) {
      shiftsByEmployee[emp.id][d] = [];
    }
  }

  for (const sh of shifts) {
    const store = storesById[sh.store_id];
    if (!store) continue;

    // якщо ТТ на цю дату ще не відкрита або вже закрита — ігноруємо зміну
    if (isDateOutsideStoreRange(store, sh.date)) {
      continue;
    }

    const day = new Date(sh.date + "T00:00:00").getDate();
    if (!shiftsByEmployee[sh.employee_id]) {
      shiftsByEmployee[sh.employee_id] = {};
    }
    if (!shiftsByEmployee[sh.employee_id][day]) {
      shiftsByEmployee[sh.employee_id][day] = [];
    }
    shiftsByEmployee[sh.employee_id][day].push(sh);
  }

  // конфлікти: 2+ ТТ в один день (також з урахуванням відкриття/закриття ТТ)
  const conflicts: Conflict[] = [];
  for (const emp of employees) {
    const byDay = shiftsByEmployee[emp.id] || {};
    for (const d of days) {
      const list = byDay[d] || [];
      if (list.length > 1) {
        const dateStr = list[0].date;
        const storeIds = list.map((s) => s.store_id);
        conflicts.push({
          employeeId: emp.id,
          date: dateStr,
          storeIds,
        });
      }
    }
  }

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

  const getCellColor = (employeeId: string, day: number): string => {
    const list = shiftsByEmployee[employeeId]?.[day] || [];
    if (list.length === 0) return "#fff";
    if (list.length > 1) return "#fecaca"; // конфлікт (дві ТТ в день)

    const shift = list[0];

    // підміна → оранжевий
    if (shift.is_substitution) return "#ffe7ba";

    const st = shift.shift_type_id
      ? shiftTypeById[shift.shift_type_id]
      : null;
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

  const getCellText = (employeeId: string, day: number): string => {
    const list = shiftsByEmployee[employeeId]?.[day] || [];
    if (list.length === 0) return "";

    if (list.length === 1) {
      const sh = list[0];
      const storeName = storesById[sh.store_id]?.name || "";
      const st = sh.shift_type_id
        ? shiftTypeById[sh.shift_type_id]
        : null;
      const code = st?.code ?? "";
      return code ? `${storeName} (${code})` : storeName;
    }

    // 2+ ТТ — показуємо всі через "/"
    return list
      .map((sh) => storesById[sh.store_id]?.name || "?")
      .join(" / ");
  };

  return (
    <AppLayout>
      <Link to={`/district/${districtId}`}>← Назад до табеля</Link>

      <div className="page-header">
        <h1>Сводка по співробітниках: {district?.name || ""}</h1>
      </div>

      <div className="controls-row" style={{ marginTop: 8, marginBottom: 8 }}>
        Місяць:{" "}
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {monthNames.map((name, idx) =>
            idx === 0 ? null : (
              <option key={idx} value={idx}>
                {name}
              </option>
            )
          )}
        </select>
        {"   "}
        Рік:{" "}
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          style={{ width: 80, marginLeft: 4 }}
        />
      </div>

      {/* блок з помилками по співробітниках */}
      <div className="card" style={{ marginTop: 4, marginBottom: 12 }}>
        <strong>Проблеми:</strong>
        {conflicts.length === 0 && (
          <div style={{ marginTop: 4, fontSize: 13, color: "#16a34a" }}>
            Конфліктів не знайдено — у співробітників не більше однієї ТТ на
            день.
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

      {loading && <p>Завантаження...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && employees.length === 0 && (
        <p>В цьому окрузі поки немає співробітників.</p>
      )}

      {!loading && employees.length > 0 && (
        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Співробітник</th>
                {days.map((d) => (
                  <th key={d}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.full_name}</td>
                  {days.map((d) => (
                    <td
                      key={d}
                      style={{ backgroundColor: getCellColor(emp.id, d) }}
                    >
                      {getCellText(emp.id, d)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
