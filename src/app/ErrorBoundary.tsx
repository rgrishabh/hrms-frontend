import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../lib/logger';
import { Button } from '../components/Button';
import { ERROR_SURFACE_ATTR } from '../contract';
import './ErrorBoundary.css';

interface Props { children: ReactNode; /** A new value clears the error, e.g. the route path. */ resetKey?: string; fullPage?: boolean }
interface State { failed: boolean }

const isChunkError = (e: unknown) => e instanceof Error && /dynamically imported module|Importing a module script failed|error loading/i.test(e.message);

/** Keeps a bug in one page from taking the whole app down. Navigating away clears it. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };
  private chunk = false;

  static getDerivedStateFromError(): State { return { failed: true }; }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    this.chunk = isChunkError(error);
    logger.error('Unhandled render error', { message: error instanceof Error ? error.message : String(error), stack: info.componentStack });
    this.forceUpdate();
  }

  override componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    const chunk = this.chunk;
    return (
      <div className={`crash${this.props.fullPage ? ' crash--full' : ''}`} role="alert" {...{ [ERROR_SURFACE_ATTR]: '' }}>
        <h1>{chunk ? 'This page needs to reload' : 'Something went wrong on this page'}</h1>
        <p>{chunk ? 'A newer version may be available, or your connection dropped.' : 'The rest of the app still works. Reload, or use the menu to go elsewhere.'}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
      </div>
    );
  }
}
