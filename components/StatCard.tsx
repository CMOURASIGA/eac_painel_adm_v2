
import React from 'react';

interface StatCardProps {
  title: string;
  value: string;
  color: 'blue' | 'indigo' | 'green' | 'red' | 'gray';
  note?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, color, note }) => {
  const colors = {
    blue: 'border-blue-500 text-blue-700 bg-blue-50',
    indigo: 'border-indigo-500 text-indigo-700 bg-indigo-50',
    green: 'border-green-500 text-green-700 bg-green-50',
    red: 'border-red-500 text-red-700 bg-red-50',
    gray: 'border-gray-400 text-gray-700 bg-gray-50',
  };

  return (
    <div className={`bg-white p-4 rounded-2xl border-l-4 shadow-sm ${colors[color]} flex flex-col justify-between h-full min-h-[90px]`}>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1 truncate">{title}</p>
      {note && <p className="text-[9px] text-gray-500 font-semibold leading-tight mb-2">{note}</p>}
      <p className={`font-black tracking-tight leading-none break-words ${value.length > 10 ? 'text-lg' : 'text-2xl'}`}>
        {value}
      </p>
    </div>
  );
};

export default StatCard;
