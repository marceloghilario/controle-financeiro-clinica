import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import PatientsPage from "./pages/PatientsPage";
import HealthPlansPage from "./pages/HealthPlansPage";
import SpecialtiesPage from "./pages/SpecialtiesPage";
import PricesPage from "./pages/PricesPage";
import WeeklyPlanPage from "./pages/WeeklyPlanPage";
import AbsencesPage from "./pages/AbsencesPage";
import ReportsPage from "./pages/ReportsPage";
import InvoicesPage from "./pages/InvoicesPage";

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
              { to: "/faltas", label: "Faltas" },
              { to: "/relatorios", label: "Relatórios" },
              { to: "/notas-fiscais", label: "Notas fiscais" },
              { to: "/planos-de-saude", label: "Planos de saúde" },
              { to: "/especialidades", label: "Especialidades" },
              { to: "/precos", label: "Preços" },
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
          <Route path="/faltas" element={<AbsencesPage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/notas-fiscais" element={<InvoicesPage />} />
          <Route path="/planos-de-saude" element={<HealthPlansPage />} />
          <Route path="/especialidades" element={<SpecialtiesPage />} />
          <Route path="/precos" element={<PricesPage />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
