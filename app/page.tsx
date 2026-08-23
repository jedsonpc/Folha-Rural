"use client";
import {
  lazy,
  Suspense,
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import "./version15.css";
import "./version-badge.css";
import ProductionDashboard from "./production-dashboard";
import AuthScreen from "./auth-screen";
import { companyBrandImage } from "./company-branding";
import packageInfo from "../package.json";

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
const InventoryModule = lazy(() => import("./inventory-module"));
const navGroups = [
    {
      label: "Gestão agrícola",
      icon: "GA",
      items: [
        ["PA", "Painel agrícola"],
        ["PI", "Produtos e insumos"],
        ["CF", "Clientes e fornecedores"],
        ["CU", "Culturas"],
        ["ME", "Entradas e saídas"],
        ["RG", "Relatórios agrícolas"],
      ],
    },
    {
      label: "Visão geral",
      icon: "CO",
      items: [
        ["VG", "Visão geral"],
      ],
    },
    {
      label: "Cadastros",
      icon: "CD",
      items: [
        ["EM", "Empresas"],
        ["CL", "Colaboradores"],
        ["FN", "Funções"],
        ["VI", "Vínculos"],
        ["SV", "Serviços"],
        ["ES", "Evolução salarial"],
        ["RS", "Reajuste salarial"],
        ["CC", "Centros de custo"],
        ["EP", "EPI"],
        ["FR", "Ferramentas"],
        ["SN", "Sindicatos"],
        ["US", "Usuários"],
      ],
    },
    {
      label: "Processamento",
      icon: "PR",
      items: [
        ["AP", "Apontamentos"],
        ["FE", "Férias"],
        ["13", "13º Salário"],
        ["RE", "Rescisão"],
        ["FC", "Fechamento"],
      ],
    },
    {
      label: "Tributos",
      icon: "TR",
      items: [["TB", "Tabelas oficiais"]],
    },
    {
      label: "Relatórios",
      icon: "RL",
      items: [
        ["RA", "Relatórios Analíticos"],
        ["RR", "Relatórios Resumo"],
      ],
    },
    {
      label: "Integrações",
      icon: "IN",
      items: [["IA", "Importar Access"]],
    },
  ],
  SYSTEM_VERSION = packageInfo.version,
  LAST_UPDATE = "22/08/2026";
type Company = {
  sourceId: number;
  name: string;
  document: string | null;
  documentType: string;
  postalCode: string | null;
  address: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};
type LocalUser = {
  id: number | string;
  name: string;
  username: string;
  role: string;
  permissions: string[];
  companyIds?: number[] | null;
};
export default function Home() {
  const [active, setActive] = useState("Visão geral"),
    [company, setCompany] = useState(""),
    [companies, setCompanies] = useState<Company[]>([]),
    [companiesLoaded, setCompaniesLoaded] = useState(false),
    [menu, setMenu] = useState(false),
    [openGroup, setOpenGroup] = useState<string | null>(null),
    [closed, setClosed] = useState(false),
    [qrOpen, setQrOpen] = useState(false),
    [qrUrlCopied, setQrUrlCopied] = useState(false),
    [localUser, setLocalUser] = useState<LocalUser | null | undefined>(
      undefined,
    ),
    [setupRequired, setSetupRequired] = useState(false),
    [cloudMode, setCloudMode] = useState(false),
    [reviewOnly, setReviewOnly] = useState(false);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((b) => {
        setSetupRequired(Boolean(b.setupRequired));
        setCloudMode(b.authMode === "cloud");
        setLocalUser(b.user || null);
      })
      .catch(() => setLocalUser(null));
  }, []);
  const loadCompanies = useCallback(() => {
    fetch(`/api/companies?fresh=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b) => {
        const rows = (b.companies || []) as Company[];
        const visible =
          localUser?.companyIds == null
            ? rows
            : rows.filter((row) =>
                localUser.companyIds?.includes(row.sourceId),
              );
        setCompanies(visible);
        setCompany((current) => {
          if (visible.length === 1) return String(visible[0].sourceId);
          return visible.some((row) => String(row.sourceId) === current)
            ? current
            : "";
        });
        setCompaniesLoaded(true);
      })
      .catch(() => {
        setCompanies([]);
        setCompany("");
        setCompaniesLoaded(true);
      });
  }, [localUser]);
  useEffect(() => {
    if (localUser) {
      setCompaniesLoaded(false);
      setCompany("");
      loadCompanies();
    }
  }, [loadCompanies, localUser]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".menu-groups")
      )
        setOpenGroup(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenGroup(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  const selected = companies.find((x) => String(x.sourceId) === company),
    sidebarImage = selected ? companyBrandImage(selected.name) : null,
    title = useMemo(
      () => (active === "Visão geral" ? "Painel operacional" : active),
      [active],
    );
  const selectedDocument = selected
      ? formatCompanyDocument(selected.document)
      : "",
    selectedAddress = selected ? companyAddress(selected) : "";
  const openCompany = (v: string) => {
    setCompany(v);
    setActive("Colaboradores");
  };
  async function copySystemUrl() {
    await navigator.clipboard.writeText(window.location.origin);
    setQrUrlCopied(true);
    window.setTimeout(() => setQrUrlCopied(false), 2500);
  }
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
    } else location.href = "/";
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
        cloudMode={cloudMode}
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
  if (!companiesLoaded)
    return (
      <main className="company-choice-screen">
        <section className="company-choice-card loading">
          <img src="/folha-rural-512.png" alt="" />
          <span className="spinner" />
          <h1>Preparando suas empresas…</h1>
        </section>
      </main>
    );
  if (!companies.length)
    return (
      <main className="company-choice-screen">
        <section className="company-choice-card">
          <img src="/folha-rural-512.png" alt="Folha Rural" />
          <small>ACESSO ÀS EMPRESAS</small>
          <h1>Nenhuma empresa disponível</h1>
          <p>
            Seu perfil ainda não possui autorização para trabalhar em uma
            empresa. Solicite o acesso ao administrador.
          </p>
          <button className="secondary" onClick={exitApp}>
            Sair
          </button>
        </section>
      </main>
    );
  if (!company)
    return (
      <main className="company-choice-screen">
        <section className="company-choice-card">
          <img src="/folha-rural-512.png" alt="Folha Rural" />
          <small>SELECIONE O CONTEXTO DE TRABALHO</small>
          <h1>Em qual empresa deseja entrar?</h1>
          <p>
            Olá, {localUser.name}. Você poderá trocar de empresa pelo seletor
            superior dentro do sistema.
          </p>
          <div className="company-choice-list">
            {companies.map((item) => (
              <button
                key={item.sourceId}
                type="button"
                onClick={() => {
                  setCompany(String(item.sourceId));
                  setActive("Visão geral");
                }}
              >
                <span>{item.name.slice(0, 1).toUpperCase()}</span>
                <b>{item.name}</b>
                <i aria-hidden="true">›</i>
              </button>
            ))}
          </div>
          <button className="company-choice-exit" onClick={exitApp}>
            Sair deste usuário
          </button>
        </section>
      </main>
    );
  return (
    <main className="app-shell">
      <aside
        className={`sidebar terra-sidebar ${menu ? "open" : ""} ${sidebarImage ? "company-branded-sidebar" : ""}`}
        style={
          sidebarImage
            ? ({ "--sidebar-company-image": `url("${sidebarImage}")` } as CSSProperties)
            : undefined
        }
      >
        <div className="brand terra-brand">
          <span>
            <strong>Folha</strong>
            <b>Rural</b>
            <small>GESTÃO DO CAMPO</small>
          </span>
        </div>
        <nav className="menu-groups" aria-label="Menu principal">
          {navGroups.map((group) => {
            const registrationItems = [
              "Funções",
              "Vínculos",
              "Evolução salarial",
              "Reajuste salarial",
              "Centros de custo",
              "EPI",
              "Ferramentas",
            ];
            const agriculturalItems = [
              "Painel agrícola",
              "Produtos e insumos",
              "Clientes e fornecedores",
              "Culturas",
              "Entradas e saídas",
              "Relatórios agrícolas",
            ];
            const items = group.items.filter(
              ([, label]) =>
                localUser?.role === "admin" ||
                localUser?.permissions.includes(label) ||
                localUser?.permissions.includes(group.label) ||
                (agriculturalItems.includes(label) &&
                  localUser?.permissions.includes("Estoque e custos")) ||
                (registrationItems.includes(label) &&
                  localUser?.permissions.includes("Cadastros")),
            );
            if (!items.length) return null;
            const selected = items.some(([, label]) => label === active);
            const expanded = openGroup === group.label;
            if (items.length === 1 && items[0][1] === group.label)
              return (
                <div className="menu-group" key={group.label}>
                  <button
                    className={`menu-trigger ${selected ? "selected" : ""}`}
                    onClick={() => {
                      setActive(items[0][1]);
                      setOpenGroup(null);
                      setMenu(false);
                    }}
                  >
                    <i>{items[0][0]}</i>
                    <span>{group.label}</span>
                  </button>
                </div>
              );
            return (
              <div
                className={`menu-group ${group.label === "Cadastros" ? "cadastros-menu" : ""} ${expanded ? "expanded" : ""}`}
                key={group.label}
              >
                <button
                  className={`menu-trigger ${selected ? "selected" : ""}`}
                  aria-expanded={expanded}
                  onClick={() =>
                    setOpenGroup(openGroup === group.label ? null : group.label)
                  }
                >
                  <i>{group.icon}</i>
                  <span>{group.label}</span>
                  <b>›</b>
                </button>
                <div className="submenu">
                  {items.map(([icon, label]) => (
                    <button
                      key={label}
                      className={active === label ? "active" : ""}
                      onClick={() => {
                        if (label === "Colaboradores") setReviewOnly(false);
                        setActive(label);
                        setOpenGroup(null);
                        setMenu(false);
                      }}
                    >
                      <i>{icon}</i>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
      <section
        className={`workspace ${active === "Visão geral" ? "operational-workspace" : ""}`}
      >
        <header>
          <button className="mobile-menu" onClick={() => setMenu(!menu)}>
            ☰
          </button>
          <label>
            <span>⌂</span>
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              aria-label="Trocar empresa"
            >
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
          <button
            className="qr-access-button"
            type="button"
            onClick={() => {
              setQrUrlCopied(false);
              setQrOpen(true);
            }}
          >
            <span aria-hidden="true">▦</span>
            Gerar QR Code
          </button>
          <button className="primary" onClick={() => setActive("Apontamentos")}>
            <b>＋</b> Novo apontamento
          </button>
        </header>
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
        {selected && sidebarImage && (
          <section className="company-brand-hero company-tab-brand">
            <img src={sidebarImage} alt="" />
            <div>
              <small>EMPRESA EM USO</small>
              <h2>{selected.name}</h2>
              <p>
                <strong>
                  {selected.documentType?.toLowerCase() === "caepf"
                    ? "CAEPF"
                    : "CNPJ"}
                  : {selectedDocument}
                </strong>
              </p>
              <p>{selectedAddress}</p>
            </div>
          </section>
        )}
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
              onOpenWorkers={() => { setReviewOnly(false); setActive("Colaboradores"); }}
              onOpenReviews={() => { setReviewOnly(true); setActive("Colaboradores"); }}
            />
          ) : active === "Importar Access" ? (
            <AccessImporter />
          ) : active === "Serviços" ? (
            <ServicesModule company={company} />
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
          ) : active === "Painel agrícola" ? (
            <InventoryModule company={company} section="dashboard" />
          ) : active === "Produtos e insumos" ? (
            <InventoryModule company={company} section="products" />
          ) : active === "Clientes e fornecedores" ? (
            <InventoryModule company={company} section="partners" />
          ) : active === "Culturas" ? (
            <InventoryModule company={company} section="crops" />
          ) : active === "Entradas e saídas" ? (
            <InventoryModule company={company} section="movements" />
          ) : active === "Relatórios agrícolas" ? (
            <InventoryModule company={company} section="reports" />
          ) : active === "Relatórios Analíticos" ? (
            <ReportsModule selectedCompany={company} category="analytical" />
          ) : active === "Relatórios Resumo" ? (
            <ReportsModule selectedCompany={company} category="summary" />
          ) : active === "Empresas" ? (
            <CompaniesModule onChanged={loadCompanies} />
          ) : [
              "Funções",
              "Vínculos",
              "Evolução salarial",
              "Reajuste salarial",
              "Centros de custo",
              "EPI",
              "Ferramentas",
            ].includes(active) ? (
            <RegistrationsModule activeSection={active} />
          ) : active === "Colaboradores" ? (
            <DataModule
              mode={active}
              selectedCompany={company}
              onSelectCompany={openCompany}
              reviewOnly={reviewOnly}
            />
          ) : (
            <ModuleInfo active={active} />
          )}
        </Suspense>
      </section>
      {qrOpen && (
        <div
          className="qr-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setQrOpen(false);
          }}
        >
          <section
            className="qr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-modal-title"
          >
            <button
              className="qr-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setQrOpen(false)}
            >
              ×
            </button>
            <img
              className="qr-modal-brand"
              src="/folha-rural-512.png"
              alt=""
            />
            <small>ACESSO PELO CELULAR</small>
            <h2 id="qr-modal-title">QR Code de acesso ao sistema</h2>
            <p>
              Aponte a câmera do celular para o código abaixo e abra o Folha
              Rural.
            </p>
            <img
              className="qr-code-image"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
                window.location.origin,
              )}`}
              alt={`QR Code para acessar ${window.location.origin}`}
            />
            <div className="qr-system-url">
              <label htmlFor="qr-system-address">Endereço do sistema</label>
              <div>
                <input
                  id="qr-system-address"
                  value={window.location.origin}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button type="button" onClick={copySystemUrl}>
                  {qrUrlCopied ? "Copiado!" : "Copiar endereço"}
                </button>
              </div>
              <small>
                Copie esta URL para acessar ou instalar o sistema em outro
                computador.
              </small>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function formatCompanyDocument(document: string | null) {
  const value = String(document || "").replace(/\D/g, "");
  if (!value) return "não informado";
  return value.length === 14
    ? value.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        "$1.$2.$3/$4-$5",
      )
    : document || value;
}

function companyAddress(company: Company) {
  const street = [
      company.address,
      company.addressNumber,
      company.addressComplement,
    ]
      .filter(Boolean)
      .join(", "),
    location = [company.district, company.city, company.state]
      .filter(Boolean)
      .join(" · "),
    postalCode = String(company.postalCode || "").replace(/\D/g, ""),
    cep =
      postalCode.length === 8
        ? `CEP ${postalCode.slice(0, 5)}-${postalCode.slice(5)}`
        : "";
  return (
    [street, location, cep].filter(Boolean).join(" — ") ||
    "Endereço não informado"
  );
}

function ModuleInfo({ active }: { active: string }) {
  const copy: Record<string, [string, string, string]> = {
    Férias: [
      "Apontamento de férias",
      "Área reservada para registrar períodos aquisitivos, gozo e abono.",
      "A fórmula e as regras de cálculo serão vinculadas quando forem definidas.",
    ],
    "13º Salário": [
      "Apontamento de 13º Salário",
      "Área reservada para registrar adiantamento e parcela final do 13º.",
      "A fórmula e as regras de cálculo serão vinculadas quando forem definidas.",
    ],
    Rescisão: [
      "Apontamento de rescisão",
      "Área reservada para registrar desligamento e verbas rescisórias.",
      "A fórmula e as regras de cálculo serão vinculadas quando forem definidas.",
    ],
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
