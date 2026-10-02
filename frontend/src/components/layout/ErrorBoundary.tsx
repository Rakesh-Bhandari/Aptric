import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { ArrowLeft, Home, RotateCcw } from 'lucide-react';
import { AptricMark } from '@/components/brand/AptricMark';
import { Button } from '@/components/ui/button';

const isChunkError = (error: unknown) =>
  error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);

/** Centred page for errors and dead ends: a large faded mark behind a short message. */
const SystemState = ({ eyebrow, title, message, actions, alert }: {
  eyebrow?: string; title: string; message: string; actions: ReactNode; alert?: boolean;
}) => (
  <div role={alert ? 'alert' : undefined} className="mx-auto flex max-w-md flex-col items-center gap-5 px-6 py-16 text-center sm:py-24">
    <div className="relative grid place-items-center" aria-hidden>
      <span className="absolute size-40 rounded-full bg-primary-soft/70 blur-2xl dark:bg-primary-soft/40" />
      <AptricMark className="relative h-28 opacity-25 dark:opacity-35" />
      {eyebrow && (
        <span className="absolute -bottom-2 rounded-full bg-navy px-3 py-1 font-display text-sm font-extrabold tracking-widest text-navy-foreground shadow-md">
          {eyebrow}
        </span>
      )}
    </div>
    <div className="space-y-2">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-heading sm:text-3xl">{title}</h1>
      <p className="text-muted-foreground">{message}</p>
    </div>
    <div className="flex flex-wrap justify-center gap-3">{actions}</div>
  </div>
);

export const CrashScreen = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => {
  // A new deploy replaces the lazy chunks the open tab knows about; reloading fixes it.
  const stale = isChunkError(error);
  return (
    <SystemState
      alert
      eyebrow={stale ? 'UPDATE' : 'OOPS'}
      title={stale ? 'A new version is available' : 'Something went wrong'}
      message={stale
        ? 'Aptric was updated while this tab was open. Reload to get the latest version.'
        : 'Sorry about that. Your progress is saved. Try again, or head back home.'}
      actions={(
        <>
          <Button asChild>
            <a href="/"><Home /> Go home</a>
          </Button>
          <Button variant="outline" onClick={stale || !onRetry ? () => window.location.reload() : onRetry}>
            <RotateCcw /> {stale ? 'Reload' : 'Try again'}
          </Button>
        </>
      )}
    />
  );
};

interface Props { children: ReactNode; resetKey?: string; fallback?: (error: unknown, reset: () => void) => ReactNode }
interface State { error: unknown }

/** Catches render errors in a subtree; resets when resetKey (e.g. the path) changes. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error, this.reset) ?? <CrashScreen error={this.state.error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

/** Router-level errorElement (loader errors, errors outside the inner boundaries). */
export const RouteError = () => {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return <CrashScreen error={error} />;
};

export const NotFound = ({ title = 'Page not found', message = 'The link may be broken, or the page may have moved.' }: {
  title?: string; message?: string;
}) => (
  <SystemState
    eyebrow="404"
    title={title}
    message={message}
    actions={(
      <>
        <Button asChild>
          <Link to="/"><Home /> Go home</Link>
        </Button>
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft /> Go back
        </Button>
      </>
    )}
  />
);
