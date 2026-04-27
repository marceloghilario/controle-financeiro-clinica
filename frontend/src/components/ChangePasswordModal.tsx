import { useState } from "react";
import { api, type AppUser } from "../api";
import { Button, Input, Label } from "./Card";

export default function ChangePasswordModal({
  user,
  onClose,
}: {
  user: AppUser;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não conferem.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/auth/change-password", {
        current_password: user.has_password ? currentPassword : null,
        new_password: newPassword,
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Alterar senha</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 text-sm"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700">
              Senha atualizada com sucesso.
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Fechar</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {user.has_password && (
              <div className="flex flex-col gap-1">
                <Label>Senha atual</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label>Nova senha (mín. 6 caracteres)</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Confirmar nova senha</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
