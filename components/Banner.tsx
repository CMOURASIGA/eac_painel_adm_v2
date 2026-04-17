
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
    <div className="relative blue-gradient rounded-[2.5rem] overflow-hidden p-10 md:p-16 text-white shadow-2xl shadow-blue-900/20">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/5 rounded-full -mr-32 -mt-32 blur-[100px]"></div>
      <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-blue-400/10 rounded-full -ml-16 -mb-16 blur-[60px]"></div>
      
      <div className="relative z-10 max-w-3xl">
        <div className="inline-flex items-center space-x-2 bg-white/10 px-4 py-1.5 rounded-full backdrop-blur-md border border-white/20 mb-6">
          <div className="w-2 h-2 bg-blue-300 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">Sistema Certificado EAC</span>
        </div>
        
        <h2 className="text-4xl md:text-5xl font-black mb-6 tracking-tight leading-tight">{title}</h2>
        <p className="text-blue-100 text-lg md:text-xl mb-10 leading-relaxed font-medium opacity-90 max-w-2xl">
          {subtitle}
        </p>
        
        <div className="flex flex-wrap gap-5">
          {onPrimaryAction && (
            <button 
              onClick={onPrimaryAction}
              className="bg-white text-blue-900 px-10 py-4 rounded-2xl font-black shadow-xl hover:bg-blue-50 transition-all flex items-center transform hover:-translate-y-1 active:translate-y-0 text-xs md:text-sm tracking-widest"
            >
              <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              {primaryLabel}
            </button>
          )}
          {onSecondaryAction && (
            <button 
              onClick={onSecondaryAction}
              className="bg-blue-900/40 text-white border-2 border-white/20 px-8 py-4 rounded-2xl font-black hover:bg-white/10 transition-all backdrop-blur-sm text-xs md:text-sm tracking-widest"
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
