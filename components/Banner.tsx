
import React from 'react';

interface BannerProps {
  title: string;
  subtitle: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  primaryLabel?: string;
  secondaryLabel?: string;
}

const Banner: React.FC<BannerProps> = ({ 
  title, 
  subtitle, 
  onPrimaryAction, 
  onSecondaryAction,
  primaryLabel = "INICIAR DISPARO",
  secondaryLabel = "AUDITORIA COMPLETA"
}) => {
  return (
    <div className="relative blue-gradient rounded-3xl overflow-hidden p-7 md:p-10 text-white shadow-xl shadow-blue-900/15">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/5 rounded-full -mr-32 -mt-32 blur-[100px]"></div>
      <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-blue-400/10 rounded-full -ml-16 -mb-16 blur-[60px]"></div>
      
      <div className="relative z-10 max-w-3xl">
        <div className="inline-flex items-center space-x-2 bg-white/10 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/20 mb-6">
          <div className="w-2 h-2 bg-blue-300 rounded-full animate-pulse"></div>
          <span className="text-xs font-semibold text-blue-100">Central de acompanhamento EAC</span>
        </div>
        
        <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight leading-tight">{title}</h2>
        <p className="text-blue-100 text-base md:text-lg mb-8 leading-relaxed max-w-2xl">
          {subtitle}
        </p>
        
        <div className="flex flex-wrap gap-3">
          {onPrimaryAction && (
            <button 
              onClick={onPrimaryAction}
              className="bg-white text-blue-900 px-6 py-3 rounded-xl font-semibold shadow-xl hover:bg-blue-50 transition-colors flex items-center text-sm"
            >
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              {primaryLabel}
            </button>
          )}
          {onSecondaryAction && (
            <button 
              onClick={onSecondaryAction}
              className="bg-blue-900/40 text-white border border-white/20 px-6 py-3 rounded-xl font-semibold hover:bg-white/10 transition-colors backdrop-blur-sm text-sm"
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Banner;
