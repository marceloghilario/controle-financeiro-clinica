import { Link } from "react-router-dom";
import { type AppKey } from "../api";
import { Card } from "../components/Card";
import { useAuth } from "../auth";

const PATIENT_APP_URL: string =
  (import.meta.env.VITE_PATIENT_APP_URL as string | undefined) ||
  "https://cadastro-paciente.devinapps.com";

type AppCardData = {
  key: AppKey;
  title: string;
  description: string;
  href: string;
  external?: boolean;
  emoji: string;
};

const ALL_APPS: AppCardData[] = [
  {
    key: "financial",
    title: "Controle financeiro",
    description:
      "Plano semanal, sessões, notas fiscais e recebimentos da clínica.",
    href: "/inicio",
    emoji: "📊",
  },
  {
    key: "patient",
    title: "Cadastro de pacientes",
    description:
      "Cadastro clínico de pacientes, anamneses e dados de evolução.",
    href: PATIENT_APP_URL,
    external: true,
    emoji: "🩺",
  },
];

export default function PortalPage() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const accessible = ALL_APPS.filter((a) => user.apps.includes(a.key));

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-10">
      <div className="w-full max-w-3xl space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-semibold text-slate-900">
            Olá, {user.name.split(" ")[0]}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            Selecione o aplicativo que deseja acessar.
          </p>
        </div>

        {accessible.length === 0 ? (
          <Card title="Sem acesso a nenhum aplicativo">
            <p className="text-sm text-slate-700">
              Sua conta está ativa, mas ainda não tem acesso a nenhum
              aplicativo. Peça a um administrador para liberar pelo menos um
              acesso.
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
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {accessible.map((a) => {
              const inner = (
                <div className="flex items-start gap-4 p-5 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md hover:border-slate-300 transition h-full">
                  <div className="text-3xl">{a.emoji}</div>
                  <div className="flex-1">
                    <div className="text-base font-semibold text-slate-900">
                      {a.title}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {a.description}
                    </div>
                    <div className="mt-3 inline-flex items-center text-sm font-medium text-slate-900">
                      Abrir
                      <span className="ml-1">→</span>
                    </div>
                  </div>
                </div>
              );
              return a.external ? (
                <a
                  key={a.key}
                  href={a.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {inner}
                </a>
              ) : (
                <Link key={a.key} to={a.href}>
                  {inner}
                </Link>
              );
            })}
          </div>
        )}

        {user.apps.length > 0 && user.apps.length < 2 && (
          <p className="text-center text-xs text-slate-500">
            Precisa acessar outro aplicativo? Peça ao administrador.
          </p>
        )}
      </div>
    </div>
  );
}
