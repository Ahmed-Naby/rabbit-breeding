import { cn } from "@/lib/utils";
import { EmptyNestArt } from "@/components/illustrations";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="space-y-1">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
          {/* Accent rule on the inline-start edge — one repeated mark that ties
              every board's header to the brand colour. */}
          <span
            aria-hidden
            className="h-6 w-1.5 shrink-0 rounded-full bg-linear-to-b from-primary to-primary/40"
          />
          {title}
        </h1>
        {description ? (
          <p className="ps-4 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="animate-scale-in flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 py-14 text-center">
      {Icon ? (
        <span className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground/70">
          <Icon className="size-8" />
        </span>
      ) : (
        // No icon supplied: draw the nest instead of leaving a bare sentence
        // floating in a dashed box.
        <EmptyNestArt className="mb-2 opacity-80" />
      )}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
