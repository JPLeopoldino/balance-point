/**
 * In-page screen title (doc 08 §8.8). The app has no top bar — each screen owns
 * its heading, so the title scrolls with the content instead of eating a fixed
 * 56px band on the phones where vertical space is tightest.
 *
 * The action sits on the title's line, never stretched full-width underneath it:
 * a full-bleed primary button reads as the loudest thing on the screen, which
 * the "add" action is not.
 */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight md:text-3xl">
          {title}
        </h1>
        {children ? (
          <div className="flex shrink-0 items-center gap-2">{children}</div>
        ) : null}
      </div>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </header>
  );
}
