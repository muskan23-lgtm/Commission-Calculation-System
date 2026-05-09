import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppNavbar from "./components/Navbar";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Agents from "./pages/Agents";
import Sales from "./pages/Sales";
import Reports from "./pages/Reports";
import Clawbacks from "./pages/Clawbacks";

function Guard({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <AppNavbar />
        <div className="max-w-7xl mx-auto p-4">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Guard><Dashboard /></Guard>} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/agents" element={<Guard><Agents /></Guard>} />
            <Route path="/sales" element={<Guard><Sales /></Guard>} />
            <Route path="/reports" element={<Guard><Reports /></Guard>} />
            <Route path="/clawbacks" element={<Guard><Clawbacks /></Guard>} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
