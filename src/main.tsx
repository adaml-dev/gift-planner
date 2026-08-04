import { StrictMode, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', background: '#2a1a1a', color: '#ffb3b3', fontFamily: 'monospace', margin: '20px', borderRadius: '8px', border: '1px solid #ff4d4d' }}>
          <h2 style={{ color: '#ff4d4d', marginTop: 0 }}>⚠️ Błąd uruchamiania aplikacji</h2>
          <p>Wystąpił nieoczekiwany błąd w aplikacji. Prześlij poniższą treść błędu do pomocy technicznej:</p>
          <pre style={{ background: '#1a0d0d', padding: '15px', borderRadius: '4px', overflowX: 'auto', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
            {this.state.error?.stack || this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => {
              localStorage.clear();
              sessionStorage.clear();
              window.location.reload();
            }} 
            style={{ padding: '8px 16px', background: '#ff4d4d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Wyczyść pamięć i odśwież
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
