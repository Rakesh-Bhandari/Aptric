import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const isChunkError = (error: unknown) =>
  error instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(error.message);

export const CrashScreen = ({ error, onRetry }: { error: unknown; onRetry?: () => void }) => {
  // A new deploy replaces the lazy chunks the open tab knows about; reloading fixes it.
  const stale = isChunkError(error);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger-soft-foreground">
        <AlertTriangle className="size-7" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{stale ? 'A new version is available' : 'Something went wrong'}</h1>
        <p className="text-muted-foreground">
          {stale
            ? 'Aptric was updated while this tab was open. Reload to get the latest version.'
            : "Sorry about that. Your progress is saved. Try again, or head back home."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={stale || !onRetry ? () => window.location.reload() : onRetry}>
          <RotateCcw /> {stale ? 'Reload' : 'Try again'}
        </Button>
        <Button variant="outline" asChild>
          <a href="/"><Home /> Go home</a>
        </Button>
      </div>
    </div>
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

export const NotFound = ({ title = "We can't find that page", message = 'The link may be broken, or the page may have moved.' }: {
  title?: string; message?: string;
}) => (
  <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-6 py-16 text-center">
    <p className="text-6xl font-black text-accent-text" aria-hidden>404</p>
    <div className="space-y-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">{message}</p>
    </div>
    <Button asChild>
      <Link to="/"><Home /> Back to Today</Link>
    </Button>
  </div>
);
