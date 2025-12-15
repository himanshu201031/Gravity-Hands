import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary';
  label: string;
}

export const Button: React.FC<ButtonProps> = ({ variant = 'primary', label, className = '', ...props }) => {
  const baseStyle = "px-6 py-2 rounded-none uppercase tracking-widest text-xs font-bold transition-all duration-300 border backdrop-blur-md";
  
  const variants = {
    primary: "bg-[#ccff00] text-black border-[#ccff00] hover:bg-transparent hover:text-[#ccff00]",
    secondary: "bg-transparent text-white border-white/20 hover:border-[#ccff00] hover:text-[#ccff00]"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className}`}
      {...props}
    >
      {label}
    </button>
  );
};
