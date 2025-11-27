import { Routes, Route } from "react-router-dom";
import DistrictListPage from "./pages/DistrictListPage";
import DistrictPage from "./pages/DistrictPage";
import DistrictSummaryPage from "./pages/DistrictSummaryPage";
import StaffListPage from "./pages/StaffListPage";
import StoresPage from "./pages/StoresPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DistrictListPage />} />
      <Route path="/district/:id" element={<DistrictPage />} />
      <Route path="/district/:id/summary" element={<DistrictSummaryPage />} />
      <Route path="/staff" element={<StaffListPage />} />
      <Route path="/stores" element={<StoresPage />} />
    </Routes>
  );
}

export default App;
