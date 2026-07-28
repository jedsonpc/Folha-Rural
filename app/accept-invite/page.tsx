"use client";

import { useEffect, useState } from "react";
import "../auth.css";

export default function AcceptInvitePage() {
  const [accessToken, setAccessToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.hash.replace(/^#/, ""));
    setAccessToken(params.get("access_token") || "");
    history.replaceState(null, "", location.pathname);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setMessage("As senhas não coincidem.");
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken, password }),
    });
    const body = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok)
      return setMessage(body.error || "Não foi possível concluir o convite.");
    setFinished(true);
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <div className="auth-brand">
          <span>FR</span>
          <div>
            <b>Folha Rural</b>
            <small>ACESSO SEGURO</small>
          </div>
        </div>
        {finished ? (
          <>
            <h1>Senha definida</h1>
            <p>
              Seu acesso foi confirmado. Use o e-mail convidado e a nova senha
              para entrar no Folha Rural.
            </p>
            <a className="primary auth-link" href="/">
              Voltar ao Folha Rural
            </a>
          </>
        ) : (
          <>
            <h1>Definir sua senha</h1>
            <p>
              Crie sua senha para concluir o convite de acesso ao Folha Rural.
            </p>
            <form onSubmit={submit}>
              <label>
                Nova senha
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              <label>
                Confirmar nova senha
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </label>
              {!accessToken && (
                <div className="form-notice error">
                  Este convite não é mais válido. Solicite um novo convite.
                </div>
              )}
              {message && <div className="form-notice error">{message}</div>}
              <button className="primary" disabled={busy || !accessToken}>
                {busy ? "Confirmando…" : "Definir senha"}
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
