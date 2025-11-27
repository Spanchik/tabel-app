import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import AppLayout from "../components/AppLayout";
import "../styles/table.css";

type District = {
  id: string;
  name: string;
};

export default function DistrictListPage() {
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("districts")
        .select("id, name")
        .order("name", { ascending: true });

      if (!error && data) {
        setDistricts(data as District[]);
      }

      setLoading(false);
    };

    load();
  }, []);

  return (
    <AppLayout>
      <h2>Округа</h2>

      {loading && <p>Завантаження округів...</p>}

      {!loading && districts.length === 0 && (
        <p>Поки що немає жодного округу.</p>
      )}

      {!loading && districts.length > 0 && (
        <div className="district-grid">
          {districts.map((d) => (
            <div
              key={d.id}
              className="district-card"
              onClick={() => navigate(`/district/${d.id}`)}
            >
              <div className="district-card-name">{d.name}</div>
              <div className="district-card-sub">Перейти до табеля округу</div>
            </div>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
