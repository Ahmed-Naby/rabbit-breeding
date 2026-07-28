"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, LogOut, Warehouse } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { signOut, switchFarm } from "@/app/login/actions";
import type { Dictionary } from "@/lib/i18n/dictionaries/ar";

export type FarmOption = { farmId: string; name: string; role: string };

/**
 * Who is signed in, which farm they are looking at, and how to change either.
 *
 * The farm list comes from FarmMember, so it only ever contains farms this
 * account belongs to — switching is a cookie change, and the server re-checks
 * membership before honouring it (see switchFarm).
 */
export function AccountMenu({
  t,
  email,
  name,
  farms,
  activeFarmId,
  className,
}: {
  t: Dictionary["auth"];
  email: string;
  name: string | null;
  farms: FarmOption[];
  activeFarmId: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = farms.find((f) => f.farmId === activeFarmId);

  const onSwitch = (farmId: string) => {
    if (farmId === activeFarmId) return;
    startTransition(async () => {
      await switchFarm(farmId);
      // revalidatePath alone re-renders the tree but leaves the router's
      // client-side cache of already-visited pages holding the old farm's
      // rows; refresh() is what discards them.
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/10 px-3 py-2 text-start text-xs transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          pending && "opacity-60",
          className
        )}
      >
        <Warehouse className="size-4 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{active?.name ?? t.farmLabel}</span>
          <span className="block truncate text-[11px] text-sidebar-foreground/60">
            {name || email}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        {/* Only worth a picker when there is something to pick between. */}
        {farms.length > 1 ? (
          <>
            {/* The group wrapper is load-bearing, not decoration:
                DropdownMenuLabel is Base UI's Menu.GroupLabel, which reads a
                context only <Menu.Group> provides and throws outright without
                it — taking the whole page down with it, since the menu lives
                in the root layout and there is no error boundary above it. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {t.switchFarmLabel}
              </DropdownMenuLabel>
              {farms.map((f) => (
                <DropdownMenuItem
                  key={f.farmId}
                  onSelect={() => onSwitch(f.farmId)}
                  className="gap-2"
                >
                  <Check
                    className={cn("size-4 shrink-0", f.farmId !== activeFarmId && "opacity-0")}
                  />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {f.role === "owner" ? t.roleOwner : t.roleWorker}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}

        <DropdownMenuItem onSelect={() => startTransition(() => void signOut())} className="gap-2">
          <LogOut className="size-4 shrink-0" />
          {t.logoutButton}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
