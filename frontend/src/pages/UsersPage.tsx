import { useEffect, useState } from "react";
import {
  api,
  APP_KEYS,
  APP_LABELS,
  type AppKey,
  type AppUser,
  type UserRole,
  type UserStatus,
} from "../api";
import { Button, Card, Select } from "../components/Card";
import { useAuth } from "../auth";

const STATUS_LABEL: Record<UserStatus, string> = {
  pending: "Pendente",
  active: "Ativo",
  revoked: "Revogado",
};

const STATUS_BADGE: Record<UserStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  active: "bg-emerald-100 text-emerald-800 border-emerald-300",
  revoked: "bg-red-100 text-red-800 border-red-300",
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      const list = await api.get<AppUser[]>("/api/users");
      setUsers(list);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function update(
    id: number,
    patch: { role?: UserRole; status?: UserStatus; permissions?: string[] },
  ) {
    setBusyId(id);
    try {
      const u = await api.patch<AppUser>(`/api/users/${id}`, patch);
      setUsers((prev) => prev.map((x) => (x.id === id ? u : x)));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  function toggleApp(u: AppUser, app: AppKey, enabled: boolean) {
    // Lista atual a partir do que o backend já retorna (apps respeitando role).
    // Para admin não faz sentido editar (sempre tem todos), mas mantemos o input desabilitado.
    const current = new Set<AppKey>(
      (u.permissions ?? (APP_KEYS as AppKey[])) as AppKey[],
    );
    if (enabled) current.add(app);
    else current.delete(app);
    update(u.id, { permissions: APP_KEYS.filter((k) => current.has(k)) });
  }

  async function remove(id: number) {
    if (!confirm("Excluir este usuário? Ele perderá o acesso imediatamente.")) return;
    setBusyId(id);
    try {
      await api.del(`/api/users/${id}`);
      setUsers((prev) => prev.filter((x) => x.id !== id));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <Card title="Usuários">
        <p className="text-sm text-slate-500">Carregando…</p>
      </Card>
    );
  }

  const pendingList = users.filter((u) => u.status === "pending");
  const activeList = users.filter((u) => u.status === "active");
  const revokedList = users.filter((u) => u.status === "revoked");

  function row(u: AppUser) {
    const isMe = me?.id === u.id;
    return (
      <li key={u.id} className="py-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[12rem]">
          <div className="text-sm font-medium text-slate-900">
            {u.name}{" "}
            {isMe && (
              <span className="text-xs text-slate-500 font-normal">(você)</span>
            )}
          </div>
          <div className="text-xs text-slate-500">{u.email}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            {u.has_password ? "senha cadastrada" : "sem senha"}
            {" · "}
            criado em {new Date(u.created_at).toLocaleDateString("pt-BR")}
          </div>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${
            STATUS_BADGE[u.status]
          }`}
        >
          {STATUS_LABEL[u.status]}
        </span>
        <Select
          value={u.role}
          disabled={busyId === u.id || isMe}
          onChange={(e) => update(u.id, { role: e.target.value as UserRole })}
        >
          <option value="user">Usuário</option>
          <option value="admin">Administrador</option>
        </Select>
        <div className="flex flex-col gap-1 text-xs text-slate-700 min-w-[10rem]">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            Acessos
          </span>
          {APP_KEYS.map((app) => {
            const has = u.apps.includes(app);
            return (
              <label
                key={app}
                className={`inline-flex items-center gap-1.5 ${
                  u.role === "admin" ? "text-slate-500" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={has}
                  disabled={busyId === u.id || u.role === "admin"}
                  onChange={(e) => toggleApp(u, app, e.target.checked)}
                />
                {APP_LABELS[app]}
              </label>
            );
          })}
          {u.role === "admin" && (
            <span className="text-[11px] text-slate-400">
              Admin acessa tudo.
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {u.status !== "active" && (
            <Button
              variant="primary"
              disabled={busyId === u.id}
              onClick={() => update(u.id, { status: "active" })}
            >
              Aprovar/Ativar
            </Button>
          )}
          {u.status !== "revoked" && !isMe && (
            <Button
              variant="secondary"
              disabled={busyId === u.id}
              onClick={() => update(u.id, { status: "revoked" })}
            >
              Revogar
            </Button>
          )}
          {!isMe && (
            <Button
              variant="danger"
              disabled={busyId === u.id}
              onClick={() => remove(u.id)}
            >
              Excluir
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title="Usuários"
        subtitle="Aprove novos cadastros e gerencie permissões."
      >
        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        {pendingList.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-amber-800 mb-1">
              Pendentes de aprovação ({pendingList.length})
            </h3>
            <ul className="divide-y divide-slate-200 border border-amber-300 rounded-md px-3 bg-amber-50/40">
              {pendingList.map(row)}
            </ul>
          </div>
        )}

        <h3 className="text-sm font-semibold text-slate-700 mb-1">
          Ativos ({activeList.length})
        </h3>
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-md px-3">
          {activeList.length === 0 ? (
            <li className="py-3 text-sm text-slate-500">Nenhum usuário ativo.</li>
          ) : (
            activeList.map(row)
          )}
        </ul>

        {revokedList.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-500 mb-1">
              Revogados ({revokedList.length})
            </h3>
            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-md px-3 bg-slate-50">
              {revokedList.map(row)}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
