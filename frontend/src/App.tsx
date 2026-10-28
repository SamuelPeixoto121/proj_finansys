import { useEffect, useState, useRef } from "react";
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

interface AdminRateRange {
  id: number;
  minTerm: number;
  maxTerm: number;
  monthlyRatePercent: number;
  active: boolean;
}

interface AdminRatesResponse {
  modality: {
    code: string;
    name: string;
    limits: { minTerm: number; maxTerm: number };
  };
  rateRanges: AdminRateRange[];
}

type AdminTab = "modalities" | "users" | "metrics" | "audit";

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  createdAt: string;
  simulationCount: number;
}

interface AdminUsersResponse {
  users: AdminUser[];
  pagination: PaginationInfo;
}

interface AdminMetrics {
  users: { total: number; admins: number };
  simulations: {
    total: number;
    last7Days: number;
    last30Days: number;
    totalRequestedAmount: number;
  };
  modalities: { total: number; active: number };
  rateRanges: { total: number; active: number };
  simulationsByModality: { code: string; name: string; simulations: number }[];
  generatedAt: string;
}

interface AuditLogEntry {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  metadata: unknown;
  createdAt: string;
  user: { id: number; name: string | null; email: string | null } | null;
}

interface AuditLogsResponse {
  auditLogs: AuditLogEntry[];
  pagination: PaginationInfo;
}

type AuthMode = "login" | "register";
type DashboardView = "simulator" | "history" | "account" | "admin";

const TOKEN_KEY = "finansys_access_token";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 2,
});

const rateFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
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

const ADMIN_PAGE_SIZE = 10;

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "modalities", label: "Modalidades" },
  { id: "users", label: "Usuários" },
  { id: "metrics", label: "Métricas" },
  { id: "audit", label: "Auditoria" },
];

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Criação",
  UPDATE: "Edição",
  ACTIVATE: "Ativação",
  DEACTIVATE: "Desativação",
};

const AUDIT_ENTITY_LABELS: Record<string, string> = {
  CREDIT_MODALITY: "Modalidade",
  INTEREST_RATE_RANGE: "Faixa de juros",
};

function describeMetadata(metadata: unknown): string {
  if (metadata === null || metadata === undefined) return "—";
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return String(metadata);
  }

  const entries = Object.entries(metadata as Record<string, unknown>);
  if (entries.length === 0) return "—";

  return entries
    .map(([key, value]) =>
      `${key}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`,
    )
    .join(" · ");
}

