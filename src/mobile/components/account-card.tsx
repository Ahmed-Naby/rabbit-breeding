import { useCallback, useEffect, useState } from "react";
import { LogOut, ShieldCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/i18n/locales";
import { getClientDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSession, logout, setActiveFarm, refreshFarms, type AuthSession } from "../auth";
import { SELECTABLE_PAGES } from "../nav-pages";
import { syncFetch } from "../sync/sync-manager";

type Member = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  allowedPages: string[] | null;
  isSelf: boolean;
};

/**
 * The settings page's account block: who is signed in, which farm this
 * device mirrors (switchable when the account belongs to several), sign
 * out, and — for owners — member management.
 */
export function AccountCard({ locale }: { locale: Locale }) {
  const dict = getClientDictionary(locale);
  const t = dict.mobileAuth;
  const nav = dict.nav;
  const [session, setSession] = useState<AuthSession | null>(() => getSession());

  const [members, setMembers] = useState<Member[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);

  // Inline "allowed pages" editor state — at most one member's panel open
  // at a time. draftAllPages=true means unrestricted (allowedPages: null).
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [draftAllPages, setDraftAllPages] = useState(true);
  const [draftSelected, setDraftSelected] = useState<Set<string>>(new Set());

  // Live membership refresh: an owner may have added this account to their
  // farm since login — opening settings is where that should become visible.
  useEffect(() => {
     
    void refreshFarms().then((s) => { if (s) setSession(s); });
  }, []);

  const activeFarm = session?.farms.find((f) => f.farmId === session.activeFarmId);
  const isOwner = activeFarm?.role === "owner";

  const loadMembers = useCallback(async () => {
    if (!isOwner) return;
    try {
      const data = (await syncFetch("/api/farm/members")) as { members: Member[] };
      setMembers(data.members);
    } catch {
      // Offline — member management simply stays hidden until connectivity.
    }
  }, [isOwner]);

  useEffect(() => {
    // Async fetch — every setState here lands after an await, but the
    // heuristic lint rule can't see that through the function reference.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMembers();
  }, [loadMembers]);

  if (!session) return null;

  const roleLabel = (role: string) => (role === "owner" ? t.roleOwner : t.roleWorker);

  const handleLogout = async () => {
    if (!window.confirm(t.logoutConfirm)) return;
    setBusy(true);
    await logout();
    window.location.reload();
  };

  const handleSwitchFarm = async (farmId: string | null | undefined) => {
    if (!farmId || farmId === session.activeFarmId) return;
    if (!window.confirm(t.switchFarmConfirm)) return;
    setBusy(true);
    await setActiveFarm(farmId);
    window.location.reload();
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    setBusy(true);
    try {
      await syncFetch("/api/farm/members", { method: "POST", body: JSON.stringify({ email, role: "worker" }) });
      toast.success(t.memberAddedToast);
      setNewEmail("");
      void loadMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error(message.includes("USER_NOT_FOUND") ? t.userNotFound : t.genericError);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm(t.removeMemberConfirm)) return;
    setBusy(true);
    try {
      await syncFetch("/api/farm/members", { method: "DELETE", body: JSON.stringify({ userId }) });
      toast.success(t.memberRemovedToast);
      void loadMembers();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error(message.includes("CANNOT_REMOVE_LAST_OWNER") ? t.cannotRemoveLastOwner : t.genericError);
    } finally {
      setBusy(false);
    }
  };

  const openPermissionsEditor = (m: Member) => {
    setEditingUserId(m.userId);
    setDraftAllPages(m.allowedPages === null);
    setDraftSelected(new Set(m.allowedPages ?? SELECTABLE_PAGES.map((p) => p.hash)));
  };

  const togglePage = (hash: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const handleSavePermissions = async (m: Member) => {
    setBusy(true);
    try {
      await syncFetch("/api/farm/members", {
        method: "POST",
        body: JSON.stringify({
          email: m.email,
          role: m.role,
          allowedPages: draftAllPages ? null : Array.from(draftSelected),
        }),
      });
      toast.success(t.permissionsSavedToast);
      setEditingUserId(null);
      void loadMembers();
    } catch {
      toast.error(t.genericError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t.accountHeading}</h2>
            <p className="text-sm text-muted-foreground" dir="ltr">
              {session.email}
            </p>
          </div>
          <Button type="button" variant="outline" disabled={busy} onClick={handleLogout} className="gap-2">
            <LogOut className="size-4" />
            {t.logoutButton}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">{t.farmLabel}</Label>
          {session.farms.length > 1 ? (
            <Select
              items={session.farms.map((f) => ({ value: f.farmId, label: `${f.name} (${roleLabel(f.role)})` }))}
              value={session.activeFarmId}
              onValueChange={handleSwitchFarm}
              disabled={busy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {session.farms.map((f) => (
                  <SelectItem key={f.farmId} value={f.farmId}>
                    {f.name} ({roleLabel(f.role)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm">
              {activeFarm?.name}{" "}
              <span className="text-muted-foreground">({roleLabel(activeFarm?.role ?? "worker")})</span>
            </p>
          )}
        </div>

        {isOwner && (
          <div className="space-y-3 border-t pt-4">
            <div>
              <h3 className="text-base font-semibold tracking-tight">{t.membersHeading}</h3>
              <p className="text-sm text-muted-foreground">{t.membersDescription}</p>
            </div>

            {members.length > 0 && (
              <ul className="space-y-2">
                {members.map((m) => (
                  <li key={m.userId} className="rounded-lg border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate" dir="ltr">{m.email}</span>
                        <span className="text-xs text-muted-foreground">
                          {roleLabel(m.role)}
                          {m.isSelf ? ` — ${t.youBadge}` : ""}
                        </span>
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {m.role !== "owner" && (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            className="h-7 gap-1 rounded-full px-2 text-xs text-muted-foreground hover:bg-accent"
                            onClick={() => (editingUserId === m.userId ? setEditingUserId(null) : openPermissionsEditor(m))}
                          >
                            <ShieldCheck className="size-3.5" />
                            {t.editPermissionsButton}
                          </Button>
                        )}
                        {!m.isSelf && (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            className="size-7 rounded-full p-0 hover:bg-destructive/10"
                            onClick={() => handleRemoveMember(m.userId)}
                          >
                            <X className="size-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {editingUserId === m.userId && (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        <div>
                          <p className="text-sm font-medium">
                            {t.permissionsHeading} <span dir="ltr">{m.email}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">{t.permissionsDescription}</p>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input
                            type="checkbox"
                            checked={draftAllPages}
                            onChange={(e) => setDraftAllPages(e.target.checked)}
                          />
                          {t.permissionsAllPages}
                        </label>
                        {!draftAllPages && (
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
                            {SELECTABLE_PAGES.map((p) => (
                              <label key={p.hash} className="flex items-center gap-1.5 text-xs">
                                <input
                                  type="checkbox"
                                  checked={draftSelected.has(p.hash)}
                                  onChange={() => togglePage(p.hash)}
                                />
                                {nav[p.labelKey]}
                              </label>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setEditingUserId(null)}
                          >
                            {t.permissionsCancelButton}
                          </Button>
                          <Button type="button" size="sm" disabled={busy} onClick={() => handleSavePermissions(m)}>
                            {t.permissionsSaveButton}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddMember} className="flex items-center gap-2">
              <Input
                type="email"
                dir="ltr"
                placeholder={t.addMemberEmailPlaceholder}
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !newEmail.trim()} className="gap-1.5">
                <UserPlus className="size-4" />
                {t.addMemberButton}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
