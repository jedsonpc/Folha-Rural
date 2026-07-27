"use client";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import "./version15.css";
import "./version-badge.css";
import ProductionDashboard from "./production-dashboard";
import AuthScreen from "./auth-screen";

const AccessImporter = lazy(() => import("./access-importer"));
const DataModule = lazy(() => import("./data-module"));
const LaunchesModule = lazy(() => import("./launches-module"));
const ServicesModule = lazy(() => import("./services-module"));
const TaxTablesModule = lazy(() => import("./tax-tables-module"));
const ReportsModule = lazy(() => import("./reports-module"));
const ClosingModule = lazy(() => import("./closing-module"));
const UnionsModule = lazy(() => import("./unions-module"));
const UsersModule = lazy(() => import("./users-module"));
const CompaniesModule = lazy(() => import("./companies-module"));
const RegistrationsModule = lazy(() => import("./registrations-module"));
const nav = [
    ["VG", "Visão geral"],
    ["EM", "Empresas"],
    ["CL", "Colaboradores"],
    ["CD", "Cadastros"],
    ["SV", "Serviços"],
    ["SN", "Sindicatos"],
    ["TB", "Tabelas oficiais"],
    ["AP", "Apontamentos"],
    ["FC", "Fechamento"],
    ["RL", "Relatórios"],
    ["IA", "Importar Access"],
    ["US", "Usuários"],
  ],
  quickNav = [
    ["CL", "Colaboradores", "Cadastro pessoal"],
    ["CC", "Cadastros", "Centros de custo e CBO"],
    ["AP", "Apontamentos", "Produção diária"],
    ["SV", "Serviços", "Atividades e preços"],
    ["FC", "Fechamento", "Conferência da folha"],
    ["RL", "Relatórios", "Análises e recibos"],
  ],
  SYSTEM_VERSION = "1.3.23",
  LAST_UPDATE = "27/07/2026";