function Pager({
  pagination,
  singular,
  plural,
  disabled,
  onChange,
}: {
  pagination: PaginationInfo | null;
  singular: string;
  plural: string;
  disabled: boolean;
  onChange: (page: number) => void;
}) {
  if (!pagination) return null;

  const { page, totalPages, total } = pagination;
  const summary =
    total === 0
      ? `Nenhum ${singular}`
      : `Página ${page} de ${totalPages} · ${total} ${total === 1 ? singular : plural}`;

  return (
    <div className="admin-pager">
      <span>{summary}</span>
      <div className="admin-row-actions">
        <button className="secondary-button" type="button" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>Anterior</button>
        <button className="secondary-button" type="button" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>Próxima</button>
      </div>
    </div>
  );
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
  const [adminModalities, setAdminModalities] = useState<Array<{
    id: number; code: string; name: string; description: string | null;
    limits: { minAmount: number; maxAmount: number; minTerm: number; maxTerm: number };
    active: boolean; rateRangeCount: number;
  }>>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminEditingCode, setAdminEditingCode] = useState<string | null>(null);
  const [adminCode, setAdminCode] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminDescription, setAdminDescription] = useState("");
  const [adminMinAmount, setAdminMinAmount] = useState("500");
  const [adminMaxAmount, setAdminMaxAmount] = useState("50000");
  const [adminMinTerm, setAdminMinTerm] = useState("3");
  const [adminMaxTerm, setAdminMaxTerm] = useState("48");
  const [ratesCode, setRatesCode] = useState<string | null>(null);
  const [ratesData, setRatesData] = useState<AdminRatesResponse | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [rateError, setRateError] = useState("");
  const [rateMessage, setRateMessage] = useState("");
  const [rateEditingId, setRateEditingId] = useState<number | null>(null);
  const [rateMinTerm, setRateMinTerm] = useState("");
  const [rateMaxTerm, setRateMaxTerm] = useState("");
  const [rateMonthly, setRateMonthly] = useState("");
  // Fica true quando o admin muda modalidades ou faixas; o simulador recarrega a lista ao voltar.
  const catalogStaleRef = useRef(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("modalities");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [usersPagination, setUsersPagination] = useState<PaginationInfo | null>(null);
  const [usersPage, setUsersPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");
  const usersRequestRef = useRef(0);
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState("");
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditPagination, setAuditPagination] = useState<PaginationInfo | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [auditEntity, setAuditEntity] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const auditRequestRef = useRef(0);

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
          if (response.status === 401) {
            setError("Sua sessão expirou. Entre novamente.");
          }
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

        if (historyResponse.status === 401) {
          handleSessionExpired();
          return;
        }

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

  useEffect(() => {
    if (view !== "simulator" || !user || !catalogStaleRef.current) return;

    const controller = new AbortController();

    async function refreshModalities() {
      try {
        const response = await fetch("/api/v1/modalities", {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const data: ModalitiesResponse = await response.json();
        if (controller.signal.aborted) return;

        catalogStaleRef.current = false;
        setModalities(data.modalities);
        setSelectedCode((currentCode) =>
          data.modalities.some((modality) => modality.code === currentCode)
            ? currentCode
            : (data.modalities[0]?.code ?? ""),
        );
      } catch {
        // Se falhar, a lista antiga continua na tela e uma nova tentativa acontece na próxima visita.
      }
    }

    void refreshModalities();

    return () => controller.abort();
  }, [view, user]);

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

  async function loadAdminModalities() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token || user?.role !== "ADMIN") return;
    setAdminLoading(true);
    setAdminError("");
    try {
      const response = await fetch("/api/v1/admin/modalities", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const data: { modalities: typeof adminModalities } = await response.json();
      setAdminModalities(data.modalities);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Erro ao carregar modalidades.");
    } finally {
      setAdminLoading(false);
    }
  }

  function resetAdminForm() {
    setAdminEditingCode(null);
    setAdminCode("");
    setAdminName("");
    setAdminDescription("");
    setAdminMinAmount("500");
    setAdminMaxAmount("50000");
    setAdminMinTerm("3");
    setAdminMaxTerm("48");
  }

  function editAdminModality(modality: typeof adminModalities[number]) {
    setAdminEditingCode(modality.code);
    setAdminCode(modality.code);
    setAdminName(modality.name);
    setAdminDescription(modality.description ?? "");
    setAdminMinAmount(String(modality.limits.minAmount));
    setAdminMaxAmount(String(modality.limits.maxAmount));
    setAdminMinTerm(String(modality.limits.minTerm));
    setAdminMaxTerm(String(modality.limits.maxTerm));
    setAdminMessage("");
    setAdminError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitAdminModality(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token || user?.role !== "ADMIN") return;
    setAdminError("");
    setAdminMessage("");
    const payload = {
      name: adminName,
      description: adminDescription,
      minAmount: Number(adminMinAmount),
      maxAmount: Number(adminMaxAmount),
      minTerm: Number(adminMinTerm),
      maxTerm: Number(adminMaxTerm),
    };
    if (!adminEditingCode) Object.assign(payload, { code: adminCode.trim().toUpperCase() });
    try {
      const response = await fetch(
        adminEditingCode
          ? `/api/v1/admin/modalities/${encodeURIComponent(adminEditingCode)}`
          : "/api/v1/admin/modalities",
        {
          method: adminEditingCode ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const data: { message: string } = await response.json();
      setAdminMessage(data.message);
      catalogStaleRef.current = true;
      resetAdminForm();
      await loadAdminModalities();
      if (adminEditingCode === null) {
        // A criação não cria taxas; a mensagem da API explica o próximo passo.
      }
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Não foi possível salvar a modalidade.");
    }
  }

  async function toggleAdminModality(code: string, active: boolean) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token || user?.role !== "ADMIN") return;
    setAdminError("");
    setAdminMessage("");
    try {
      const response = await fetch(
        `/api/v1/admin/modalities/${encodeURIComponent(code)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ active }),
        },
      );
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const data: { message: string } = await response.json();
      setAdminMessage(data.message);
      catalogStaleRef.current = true;
      await loadAdminModalities();
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    }
  }

  function resetRateForm() {
    setRateEditingId(null);
    setRateMinTerm("");
    setRateMaxTerm("");
    setRateMonthly("");
  }

  async function loadRateRanges(code: string) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token || user?.role !== "ADMIN") return;
    setRatesLoading(true);
    try {
      const response = await fetch(
        `/api/v1/admin/modalities/${encodeURIComponent(code)}/rates`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const data: AdminRatesResponse = await response.json();
      setRatesData(data);
    } catch (err) {
      setRateError(err instanceof Error ? err.message : "Erro ao carregar as faixas de juros.");
    } finally {
      setRatesLoading(false);
    }
  }

  async function openRateRanges(code: string) {
    setRatesCode(code);
    setRatesData(null);
    setRateError("");
    setRateMessage("");
    resetRateForm();
    await loadRateRanges(code);
  }

  function closeRateRanges() {
    setRatesCode(null);
    setRatesData(null);
    setRateError("");
    setRateMessage("");
    resetRateForm();
  }

  function editRateRange(range: AdminRateRange) {
    setRateEditingId(range.id);
    setRateMinTerm(String(range.minTerm));
    setRateMaxTerm(String(range.maxTerm));
    setRateMonthly(String(range.monthlyRatePercent));
    setRateError("");
    setRateMessage("");
  }

  async function submitRateRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token || user?.role !== "ADMIN" || !ratesCode) return;
    setRateError("");
    setRateMessage("");
    const payload = {
      minTerm: Number(rateMinTerm),
      maxTerm: Number(rateMaxTerm),
      monthlyRatePercent: Number(rateMonthly),
    };
    const base = `/api/v1/admin/modalities/${encodeURIComponent(ratesCode)}/rates`;
    try {
      const response = await fetch(
        rateEditingId === null ? base : `${base}/${rateEditingId}`,
        {
          method: rateEditingId === null ? "POST" : "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const data: { message: string } = await response.json();
      setRateMessage(data.message);
      catalogStaleRef.current = true;
      resetRateForm();
      await loadRateRanges(ratesCode);
      await loadAdminModalities();
    } catch (err) {
      setRateError(err instanceof Error ? err.message : "Não foi possível salvar a faixa de juros.");
    }
  }

  async function toggleRateRange(range: AdminRateRange) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token || user?.role !== "ADMIN" || !ratesCode) return;
    setRateError("");
    setRateMessage("");
    try {
      const response = await fetch(
        `/api/v1/admin/modalities/${encodeURIComponent(ratesCode)}/rates/${range.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ active: !range.active }),
        },
      );
      if (response.status === 401) {
        handleSessionExpired();
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const data: { message: string } = await response.json();
      setRateMessage(data.message);
      catalogStaleRef.current = true;
      await loadRateRanges(ratesCode);
      await loadAdminModalities();
    } catch (err) {
      setRateError(err instanceof Error ? err.message : "Não foi possível alterar o status da faixa.");
    }
  }

  useEffect(() => {
    if (view === "admin" && user?.role === "ADMIN") void loadAdminModalities();
  }, [view, user?.role]);
  async function adminGet<T>(path: string): Promise<T | null> {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token || user?.role !== "ADMIN") return null;

    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) {
      handleSessionExpired();
      return null;
    }

    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as T;
  }

  async function loadAdminUsers(page: number) {
    const requestId = ++usersRequestRef.current;
    setUsersLoading(true);
    setUsersError("");

    try {
      const data = await adminGet<AdminUsersResponse>(
        `/api/v1/admin/users?page=${page}&pageSize=${ADMIN_PAGE_SIZE}`,
      );
      if (!data || requestId !== usersRequestRef.current) return;
      setAdminUsers(data.users);
      setUsersPagination(data.pagination);
    } catch (err) {
      if (requestId === usersRequestRef.current) {
        setUsersError(err instanceof Error ? err.message : "Não foi possível carregar os usuários.");
      }
    } finally {
      if (requestId === usersRequestRef.current) setUsersLoading(false);
    }
  }

  async function loadAdminMetrics() {
    setMetricsLoading(true);
    setMetricsError("");

    try {
      const data = await adminGet<AdminMetrics>("/api/v1/admin/metrics");
      if (data) setAdminMetrics(data);
    } catch (err) {
      setMetricsError(err instanceof Error ? err.message : "Não foi possível carregar as métricas.");
    } finally {
      setMetricsLoading(false);
    }
  }

  async function loadAuditLogs(page: number, entity: string, action: string) {
    const requestId = ++auditRequestRef.current;
    setAuditLoading(true);
    setAuditError("");

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(ADMIN_PAGE_SIZE),
    });
    if (entity) params.set("entity", entity);
    if (action) params.set("action", action);

    try {
      const data = await adminGet<AuditLogsResponse>(
        `/api/v1/admin/audit-logs?${params.toString()}`,
      );
      if (!data || requestId !== auditRequestRef.current) return;
      setAuditLogs(data.auditLogs);
      setAuditPagination(data.pagination);
    } catch (err) {
      if (requestId === auditRequestRef.current) {
        setAuditError(err instanceof Error ? err.message : "Não foi possível consultar a auditoria.");
      }
    } finally {
      if (requestId === auditRequestRef.current) setAuditLoading(false);
    }
  }

  useEffect(() => {
    if (view === "admin" && adminTab === "users" && user?.role === "ADMIN") {
      void loadAdminUsers(usersPage);
    }
  }, [view, adminTab, usersPage]);

  useEffect(() => {
    if (view === "admin" && adminTab === "metrics" && user?.role === "ADMIN") {
      void loadAdminMetrics();
    }
  }, [view, adminTab]);

  useEffect(() => {
    if (view === "admin" && adminTab === "audit" && user?.role === "ADMIN") {
      void loadAuditLogs(auditPage, auditEntity, auditAction);
    }
  }, [view, adminTab, auditPage, auditEntity, auditAction]);

  function handleSessionExpired() {
    handleLogout();
    setError("Sua sessão expirou. Entre novamente.");
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
    setAdminTab("modalities");
    setAdminUsers([]);
    setUsersPagination(null);
    setUsersPage(1);
    setAdminMetrics(null);
    setAuditLogs([]);
    setAuditPagination(null);
    setAuditPage(1);
    setAuditEntity("");
    setAuditAction("");
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
          {user.role === "ADMIN" && (
            <button
              className={`nav-tab ${view === "admin" ? "active" : ""}`}
              onClick={() => setView("admin")}
            >
              Administração
            </button>
          )}
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

        {view === "admin" && user.role === "ADMIN" && (
          <nav className="dashboard-nav admin-subnav" aria-label="Seções da administração">
            {ADMIN_TABS.map((tab) => (
              <button key={tab.id} type="button" className={`nav-tab ${adminTab === tab.id ? "active" : ""}`} onClick={() => setAdminTab(tab.id)}>{tab.label}</button>
            ))}
          </nav>
        )}

        {view === "admin" && user.role === "ADMIN" && adminTab === "users" && (
          <section className="info-card admin-modalities-panel">
            <p className="eyebrow">PAINEL ADMINISTRATIVO</p>
            <h2>Usuários cadastrados</h2>
            <p className="admin-help">Contas do sistema, da mais recente para a mais antiga. Senhas nunca são exibidas.</p>
            {usersError && <p className="form-message error-message" role="alert">{usersError}</p>}
            {usersLoading && adminUsers.length === 0 ? <p>Carregando usuários...</p> : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Simulações</th><th>Cadastro</th></tr></thead>
                  <tbody>
                    {adminUsers.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>{item.email}</td>
                        <td><span className={item.role === "ADMIN" ? "admin-status active" : "admin-status neutral"}>{item.role === "ADMIN" ? "Administrador" : "Cliente"}</span></td>
                        <td>{item.simulationCount}</td>
                        <td>{formatDate(item.createdAt)}</td>
                      </tr>
                    ))}
                    {!usersLoading && !usersError && adminUsers.length === 0 && <tr><td colSpan={5}>Nenhum usuário encontrado.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            <Pager pagination={usersPagination} singular="usuário" plural="usuários" disabled={usersLoading} onChange={setUsersPage} />
          </section>
        )}

        {view === "admin" && user.role === "ADMIN" && adminTab === "metrics" && (
          <section className="info-card admin-modalities-panel">
            <p className="eyebrow">PAINEL ADMINISTRATIVO</p>
            <div className="admin-table-heading">
              <h2>Métricas do sistema</h2>
              <button className="secondary-button" type="button" disabled={metricsLoading} onClick={() => void loadAdminMetrics()}>Atualizar</button>
            </div>
            {metricsError && <p className="form-message error-message" role="alert">{metricsError}</p>}
            {!adminMetrics && metricsLoading && <p>Carregando métricas...</p>}
            {adminMetrics && (
              <>
                <div className="admin-metrics-grid">
                  <article className="admin-metric-card">
                    <span>Usuários</span>
                    <strong>{adminMetrics.users.total}</strong>
                    <small>{adminMetrics.users.admins} administrador(es)</small>
                  </article>
                  <article className="admin-metric-card">
                    <span>Simulações</span>
                    <strong>{adminMetrics.simulations.total}</strong>
                    <small>{adminMetrics.simulations.last7Days} nos últimos 7 dias · {adminMetrics.simulations.last30Days} nos últimos 30</small>
                  </article>
                  <article className="admin-metric-card">
                    <span>Valor simulado</span>
                    <strong>{formatCurrency(adminMetrics.simulations.totalRequestedAmount)}</strong>
                    <small>soma dos valores solicitados</small>
                  </article>
                  <article className="admin-metric-card">
                    <span>Modalidades</span>
                    <strong>{adminMetrics.modalities.active}</strong>
                    <small>ativas, de {adminMetrics.modalities.total} cadastradas</small>
                  </article>
                  <article className="admin-metric-card">
                    <span>Faixas de juros</span>
                    <strong>{adminMetrics.rateRanges.active}</strong>
                    <small>ativas, de {adminMetrics.rateRanges.total} cadastradas</small>
                  </article>
                </div>

                <h3>Simulações por modalidade</h3>
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead><tr><th>Modalidade</th><th>Simulações</th><th>Proporção</th></tr></thead>
                    <tbody>
                      {adminMetrics.simulationsByModality.map((item) => {
                        const max = Math.max(...adminMetrics.simulationsByModality.map((row) => row.simulations), 0);
                        const width = max > 0 ? (item.simulations / max) * 100 : 0;
                        return (
                          <tr key={item.code}>
                            <td>{item.name}<small>{item.code}</small></td>
                            <td>{item.simulations}</td>
                            <td><div className="admin-bar" aria-hidden="true"><span style={{ width: `${width}%` }} /></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="admin-help">Atualizado em {formatDate(adminMetrics.generatedAt)}.</p>
              </>
            )}
          </section>
        )}

        {view === "admin" && user.role === "ADMIN" && adminTab === "audit" && (
          <section className="info-card admin-modalities-panel">
            <p className="eyebrow">PAINEL ADMINISTRATIVO</p>
            <h2>Histórico de auditoria</h2>
            <p className="admin-help">Ações administrativas registradas, da mais recente para a mais antiga.</p>
            <div className="admin-filters">
              <label>Item
                <select value={auditEntity} onChange={(event) => { setAuditEntity(event.target.value); setAuditPage(1); }}>
                  <option value="">Todos</option>
                  {Object.entries(AUDIT_ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>Ação
                <select value={auditAction} onChange={(event) => { setAuditAction(event.target.value); setAuditPage(1); }}>
                  <option value="">Todas</option>
                  {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            {auditError && <p className="form-message error-message" role="alert">{auditError}</p>}
            {auditLoading && auditLogs.length === 0 ? <p>Carregando registros...</p> : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Data e hora</th><th>Ação</th><th>Item</th><th>Responsável</th><th>Detalhes</th></tr></thead>
                  <tbody>
                    {auditLogs.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.createdAt)}</td>
                        <td>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</td>
                        <td>{AUDIT_ENTITY_LABELS[entry.entity] ?? entry.entity}{entry.entityId !== null ? ` #${entry.entityId}` : ""}</td>
                        <td>{entry.user ? <>{entry.user.name}<small>{entry.user.email}</small></> : "—"}</td>
                        <td><code className="admin-metadata">{describeMetadata(entry.metadata)}</code></td>
                      </tr>
                    ))}
                    {!auditLoading && !auditError && auditLogs.length === 0 && <tr><td colSpan={5}>Nenhum registro encontrado.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            <Pager pagination={auditPagination} singular="registro" plural="registros" disabled={auditLoading} onChange={setAuditPage} />
          </section>
        )}

        {view === "admin" && user.role === "ADMIN" && adminTab === "modalities" && (
          <section className="info-card admin-modalities-panel">
            <p className="eyebrow">PAINEL ADMINISTRATIVO</p>
            <h2>Gerenciar modalidades de crédito</h2>
            <p className="admin-help">
              Criar uma modalidade não configura automaticamente as taxas de juros. Ela só poderá ser simulada depois que suas faixas de juros forem cadastradas.
            </p>
            {adminError && <p className="form-message error-message" role="alert">{adminError}</p>}
            {adminMessage && <p className="form-message success-message" role="status">{adminMessage}</p>}

            <form className="admin-modality-form" onSubmit={submitAdminModality}>
              <h3>{adminEditingCode ? `Editar ${adminEditingCode}` : "Nova modalidade"}</h3>
              {!adminEditingCode && (
                <label>
                  Código único
                  <input value={adminCode} onChange={(event) => setAdminCode(event.target.value.toUpperCase())}
                    placeholder="EX: CONSIGNADO" pattern="[A-Za-z][A-Za-z0-9_]{1,49}" required maxLength={50} />
                </label>
              )}
              <label>
                Nome
                <input value={adminName} onChange={(event) => setAdminName(event.target.value)} required minLength={2} maxLength={120} />
              </label>
              <label>
                Descrição
                <textarea value={adminDescription} onChange={(event) => setAdminDescription(event.target.value)} maxLength={2000} rows={3} />
              </label>
              <div className="admin-form-grid">
                <label>Valor mínimo (R$)<input type="number" min="0.01" step="0.01" value={adminMinAmount} onChange={(event) => setAdminMinAmount(event.target.value)} required /></label>
                <label>Valor máximo (R$)<input type="number" min="0.01" step="0.01" value={adminMaxAmount} onChange={(event) => setAdminMaxAmount(event.target.value)} required /></label>
                <label>Prazo mínimo (meses)<input type="number" min="1" step="1" value={adminMinTerm} onChange={(event) => setAdminMinTerm(event.target.value)} required /></label>
                <label>Prazo máximo (meses)<input type="number" min="1" step="1" value={adminMaxTerm} onChange={(event) => setAdminMaxTerm(event.target.value)} required /></label>
              </div>
              <div className="admin-form-actions">
                <button className="primary-button" type="submit">{adminEditingCode ? "Salvar alterações" : "Criar modalidade"}</button>
                {adminEditingCode && <button className="secondary-button" type="button" onClick={resetAdminForm}>Cancelar edição</button>}
              </div>
            </form>

            <div className="admin-table-heading">
              <h3>Modalidades cadastradas</h3>
              <button className="secondary-button" type="button" onClick={() => void loadAdminModalities()}>Atualizar lista</button>
            </div>
            {adminLoading ? <p>Carregando modalidades...</p> : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th>Modalidade</th><th>Limites</th><th>Taxas</th><th>Status</th><th>Ações</th></tr></thead>
                  <tbody>
                    {adminModalities.map((modality) => (
                      <tr key={modality.id}>
                        <td><strong>{modality.name}</strong><small>{modality.code}</small></td>
                        <td>{formatCurrency(modality.limits.minAmount)} – {formatCurrency(modality.limits.maxAmount)}<small>{modality.limits.minTerm}–{modality.limits.maxTerm} meses</small></td>
                        <td>{modality.rateRangeCount} faixa(s)</td>
                        <td><span className={modality.active ? "admin-status active" : "admin-status inactive"}>{modality.active ? "Ativa" : "Inativa"}</span></td>
                        <td><div className="admin-row-actions">
                          <button className="secondary-button" type="button" onClick={() => editAdminModality(modality)}>Editar</button>
                          <button className="secondary-button" type="button" onClick={() => void openRateRanges(modality.code)}>Faixas de juros</button>
                          <button className="secondary-button" type="button" onClick={() => void toggleAdminModality(modality.code, !modality.active)}>{modality.active ? "Desativar" : "Ativar"}</button>
                        </div></td>
                      </tr>
                    ))}
                    {adminModalities.length === 0 && <tr><td colSpan={5}>Nenhuma modalidade cadastrada.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {ratesCode && (
              <div className="admin-rates-panel">
                <div className="admin-table-heading">
                  <h3>Faixas de juros{ratesData ? ` – ${ratesData.modality.name}` : ""}</h3>
                  <button className="secondary-button" type="button" onClick={closeRateRanges}>Fechar</button>
                </div>
                {ratesData && (
                  <p className="admin-help">
                    Prazos permitidos nesta modalidade: {ratesData.modality.limits.minTerm}–{ratesData.modality.limits.maxTerm} meses. As faixas ativas não podem se sobrepor.
                  </p>
                )}
                {rateError && <p className="form-message error-message" role="alert">{rateError}</p>}
                {rateMessage && <p className="form-message success-message" role="status">{rateMessage}</p>}

                <form className="admin-modality-form" onSubmit={submitRateRange}>
                  <h3>{rateEditingId === null ? "Nova faixa" : "Editar faixa"}</h3>
                  <div className="admin-form-grid admin-rate-grid">
                    <label>Prazo mínimo (meses)<input type="number" min={ratesData?.modality.limits.minTerm ?? 1} max={ratesData?.modality.limits.maxTerm} step="1" value={rateMinTerm} onChange={(event) => setRateMinTerm(event.target.value)} required /></label>
                    <label>Prazo máximo (meses)<input type="number" min={ratesData?.modality.limits.minTerm ?? 1} max={ratesData?.modality.limits.maxTerm} step="1" value={rateMaxTerm} onChange={(event) => setRateMaxTerm(event.target.value)} required /></label>
                    <label>Taxa mensal (% ao mês)<input type="number" min="0" max="100" step="0.0001" value={rateMonthly} onChange={(event) => setRateMonthly(event.target.value)} required /></label>
                  </div>
                  <div className="admin-form-actions">
                    <button className="primary-button" type="submit">{rateEditingId === null ? "Criar faixa" : "Salvar alterações"}</button>
                    {rateEditingId !== null && <button className="secondary-button" type="button" onClick={resetRateForm}>Cancelar edição</button>}
                  </div>
                </form>

                {ratesLoading ? <p>Carregando faixas de juros...</p> : (
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead><tr><th>Prazo</th><th>Taxa mensal</th><th>Status</th><th>Ações</th></tr></thead>
                      <tbody>
                        {ratesData?.rateRanges.map((range) => (
                          <tr key={range.id}>
                            <td>{range.minTerm}–{range.maxTerm} meses</td>
                            <td>{rateFormatter.format(range.monthlyRatePercent)}% ao mês</td>
                            <td><span className={range.active ? "admin-status active" : "admin-status inactive"}>{range.active ? "Ativa" : "Inativa"}</span></td>
                            <td><div className="admin-row-actions">
                              <button className="secondary-button" type="button" onClick={() => editRateRange(range)}>Editar</button>
                              <button className="secondary-button" type="button" onClick={() => void toggleRateRange(range)}>{range.active ? "Desativar" : "Ativar"}</button>
                            </div></td>
                          </tr>
                        ))}
                        {ratesData && ratesData.rateRanges.length === 0 && <tr><td colSpan={4}>Nenhuma faixa cadastrada. Sem faixas ativas, esta modalidade não pode ser simulada.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
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
