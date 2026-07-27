"use client";
import { useEffect, useState } from "react";
import "./users.css";
type User = {
  id: number;
  name: string;
  username: string;
  role: string;
  permissions: string[];
  active: boolean;
};
const empty = {
  name: "",
  username: "",
  password: "",
  role: "operator",
  permissions: [] as string[],
  active: true,
};
export default function UsersModule() {
  const [rows, setRows] = useState<User[]>([]),
    [modules, setModules] = useState<string[]>([]),
    [editing, setEditing] = useState<User | null | undefined>(),
    [form, setForm] = useState(empty),
    [message, setMessage] = useState("");
  const load = () =>
    fetch("/api/users")
      .then((r) => r.json())
      .then((b) => {
        setRows(b.users || []);
        setModules(b.modules || []);
        if (b.error) setMessage(b.error);
      });
  useEffect(() => {
    load();
  }, []);
  const save = async () => {
    const r = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editing?.id }),
      }),
      b = await r.json();
    setMessage(b.message || b.error);
    if (r.ok) {
      setEditing(undefined);
      load();
    }
  };
  return (
    <section className="module users-module">
      <div className="module-hero">
        <span>♙</span>
        <div>
          <small>SEGURANÇA E PERMISSÕES</small>
          <h2>Usuários do sistema</h2>
          <p>
            Crie acessos individuais e defina os módulos liberados para cada
            perfil.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setForm(empty);
          }}
        >
          ＋ Novo usuário
        </button>
      </div>
      {message && <div className="inline-notice">{message}</div>}
      <div className="table-scroll user-list">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Acessos</th>
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <b>{u.name}</b>
                </td>
                <td>{u.username}</td>
                <td>
                  {u.role === "admin" ? "Administrador" : "Personalizado"}
                </td>
                <td>
                  {u.role === "admin"
                    ? "Todos"
                    : `${u.permissions.length} módulos`}
                </td>
                <td>{u.active ? "Ativo" : "Bloqueado"}</td>
                <td>
                  <button
                    className="table-action"
                    onClick={() => {
                      setEditing(u);
                      setForm({
                        name: u.name,
                        username: u.username,
                        password: "",
                        role: u.role,
                        permissions: u.permissions,
                        active: u.active,
                      });
                    }}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing !== undefined && (
        <div className="modal-backdrop">
          <div className="modal user-modal">
            <div className="modal-head">
              <div>
                <small>CONTROLE DE ACESSO</small>
                <h2>{editing ? "Editar usuário" : "Novo usuário"}</h2>
              </div>
              <button onClick={() => setEditing(undefined)}>×</button>
            </div>
            <div className="form-grid">
              <label>
                Nome
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              <label>
                Usuário
                <input
                  value={form.username}
                  onChange={(e) =>
                    setForm({ ...form, username: e.target.value })
                  }
                />
              </label>
              <label>
                Senha {editing && "(deixe vazia para manter)"}
                <input
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                />
              </label>
              <label>
                Perfil
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                >
                  <option value="operator">Acesso personalizado</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />{" "}
                Usuário ativo
              </label>
            </div>
            {form.role !== "admin" && (
              <div className="permission-grid">
                {modules
                  .filter((m) => m !== "Usuários")
                  .map((m) => (
                    <label key={m}>
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(m)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            permissions: e.target.checked
                              ? [...form.permissions, m]
                              : form.permissions.filter((x) => x !== m),
                          })
                        }
                      />
                      {m}
                    </label>
                  ))}
              </div>
            )}
            <div className="actions">
              <button
                className="secondary"
                onClick={() => setEditing(undefined)}
              >
                Cancelar
              </button>
              <button className="primary" onClick={save}>
                Salvar usuário
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
