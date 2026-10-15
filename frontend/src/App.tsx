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

type AuthMode = "login" | "register";

const TOKEN_KEY = "finansys_access_token";

async function readError(response: Response): Promise<string> {
  try {
    const body: { error?: string } = await response.json();
    return body.error ?? "Ocorreu um erro inesperado.";
  } catch {
    return "Não foi possível interpretar a resposta do servidor.";
  }
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
          headers: {
            Authorization: `Bearer ${token}`,
          },
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
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadUser();

    return () => controller.abort();
  }, []);

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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      if (!response.ok) {
        setError(await readError(response));
        return;
      }

      const data: LoginResponse = await response.json();

      sessionStorage.setItem(TOKEN_KEY, data.accessToken);
      setUser(data.user);
      setPassword("");
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
        headers: {
          "Content-Type": "application/json",
        },
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

  function handleLogout() {
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setError("");
    setSuccess("");
    setMode("login");
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

          <button className="button button-outline" onClick={handleLogout}>
            Sair
          </button>
        </header>

        <section className="welcome-section">
          <p className="eyebrow">ÁREA DO CLIENTE</p>
          <h1>Bem-vindo, {user.name.split(" ")[0]}.</h1>
          <p className="welcome-description">
            Sua área financeira está pronta para o próximo passo.
          </p>
        </section>

        <section className="dashboard-grid" aria-label="Resumo da conta">
          <article className="info-card">
            <div className="card-icon">01</div>
            <h2>Simular crédito</h2>
            <p>
              Em breve, você poderá escolher uma modalidade, informar o valor
              desejado e consultar as condições estimadas.
            </p>
            <span className="status-label">Próxima etapa</span>
          </article>

          <article className="info-card">
            <div className="card-icon">02</div>
            <h2>Histórico</h2>
            <p>
              Consulte suas simulações salvas e compare valores, parcelas
              e juros em um só lugar.
            </p>
            <span className="status-label">Próxima etapa</span>
          </article>

          <article className="info-card account-card">
            <div className="card-icon">03</div>
            <h2>Sua conta</h2>
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
          </article>
        </section>

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

        <footer className="form-footer">
          Projeto de portfólio · FinanSys
        </footer>
      </section>
    </main>
  );
}