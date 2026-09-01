import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { OrgPage } from "./pages/OrgPage";
import { Register } from "./pages/Register";

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
    </Routes>
  );
}
