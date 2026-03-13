
import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  type?: 'success' | 'danger' | 'warning' | 'info' | 'gray';
}

const Badge: React.FC<BadgeProps> = ({ children, type = 'gray' }) => {
  const styles = {
    success: 'bg-green-100 text-green-700 border-green-200',
    danger: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${styles[type]}`}>
      {children}
    </span>
  );
};

export default Badge;
