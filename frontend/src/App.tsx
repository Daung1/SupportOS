import { useEffect, useState } from 'react'

function App() {
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/health')
        const data = await response.json()
        setMessage(`✅ Backend is running! Status: ${data.status}`)
      } catch (error) {
        setMessage('❌ Cannot connect to backend')
      } finally {
        setLoading(false)
      }
    }

    fetchHealth()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              🚀 SupportOS
            </h1>
            <p className="text-xl text-gray-600 mb-8">
              AI-powered Support System
            </p>

            {/* Health Check */}
            <div className="bg-blue-50 rounded-lg p-6 mb-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">
                System Status
              </h2>
              {loading ? (
                <p className="text-gray-600">Checking backend...</p>
              ) : (
                <p className="text-gray-700">{message}</p>
              )}
            </div>

            {/* Feature List */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-800">Features</h2>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-center">
                  <span className="text-green-500 mr-3">✓</span>
                  AI-powered ticket suggestions
                </li>
                <li className="flex items-center">
                  <span className="text-green-500 mr-3">✓</span>
                  Knowledge base integration
                </li>
                <li className="flex items-center">
                  <span className="text-green-500 mr-3">✓</span>
                  Real-time processing
                </li>
                <li className="flex items-center">
                  <span className="text-green-500 mr-3">✓</span>
                  Safety verification
                </li>
              </ul>
            </div>

            {/* Getting Started */}
            <div className="mt-8 p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>Next Step:</strong> Start building your dashboard by modifying{' '}
                <code className="bg-gray-200 px-2 py-1 rounded">src/App.tsx</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
