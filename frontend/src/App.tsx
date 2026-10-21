import ErrorBoundary from './ErrorBoundary'
import CalculatorPage from './components/pages/CalculatorPage/CalculatorPage'

function App() {
  return (
    <main className="app">
      <ErrorBoundary>
        <CalculatorPage />
      </ErrorBoundary>
    </main>
  )
}

export default App