type Company = { sourceId: number; name: string };
type LocalUser = {
  id: number;
  name: string;
  username: string;
  role: string;
  permissions: string[];
};
export default function Home() {
  const [active, setActive] = useState("Visão geral"),
    [company, setCompany] = useState("all"),
    [companies, setCompanies] = useState<Company[]>([]),
    [menu, setMenu] = useState(false),
    [closed, setClosed] = useState(false),
    [localUser, setLocalUser] = useState<LocalUser | null | undefined>(
      undefined,
    ),
    [setupRequired, setSetupRequired] = useState(false);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((b) => {
        setSetupRequired(Boolean(b.setupRequired));
        setLocalUser(b.user || null);
      })
      .catch(() => setLocalUser(null));
  }, []);
  const loadCompanies = useCallback(() => {
    fetch(`/api/companies?fresh=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => setCompanies(b.companies || []))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (localUser) loadCompanies();
  }, [loadCompanies, localUser]);
  const selected = companies.find((x) => String(x.sourceId) === company),
    title = useMemo(
      () => (active === "Visão geral" ? "Painel operacional" : active),
      [active],
    );
  const visibleNav = nav.filter(
    ([, label]) =>
      localUser?.role === "admin" || localUser?.permissions.includes(label),
  );
  const openCompany = (v: string) => {
    setCompany(v);
    setActive("Colaboradores");
  };
  async function exitApp() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => undefined);
    setClosed(true);
    if (["127.0.0.1", "localhost"].includes(location.hostname)) {
      window.setTimeout(() => {
        try {
          window.open("", "_self");
          window.close();
        } catch {}
      }, 80);
      window.setTimeout(() => {
        fetch("/__local/shutdown", { method: "POST" }).catch(() => undefined);
      }, 450);
    } else location.href = "/signout-with-chatgpt?return_to=/";
  }
  if (localUser === undefined)
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <h1>Folha Rural</h1>
          <p>Preparando acesso seguro…</p>
        </section>
      </main>
    );
  if (localUser === null)
    return (
      <AuthScreen
        setupRequired={setupRequired}
        onAuthenticated={(u) => setLocalUser(u)}
      />
    );
  if (closed)
    return (
      <main className="closed-screen">
        <div>
          <span>✓</span>
          <h1>Folha Rural encerrado</h1>
          <p>O servidor local foi finalizado com segurança.</p>
        </div>
      </main>
    );
  return (
    <main className="app-shell">
      <aside className={`sidebar terra-sidebar ${menu ? "open" : ""}`}>
        <div className="brand terra-brand">
          <span className="brand-mark terra-logo">
            <i />
            <b />
          </span>
          <span>
            <strong>Folha</strong>
            <b>Rural</b>
            <small>GESTÃO DO CAMPO</small>
          </span>
        </div>
        <nav>
          {visibleNav.map(([icon, label]) => (
            <button
              key={label}
              className={active === label ? "active" : ""}
              onClick={() => {
                setActive(label);
                setMenu(false);
              }}
            >
              <i>{icon}</i>
              {label}
            </button>
          ))}
        </nav>
        <button className="exit-button" onClick={exitApp}>
          <i>↪</i>Sair e encerrar
        </button>
        <div className="profile">
          <span>{localUser.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <b>{localUser.name}</b>
            <small>
              {localUser.role === "admin" ? "Administrador" : "Usuário local"}
            </small>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header>
          <button className="mobile-menu" onClick={() => setMenu(!menu)}>
            ☰
          </button>
          <label>
            <span>⌂</span>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="all">Todas as empresas</option>
              {companies.map((x) => (
                <option value={x.sourceId} key={x.sourceId}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <div className="context-badge">
            <small>CONTEXTO ATUAL</small>
            <b>{selected?.name || "Visão consolidada"}</b>
          </div>
          <button className="primary" onClick={() => setActive("Apontamentos")}>
            <b>＋</b> Novo apontamento
          </button>
        </header>
        <nav className="quick-launcher" aria-label="Atalhos principais">
          {quickNav
            .filter(([, label]) =>
              localUser?.role === "admin" ||
              localUser?.permissions.includes(label),
            )
            .map(([icon, label, detail]) => (
              <button
                key={label}
                className={active === label ? "active" : ""}
                onClick={() => setActive(label)}
              >
                <i>{icon}</i>
                <span>
                  <b>{label}</b>
                  <small>{detail}</small>
                </span>
              </button>
            ))}
        </nav>
        <div className="title-row">
          <div>
            <p>
              {selected?.name || `${companies.length} empresas cadastradas`}
            </p>
            <h1>{title}</h1>
          </div>
          <div className="system-version">
            <small>VERSÃO DO SISTEMA</small>
            <b>Folha Rural v{SYSTEM_VERSION}</b>
            <span>Atualizado em {LAST_UPDATE}</span>
          </div>
        </div>
        <Suspense
          fallback={
            <section className="panel data-state">
              <span className="spinner" />
              <p>Carregando módulo…</p>
            </section>
          }
        >
          {active === "Visão geral" ? (
            <ProductionDashboard
              selectedCompany={company}
              onOpenWorkers={() => setActive("Colaboradores")}
            />
          ) : active === "Importar Access" ? (
            <AccessImporter />
          ) : active === "Serviços" ? (
            <ServicesModule />
          ) : active === "Sindicatos" ? (
            <UnionsModule />
          ) : active === "Usuários" ? (
            <UsersModule />
          ) : active === "Tabelas oficiais" ? (
            <TaxTablesModule />
          ) : active === "Apontamentos" ? (
            <LaunchesModule company={company} />
          ) : active === "Fechamento" ? (
            <ClosingModule company={company} />
          ) : active === "Relatórios" ? (
            <ReportsModule />
          ) : active === "Empresas" ? (
            <CompaniesModule onChanged={loadCompanies} />
          ) : active === "Cadastros" ? (
            <RegistrationsModule />
          ) : active === "Colaboradores" ? (
            <DataModule
              mode={active}
              selectedCompany={company}
              onSelectCompany={openCompany}
            />
          ) : (
            <ModuleInfo active={active} />
          )}
        </Suspense>
      </section>
    </main>
  );
}
function ModuleInfo({ active }: { active: string }) {
  const copy: Record<string, [string, string, string]> = {
    Relatórios: [
      "Central de relatórios",
      "Os relatórios serão gerados somente com dados reais.",
      "Recibos, produção, DSR e conferências entrarão na próxima etapa.",
    ],
  };
  const item = copy[active] || [
    active,
    "Módulo em preparação.",
    "Preparado para evolução.",
  ];
  return (
    <section className="module">
      <div className="module-hero">
        <span>▤</span>
        <div>
          <small>MÓDULO OPERACIONAL</small>
          <h2>{item[0]}</h2>
          <p>{item[1]}</p>
        </div>
      </div>
      <div className="module-actions production-empty">
        <article>
          <b>Base sem demonstrações</b>
          <p>{item[2]}</p>
        </article>
      </div>
    </section>
  );
}
