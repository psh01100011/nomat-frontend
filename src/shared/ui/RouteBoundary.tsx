import { Component, ErrorInfo, ReactNode, Suspense } from 'react';
import { Button } from './Button';
import styles from './route-boundary.module.css';

function RouteLoadingFallback() {
  return (
    <div className={styles.status} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <strong>화면을 불러오는 중입니다.</strong>
    </div>
  );
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Failed to load route', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className={styles.status} role="alert">
          <strong>화면을 불러오지 못했습니다.</strong>
          <p>페이지를 새로고침한 뒤 다시 시도해주세요.</p>
          <Button onClick={() => window.location.reload()}>다시 불러오기</Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function RouteBoundary({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}
