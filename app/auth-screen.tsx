"use client";
import { useState } from "react";
import "./auth.css";
type User = {
  id: number | string;
  name: string;
  username: string;
  role: string;
  permissions: string[];
};
export default function AuthScreen({
  setupRequired,
  cloudMode,
  onAuthenticated,
}: {
  setupRequired: boolean;
  cloudMode: boolean;
  onAuthenticated: (u: User) => void;
}) {
  const [form, setForm] = useState({
      name: "",
      username: "",
      password: "",
      confirm: "",
    }),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupRequired && form.password !== form.confirm)
      return setMessage("As senhas não coincidem.");
    setBusy(true);
    const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: setupRequired ? "setup" : "login",
          ...form,
        }),
      }),
      b = await r.json();
    setBusy(false);
    if (!r.ok) return setMessage(b.error);
    onAuthenticated(b.user);
  };
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <span>FR</span>
          <div>
            <b>Folha Rural</b>
            <small>
              {cloudMode ? "ACESSO SUPABASE SEGURO" : "ACESSO LOCAL SEGURO"}
            </small>
          </div>
        </div>
        <h1>
          {setupRequired ? "Cadastrar administrador" : "Entrar no sistema"}
        </h1>
        <p>
          {setupRequired
            ? "Este é o primeiro acesso. Crie o usuário responsável pela administração."
            : `Informe seu ${cloudMode ? "e-mail" : "usuário"} e sua senha para continuar.`}
        </p>
        <form onSubmit={submit}>
          {setupRequired && (
            <label>
              Nome do administrador
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
          )}
          <label>
            {cloudMode ? "E-mail" : "Usuário"}
            <input
              required
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </label>
          <label>
            Senha
            <input
              required
              minLength={8}
              type={showPassword ? "text" : "password"}
              autoComplete={setupRequired ? "new-password" : "current-password"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {setupRequired && (
            <label>
              Confirmar senha
              <input
                required
                minLength={8}
                type={showPassword ? "text" : "password"}
                value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              />
            </label>
          )}
          <label className="show-password">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Exibir senha
          </label>
          {message && <div className="form-notice error">{message}</div>}
          <button className="primary" disabled={busy}>
            {busy
              ? "Aguarde…"
              : setupRequired
                ? "Criar administrador e entrar"
                : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
