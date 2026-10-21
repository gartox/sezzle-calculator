import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Reloads the page; tests pass a fake. */
  reload?: () => void
}

interface ErrorBoundaryState {
  failed: boolean
}

/**
 * The last line of defence: an error while rendering shows a short message
 * and a reload button instead of a blank page.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('The calculator failed to render.', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) {
      return this.props.children
    }
    const reload = this.props.reload ?? (() => window.location.reload())
    return (
      <div className={styles.fallback} role="alert">
        <p className={styles.message}>Something went wrong and the calculator stopped.</p>
        <button type="button" className={styles.reload} onClick={reload}>
          Reload
        </button>
      </div>
    )
  }
}

export default ErrorBoundary
