import { useEffect, useState } from "react";
import type { FormEvent } from "react";

interface User {
  id: number;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
}

interface LoginResponse {
  message: string;
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: User;
}

interface MeResponse {
  user: User;
}

interface RegisterResponse {
  message: string;
  user: User;
}

interface Modality {
  code: string;
  name: string;
  limits: {
    minAmount: number;
    maxAmount: number;
    minTerm: number;
    maxTerm: number;
  };
}

interface Simulation {
  id: number;
  modality: {
    code: string;
    name: string;
  };
  requestedAmount: number;
  term: number;
  monthlyRatePercent: number;
  installmentAmount: number;
  totalAmount: number;
  totalInterest: number;
  createdAt?: string;
}

interface ModalitiesResponse {
  modalities: Modality[];
}

interface SimulationResponse {
  message: string;
  simulation: Simulation;
}

interface HistoryResponse {
  simulations: Simulation[];
}

type AuthMode = "login" | "register";
type DashboardView = "simulator" | "history" | "account";

const TOKEN_KEY = "finansys_access_token";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value?: string): string {
  if (!value) return "Data não disponível";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Data não disponível";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

async function readError(response: Response): Promise<string> {
  try {
    const body: { error?: string } = await response.json();
    return body.error ?? "Ocorreu um erro inesperado.";
  } catch {
    return "Não foi possível interpretar a resposta do servidor.";
  }
}

async function fetchHistory(token: string): Promise<Simulation[]> {
  const response = await fetch("/api/v1/simulations", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  const data: HistoryResponse = await response.json();
  return data.simulations;
}

export default function App() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [view, setView] = useState<DashboardView>("simulator");
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [selectedCode, setSelectedCode] = useState("");
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [history, setHistory] = useState<Simulation[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [dashboardSuccess, setDashboardSuccess] = useState("");

  const selectedModality =
    modalities.find((modality) => modality.code === selectedCode) ?? null;

  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadUser() {
      try {
        const response = await fetch("/api/v1/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!response.ok) {
          sessionStorage.removeItem(TOKEN_KEY);
          setUser(null);
          return;
        }

        const data: MeResponse = await response.json();
        setUser(data.user);
      } catch {
        if (!controller.signal.aborted) {
          setError(
            "Não foi possível conectar à API. Verifique se o backend está ligado.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadUser();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!user) {
      setModalities([]);
      setHistory([]);
      setSimulation(null);
      return;
    }

    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) return;

    const controller = new AbortController();

    async function loadDashboardData() {
      setDashboardLoading(true);
      setDashboardError("");

      try {
        const [modalitiesResponse, historyResponse] = await Promise.all([
          fetch("/api/v1/modalities", {
            signal: controller.signal,
          }),
          fetch("/api/v1/simulations", {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          }),
        ]);

        if (!modalitiesResponse.ok) {
          throw new Error(await readError(modalitiesResponse));
        }

        if (!historyResponse.ok) {
          throw new Error(await readError(historyResponse));
        }

        const modalitiesData: ModalitiesResponse =
          await modalitiesResponse.json();
        const historyData: HistoryResponse = await historyResponse.json();

        if (controller.signal.aborted) return;

        setModalities(modalitiesData.modalities);
        setHistory(historyData.simulations);

        setSelectedCode((currentCode) => {
          if (
            currentCode &&
            modalitiesData.modalities.some(
              (modality) => modality.code === currentCode,
            )
          ) {
            return currentCode;
          }

          return modalitiesData.modalities[0]?.code ?? "";
        });
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setDashboardError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os dados do painel.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setDashboardLoading(false);
      }
    }

    void loadDashboardData();

    return () => controller.abort();
  }, [user]);

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setPassword("");
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const data: LoginResponse = await response.json();

      sessionStorage.setItem(TOKEN_KEY, data.accessToken);
      setUser(data.user);
      setPassword("");
      setView("simulator");
    } catch {
      setError(
        "Não foi possível conectar à API. Verifique se o backend está ligado.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    if (new TextEncoder().encode(password).length > 72) {
      setError("A senha não pode ultrapassar 72 bytes.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const data: RegisterResponse = await response.json();

      setSuccess(`${data.message} Agora, entre com seu e-mail e senha.`);
      setMode("login");
      setName("");
      setPassword("");
    } catch {
      setError(
        "Não foi possível conectar à API. Verifique se o backend está ligado.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCalculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDashboardError("");
    setDashboardSuccess("");
    setSimulation(null);

    const token = sessionStorage.getItem(TOKEN_KEY);

    if (!token) {
      handleLogout();
      setError("Sua sessão expirou. Entre novamente.");
      return;
    }

    if (!selectedModality) {
      setDashboardError("Selecione uma modalidade de crédito.");
      return;
    }

    const numericAmount = Number(amount);
    const numericTerm = Number(term);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount < selectedModality.limits.minAmount ||
      numericAmount > selectedModality.limits.maxAmount
    ) {
      setDashboardError(
        `Informe um valor entre ${formatCurrency(selectedModality.limits.minAmount)} e ${formatCurrency(selectedModality.limits.maxAmount)}.`,
      );
      return;
    }

    if (
      !Number.isInteger(numericTerm) ||
      numericTerm < selectedModality.limits.minTerm ||
      numericTerm > selectedModality.limits.maxTerm
    ) {
      setDashboardError(
        `Escolha um prazo entre ${selectedModality.limits.minTerm} e ${selectedModality.limits.maxTerm} meses.`,
      );
      return;
    }

    setCalculating(true);

    try {
      const response = await fetch("/api/v1/simulations/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          modalityCode: selectedModality.code,
          amount: numericAmount,
          term: numericTerm,
        }),
      });

      if (response.status === 401) {
        handleLogout();
        setError("Sua sessão expirou. Entre novamente.");
        return;
      }

      if (!response.ok) {
        setDashboardError(await readError(response));
        return;
      }

      const data: SimulationResponse = await response.json();

      setSimulation(data.simulation);
      setDashboardSuccess(data.message);

      const updatedHistory = await fetchHistory(token);
      setHistory(updatedHistory);
    } catch (calculateError) {
      setDashboardError(
        calculateError instanceof Error
          ? calculateError.message
          : "Não foi possível realizar a simulação.",
      );
    } finally {
      setCalculating(false);
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setError("");
    setSuccess("");
    setDashboardError("");
    setDashboardSuccess("");
    setMode("login");
    setView("simulator");
    setSimulation(null);
  }

  function useHistorySimulation(item: Simulation) {
    setSelectedCode(item.modality.code);
    setAmount(String(item.requestedAmount));
    setTerm(String(item.term));
    setSimulation(item);
    setDashboardError("");
    setDashboardSuccess("");
    setView("simulator");
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="loading-spinner" aria-hidden="true" />
        <p>Carregando FinanSys...</p>
      </main>
    );
  }

  if (user) {
    return (
      <main className="dashboard">
        <header className="topbar">
          <a className="brand" href="/" aria-label="FinanSys início">
            <span className="brand-icon">F</span>
            <span>
              Finan<span className="brand-accent">Sys</span>
            </span>
          </a>

          <div className="topbar-actions">
            <span className="user-greeting">
              Olá, {user.name.split(" ")[0]}
            </span>
            <button
              className="button button-outline"
              onClick={handleLogout}
            >
              Sair
            </button>
          </div>
        </header>

        <section className="welcome-section">
          <p className="eyebrow">ÁREA DO CLIENTE</p>
          <h1>Planeje seu próximo passo.</h1>
          <p className="welcome-description">
            Consulte estimativas de crédito e acompanhe suas simulações.
          </p>
        </section>

        <nav className="dashboard-nav" aria-label="Navegação principal">
          <button
            className={`nav-tab ${view === "simulator" ? "active" : ""}`}
            onClick={() => setView("simulator")}
          >
            Simular crédito
          </button>
          <button
            className={`nav-tab ${view === "history" ? "active" : ""}`}
            onClick={() => setView("history")}
          >
            Histórico ({history.length})
          </button>
          <button
            className={`nav-tab ${view === "account" ? "active" : ""}`}
            onClick={() => setView("account")}
          >
            Minha conta
          </button>
        </nav>

        {dashboardError && (
          <p className="error-message dashboard-message" role="alert">
            {dashboardError}
          </p>
        )}

        {dashboardSuccess && view === "simulator" && (
          <p className="success-message dashboard-message" role="status">
            {dashboardSuccess}
          </p>
        )}

        {dashboardLoading && (
          <p className="dashboard-loading">Carregando seus dados...</p>
        )}

        {view === "simulator" && (
          <section className="simulator-layout">
            <article className="info-card simulator-card">
              <div className="section-heading">
                <p className="eyebrow">SIMULADOR</p>
                <h2>Encontre uma estimativa para você</h2>
                <p>
                  Escolha uma modalidade, informe o valor e o prazo desejados.
                </p>
              </div>

              {modalities.length === 0 && !dashboardLoading ? (
                <p className="empty-state">
                  Nenhuma modalidade está disponível no momento.
                </p>
              ) : (
                <form className="simulator-form" onSubmit={handleCalculate}>
                  <label htmlFor="modality">Modalidade de crédito</label>
                  <select
                    id="modality"
                    name="modality"
                    value={selectedCode}
                    onChange={(event) => {
                      setSelectedCode(event.target.value);
                      setSimulation(null);
                      setDashboardError("");
                      setDashboardSuccess("");
                    }}
                    required
                  >
                    {modalities.map((modality) => (
                      <option key={modality.code} value={modality.code}>
                        {modality.name}
                      </option>
                    ))}
                  </select>

                  {selectedModality && (
                    <div className="limits-note">
                      <span>
                        Valor: {formatCurrency(selectedModality.limits.minAmount)} a{" "}
                        {formatCurrency(selectedModality.limits.maxAmount)}
                      </span>
                      <span>
                        Prazo: {selectedModality.limits.minTerm} a{" "}
                        {selectedModality.limits.maxTerm} meses
                      </span>
                    </div>
                  )}

                  <label htmlFor="amount">Valor desejado (R$)</label>
                  <input
                    id="amount"
                    name="amount"
                    type="number"
                    min={selectedModality?.limits.minAmount}
                    max={selectedModality?.limits.maxAmount}
                    step="0.01"
                    placeholder="Ex.: 10000"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />

                  <label htmlFor="term">Prazo (meses)</label>
                  <input
                    id="term"
                    name="term"
                    type="number"
                    min={selectedModality?.limits.minTerm}
                    max={selectedModality?.limits.maxTerm}
                    step="1"
                    placeholder="Ex.: 24"
                    value={term}
                    onChange={(event) => setTerm(event.target.value)}
                    required
                  />

                  <button
                    className="button button-primary login-button"
                    type="submit"
                    disabled={calculating || dashboardLoading || !selectedModality}
                  >
                    {calculating ? "Calculando..." : "Calcular simulação"}
                    {!calculating && <span aria-hidden="true">→</span>}
                  </button>
                </form>
              )}

              <p className="simulation-disclaimer">
                Os valores são estimativas para fins de planejamento. Não
                representam uma oferta ou aprovação de crédito.
              </p>
            </article>

            <aside className="info-card result-card">
              <p className="eyebrow">RESULTADO</p>
              <h2>Sua estimativa</h2>

              {simulation ? (
                <>
                  <p className="result-label">Valor estimado da parcela</p>
                  <p className="result-main">
                    {formatCurrency(simulation.installmentAmount)}
                  </p>
                  <p className="result-subtitle">
                    por mês durante {simulation.term} meses
                  </p>

                  <div className="result-divider" />

                  <dl className="result-details">
                    <div>
                      <dt>Modalidade</dt>
                      <dd>{simulation.modality.name}</dd>
                    </div>
                    <div>
                      <dt>Valor solicitado</dt>
                      <dd>{formatCurrency(simulation.requestedAmount)}</dd>
                    </div>
                    <div>
                      <dt>Taxa mensal estimada</dt>
                      <dd>
                        {numberFormatter.format(simulation.monthlyRatePercent)}%
                      </dd>
                    </div>
                    <div>
                      <dt>Total de juros</dt>
                      <dd>{formatCurrency(simulation.totalInterest)}</dd>
                    </div>
                    <div className="result-total">
                      <dt>Total estimado a pagar</dt>
                      <dd>{formatCurrency(simulation.totalAmount)}</dd>
                    </div>
                  </dl>
                  <p className="saved-note">
                    Simulação salva no seu histórico.
                  </p>
                </>
              ) : (
                <div className="result-placeholder">
                  <span className="result-placeholder-icon" aria-hidden="true">
                    R$
                  </span>
                  <p>
                    Preencha os dados ao lado para visualizar o valor estimado
                    da parcela, os juros e o total a pagar.
                  </p>
                </div>
              )}
            </aside>
          </section>
        )}

        {view === "history" && (
          <section className="info-card history-card">
            <div className="section-heading">
              <p className="eyebrow">SUAS CONSULTAS</p>
              <h2>Histórico de simulações</h2>
              <p>
                Exibindo até 50 simulações recentes da sua conta.
              </p>
            </div>

            {history.length === 0 ? (
              <p className="empty-state">
                Você ainda não tem simulações salvas. Faça sua primeira
                simulação para vê-la aqui.
              </p>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <article className="history-item" key={item.id}>
                    <div className="history-item-main">
                      <span className="history-modality">
                        {item.modality.name}
                      </span>
                      <span className="history-date">
                        {formatDate(item.createdAt)}
                      </span>
                      <span className="history-description">
                        {formatCurrency(item.requestedAmount)} · {item.term}{" "}
                        meses · taxa de{" "}
                        {numberFormatter.format(item.monthlyRatePercent)}% a.m.
                      </span>
                    </div>

                    <div className="history-item-total">
                      <span>Parcela estimada</span>
                      <strong>{formatCurrency(item.installmentAmount)}</strong>
                      <span>Total: {formatCurrency(item.totalAmount)}</span>
                    </div>

                    <button
                      className="button button-outline history-action"
                      onClick={() => useHistorySimulation(item)}
                    >
                      Ver detalhes
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "account" && (
          <section className="info-card account-card account-page">
            <p className="eyebrow">SEUS DADOS</p>
            <h2>Minha conta</h2>
            <dl className="account-details">
              <div>
                <dt>Nome</dt>
                <dd>{user.name}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{user.email}</dd>
              </div>
              <div>
                <dt>Perfil</dt>
                <dd>{user.role === "ADMIN" ? "Administrador" : "Cliente"}</dd>
              </div>
            </dl>
          </section>
        )}

        <footer className="footer">
          <span>FinanSys</span>
          <span>Simulações para planejamento financeiro.</span>
        </footer>
      </main>
    );
  }

  const isRegister = mode === "register";

  return (
    <main className="login-layout">
      <section className="brand-panel">
        <div className="brand-panel-content">
          <a className="brand brand-light" href="/" aria-label="FinanSys">
            <span className="brand-icon">F</span>
            <span>
              Finan<span className="brand-accent">Sys</span>
            </span>
          </a>

          <div className="hero-copy">
            <p className="eyebrow">PLANEJE COM CLAREZA</p>
            <h1>Decisões financeiras começam com informação.</h1>
            <p>
              Simule condições de crédito e organize suas informações
              financeiras em um só lugar.
            </p>
          </div>

          <div className="panel-note">
            <span className="note-dot" />
            Simulações transparentes para ajudar no seu planejamento.
          </div>
        </div>
        <div className="decorative-orb orb-one" />
        <div className="decorative-orb orb-two" />
      </section>

      <section className="form-panel">
        <div className="login-card">
          <div className="mobile-brand">
            <span className="brand-icon">F</span>
            <span>
              Finan<span className="brand-accent">Sys</span>
            </span>
          </div>

          <p className="eyebrow">
            {isRegister ? "COMECE POR AQUI" : "BEM-VINDO DE VOLTA"}
          </p>
          <h2>{isRegister ? "Crie sua conta" : "Acesse sua conta"}</h2>
          <p className="form-description">
            {isRegister
              ? "Preencha seus dados para começar."
              : "Entre com seus dados para continuar."}
          </p>

          <form onSubmit={isRegister ? handleRegister : handleLogin}>
            {isRegister && (
              <>
                <label htmlFor="name">Nome completo</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  placeholder="Seu nome completo"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={2}
                  maxLength={120}
                  required
                />
              </>
            )}

            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={255}
              required
            />

            <label htmlFor="password">Senha</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              placeholder={isRegister ? "Mínimo de 8 caracteres" : "Digite sua senha"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={isRegister ? 8 : undefined}
              required
            />

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            {success && (
              <p className="success-message" role="status">
                {success}
              </p>
            )}

            <button
              className="button button-primary login-button"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Aguarde..."
                : isRegister
                  ? "Criar minha conta"
                  : "Entrar na conta"}
              {!submitting && <span aria-hidden="true">→</span>}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? "Já tem uma conta?" : "Ainda não tem uma conta?"}{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => changeMode(isRegister ? "login" : "register")}
            >
              {isRegister ? "Entrar" : "Cadastre-se"}
            </button>
          </p>

          <p className="security-note">
            <span aria-hidden="true">◆</span>
            Acesso protegido por autenticação.
          </p>
        </div>

        <footer className="form-footer">Projeto de portfólio · FinanSys</footer>
      </section>
    </main>
  );
}