import { useEffect, useRef, useState } from "react";
import { Button, Card, Input, Label } from "../components/Card";
import { useAuth } from "../auth";

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (resp: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            el: HTMLElement,
            opts: {
              theme?: string;
              size?: string;
              type?: string;
              shape?: string;
              text?: string;
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

export default function LoginPage() {
  const { config, pendingUser, loginWithPassword, registerWithPassword, loginWithGoogle } =
    useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleBtnRef = useRef<HTMLDivElement | null>(null);

  // injeta script GIS uma vez quando há client_id
  useEffect(() => {
    if (!config?.google_client_id) return;
    const SCRIPT_ID = "google-identity-services";
    if (document.getElementById(SCRIPT_ID)) {
      initGoogle();
      return;
    }
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = initGoogle;
    document.body.appendChild(s);
    function initGoogle() {
      if (!googleBtnRef.current) return;
      const g = window.google?.accounts?.id;
      if (!g || !config?.google_client_id) return;
      g.initialize({
        client_id: config.google_client_id,
        callback: async (resp) => {
          setError(null);
          setSubmitting(true);
          try {
            await loginWithGoogle(resp.credential);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSubmitting(false);
          }
        },
        auto_select: false,
      });
      g.renderButton(googleBtnRef.current, {
        theme: "outline",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        width: 320,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.google_client_id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await loginWithPassword(email.trim(), password);
      } else {
        await registerWithPassword(email.trim(), name.trim(), password);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (pendingUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <Card title="Acesso pendente" className="max-w-md w-full">
          <p className="text-sm text-slate-700">
            Olá <span className="font-medium">{pendingUser.name}</span>! Sua
            conta <span className="font-medium">{pendingUser.email}</span> foi
            criada e está aguardando aprovação de um administrador. Você
            receberá acesso assim que for liberada.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card
        title="Controle Financeiro · Clínica"
        subtitle={mode === "login" ? "Entrar" : "Criar conta (aguardará aprovação)"}
        className="max-w-md w-full"
      >
        {config?.google_enabled ? (
          <div className="flex flex-col items-center gap-2 mb-4">
            <div ref={googleBtnRef} />
            <div className="text-xs text-slate-500">ou</div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 mb-3">
            Login com Google ainda não foi configurado neste servidor.
          </p>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <div className="flex flex-col gap-1">
              <Label>Nome completo</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Senha</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <div className="mt-3 text-sm text-slate-600">
          {mode === "login" ? (
            <>
              Ainda não tem conta?{" "}
              <button
                type="button"
                className="text-slate-900 font-medium hover:underline"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                Criar conta
              </button>
            </>
          ) : (
            <>
              Já tem conta?{" "}
              <button
                type="button"
                className="text-slate-900 font-medium hover:underline"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                Fazer login
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
