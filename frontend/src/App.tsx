import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PatientsPage from "./pages/PatientsPage";
import HealthPlansPage from "./pages/HealthPlansPage";
import SpecialtiesPage from "./pages/SpecialtiesPage";
import WeeklyPlanPage from "./pages/WeeklyPlanPage";
import SessionsPage from "./pages/SessionsPage";
import InvoicesPage from "./pages/InvoicesPage";
import ReceiptsPage from "./pages/ReceiptsPage";

function App() {
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
            {[
              { to: "/", label: "Início", end: true },
              { to: "/pacientes", label: "Pacientes" },
              { to: "/plano-semanal", label: "Plano semanal" },
              { to: "/sessao", label: "Sessão" },
              { to: "/notas-fiscais", label: "Notas fiscais" },
              { to: "/recebimentos", label: "Recebimentos" },
              { to: "/planos-de-saude", label: "Planos de saúde" },
              { to: "/especialidades", label: "Especialidades" },
            ].map((l) => (
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
        </Routes>
      </main>
    </div>
  );
}

export default App;
