import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './inrik.css'
import App from './App.jsx'

class StorefrontErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Storefront render failed:', error, errorInfo)
  }

  render() {
    if (this.state.error) {
      return (
        <main className="storefront-runtime-error">
          <h1>Storefront could not render</h1>
          <p>Reload this page. If the problem continues, report this message:</p>
          <pre>{String(this.state.error?.message || this.state.error)}</pre>
          <button type="button" onClick={() => globalThis.location.reload()}>Reload</button>
        </main>
      )
    }

    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StorefrontErrorBoundary>
      <App />
    </StorefrontErrorBoundary>
  </StrictMode>,
)
