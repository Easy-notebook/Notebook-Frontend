// src/components/UI/ErrorAlert.jsx
import React from 'react'
import { XCircle } from 'lucide-react'

const ErrorAlert = ({ message, onClose }) => {
  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-red-50 text-red-500 rounded-lg shadow-lg p-4">
      <div className="flex items-start gap-2">
        <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-medium">错误</h4>
          <p className="text-sm mt-1">{message}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-100 rounded"
          >
            <XCircle size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

export default ErrorAlert