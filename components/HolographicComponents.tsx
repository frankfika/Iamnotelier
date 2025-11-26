import React from 'react';

export const Panel: React.FC<{ children: React.ReactNode; className?: string; title?: string; alert?: boolean }> = ({ children, className = '', title, alert = false }) => (
  <div className={`relative border ${alert ? 'border-[#ff003c] bg-[#ff003c]/5' : 'border-[#00f3ff] bg-[#00f3ff]/5'} p-4 backdrop-blur-sm ${className}`}>
    {/* Corner Decorations */}
    <div className={`absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 ${alert ? 'border-[#ff003c]' : 'border-[#00f3ff]'}`} />
    <div className={`absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 ${alert ? 'border-[#ff003c]' : 'border-[#00f3ff]'}`} />
    <div className={`absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 ${alert ? 'border-[#ff003c]' : 'border-[#00f3ff]'}`} />
    <div className={`absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 ${alert ? 'border-[#ff003c]' : 'border-[#00f3ff]'}`} />
    
    {title && (
      <div className={`absolute -top-3 left-4 px-2 bg-[#02040a] text-xs font-bold tracking-widest ${alert ? 'text-[#ff003c]' : 'text-[#00f3ff]'}`}>
        {title}
      </div>
    )}
    {children}
  </div>
);

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' }> = ({ children, variant = 'primary', className = '', ...props }) => {
  const baseColor = variant === 'danger' ? 'text-[#ff003c] border-[#ff003c] hover:bg-[#ff003c]/20' : 'text-[#00f3ff] border-[#00f3ff] hover:bg-[#00f3ff]/20';
  
  return (
    <button 
      className={`px-6 py-2 border font-bold uppercase tracking-widest transition-all duration-200 ${baseColor} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
