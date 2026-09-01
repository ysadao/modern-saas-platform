import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { AuthLayout, AuthLinks } from "./layout";

export function Verify() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [status, setStatus] = useState<"idle" | "ok" | "err">(token ? "idle" : "err");
  const [message, setMessage] = useState(token ? "Verifying…" : "No token provided. Register first, then open the verify link.");

  useEffect(() => {
    if (!token) return;
    api("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => {
        setStatus("ok");
        setMessage("Email verified. You can sign in.");
      })
      .catch((err: Error) => {
        setStatus("err");
        setMessage(err.message);
      });
  }, [token]);

  return (
    <AuthLayout title="Confirm the mailbox before you cast off." lede="Unverified accounts cannot log in. The seeded demo user is already verified.">
      <div className="auth-card">
        <h2>Verify email</h2>
        <p className={status === "ok" ? "banner ok" : status === "err" ? "banner error" : "muted"}>{message}</p>
        <AuthLinks />
      </div>
    </AuthLayout>
  );
}
