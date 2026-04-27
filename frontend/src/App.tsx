import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PatientsPage from "./pages/PatientsPage";
import HealthPlansPage from "./pages/HealthPlansPage";
import SpecialtiesPage from "./pages/SpecialtiesPage";
import WeeklyPlanPage from "./pages/WeeklyPlanPage";
import SessionsPage from "./pages/SessionsPage";
import InvoicesPage from "./pages/InvoicesPage";
import ReceiptsPage from "./pages/ReceiptsPage";
import LoginPage from "./pages/LoginPage";
import UsersPage from "./pages/UsersPage";
import { useAuth } from "./auth";
import { Card } from "./components/Card";

function App() {
  const { user, loading, pendingUser, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-sm text-slate-500">Carregando…</div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // Defesa em profundidade: se for pending, redireciona pro login que mostra a mensagem
  if (user.status !== "active") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <Card title="Acesso pendente" className="max-w-md w-full">
          <p className="text-sm text-slate-700">
            Sua conta {user.email} está com status{" "}
            <span className="font-medium">{user.status}</span>. Aguarde a
            aprovação de um administrador.
          </p>
          <div className="mt-3">
            <button
              type="button"
              className="text-sm text-slate-700 hover:underline"
              onClick={logout}
            >
              Sair
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // Marca o aviso para silenciar o warning do TS sobre pendingUser não-utilizado em algumas builds
  void pendingUser;

  const links: { to: string; label: string; end?: boolean }[] = [
    { to: "/", label: "Início", end: true },
    { to: "/pacientes", label: "Pacientes" },
    { to: "/plano-semanal", label: "Plano semanal" },
    { to: "/sessao", label: "Sessão" },
    { to: "/notas-fiscais", label: "Notas fiscais" },
    { to: "/recebimentos", label: "Recebimentos" },
    { to: "/planos-de-saude", label: "Planos de saúde" },
    { to: "/especialidades", label: "Especialidades" },
  ];
  if (user.role === "admin") {
    links.push({ to: "/usuarios", label: "Usuários" });
  }

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-slate-200">
        <div className="mx-auto max-w-7xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              Controle Financeiro · Clínica Multidisciplinar
            </h1>
            <p className="text-xs text-slate-500">
              Plano semanal, faltas e cálculo mensal por paciente e plano de saúde
            </p>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span title={user.email}>
              {user.name}
              {user.role === "admin" && (
                <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-900 text-white text-[10px] uppercase tracking-wide">
                  admin
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-slate-600 hover:text-slate-900 hover:underline"
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/pacientes" element={<PatientsPage />} />
          <Route path="/plano-semanal" element={<WeeklyPlanPage />} />
          <Route path="/sessao" element={<SessionsPage />} />
          <Route path="/faltas" element={<SessionsPage />} />
          <Route path="/relatorios" element={<SessionsPage />} />
          <Route path="/notas-fiscais" element={<InvoicesPage />} />
          <Route path="/recebimentos" element={<ReceiptsPage />} />
          <Route path="/planos-de-saude" element={<HealthPlansPage />} />
          <Route path="/especialidades" element={<SpecialtiesPage />} />
          <Route path="/precos" element={<HealthPlansPage />} />
          {user.role === "admin" && (
            <Route path="/usuarios" element={<UsersPage />} />
          )}
        </Routes>
      </main>
    </div>
  );
}

export default App;
