
import React from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[200] animate-in fade-in slide-in-from-right-10 duration-300">
      {/* Fix: Added conditional styling and icon for 'info' type */}
      <div className={`flex items-center space-x-3 px-5 py-4 rounded-2xl shadow-2xl border ${
        type === 'success' ? 'bg-white border-green-500 text-green-800' : 
        type === 'error' ? 'bg-white border-red-500 text-red-800' :
        'bg-white border-blue-500 text-blue-800'
      }`}>
        <div className={`p-1.5 rounded-full ${
          type === 'success' ? 'bg-green-500' : 
          type === 'error' ? 'bg-red-500' : 
          'bg-blue-500'
        } text-white`}>
          {type === 'success' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
          ) : type === 'error' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          )}
        </div>
        <p className="text-sm font-bold tracking-tight">{message}</p>
        <button onClick={onClose} className="ml-4 text-gray-300 hover:text-gray-500">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
    </div>
  );
};

export default Toast;
