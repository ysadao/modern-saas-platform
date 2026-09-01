import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Dashboard } from "./pages/Dashboard";
import { Forgot } from "./pages/Forgot";
import { Login } from "./pages/Login";
import { OrgPage } from "./pages/OrgPage";
import { Register } from "./pages/Register";
import { Reset } from "./pages/Reset";
import { Settings } from "./pages/Settings";
import { Verify } from "./pages/Verify";

function Guard({ children }: { children: JSX.Element }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="boot">Loading workspace…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot" element={<Forgot />} />
      <Route path="/reset" element={<Reset />} />
      <Route path="/verify" element={<Verify />} />
      <Route
        path="/"
        element={
          <Guard>
            <Dashboard />
          </Guard>
        }
      />
      <Route
        path="/orgs/:id"
        element={
          <Guard>
            <OrgPage />
          </Guard>
        }
      />
      <Route
        path="/settings"
        element={
          <Guard>
            <Settings />
          </Guard>
        }
      />
    </Routes>
  );
}
