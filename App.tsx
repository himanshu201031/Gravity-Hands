
import React, { useState } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { COLORS } from './constants';

const App: React.FC = () => {
  const [stats, setStats] = useState({ 
    fps: 0, 
    cubes: 0,
    hands: { left: false, right: false, leftGrabbing: false, rightGrabbing: false }
  });

  // Helper for hand status UI
  const HandIndicator = ({ label, detected, grabbing }: { label: string, detected: boolean, grabbing: boolean }) => (
    <div className={`glass-panel px-3 py-2 rounded-lg flex items-center gap-3 transition-all duration-300 ${detected ? 'border-[#ccff00]/30' : 'opacity-50 border-transparent'}`}>
      <div className="relative w-2 h-2">
         <div className={`absolute inset-0 rounded-full transition-colors duration-300 ${detected ? 'bg-[#ccff00]' : 'bg-red-500'}`}></div>
         {detected && <div className="absolute inset-0 rounded-full bg-[#ccff00] animate-ping opacity-75"></div>}
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[10px] text-gray-400 font-mono tracking-wider">{label}</span>
        <span className={`text-xs font-bold font-display tracking-widest ${grabbing ? 'text-[#ccff00]' : 'text-white'}`}>
          {grabbing ? 'GRABBING' : (detected ? 'ACTIVE' : 'OFFLINE')}
        </span>
      </div>
    </div>
  );

  return (
    <div className="w-full h-screen bg-[#050505] text-white flex flex-col overflow-hidden selection:bg-[#ccff00] selection:text-black">
      
      {/* Background Grid & Vignette */}
      <div className="absolute inset-0 pointer-events-none z-0">
         <div className="absolute inset-0 opacity-[0.03]" 
              style={{ 
                backgroundImage: `linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)`,
                backgroundSize: '40px 40px'
              }}>
         </div>
         <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/20 to-black/80"></div>
      </div>
      
      {/* Top HUD */}
      <header className="absolute top-0 left-0 w-full p-4 md:p-6 z-20 flex justify-between items-start pointer-events-none">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-4xl font-bold tracking-tighter leading-none font-display">
            GRAVITY<span style={{ color: COLORS.accent }}>HANDS</span>
          </h1>
          <div className="flex items-center gap-2 text-[10px] md:text-xs font-mono text-gray-500">
             <span className="px-1.5 py-0.5 border border-gray-700 rounded text-gray-400">v1.2.0</span>
             <span className="tracking-widest opacity-60">PHYSICS SANDBOX</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
           <div className="glass-panel px-4 py-1.5 rounded-full flex items-center gap-3">
             <span className="text-[10px] text-gray-400 font-mono">OBJECTS</span>
             <span className="text-xl font-bold font-display tracking-tighter text-white">
               {stats.cubes.toString().padStart(2, '0')}
             </span>
           </div>
           
           <div className="flex gap-2 mt-2">
             <HandIndicator label="LEFT HAND" detected={stats.hands.left} grabbing={stats.hands.leftGrabbing} />
             <HandIndicator label="RIGHT HAND" detected={stats.hands.right} grabbing={stats.hands.rightGrabbing} />
           </div>
        </div>
      </header>

      {/* Main Game Layer */}
      <main className="flex-1 relative w-full h-full z-10">
        <GameCanvas onStatsUpdate={setStats} />
      </main>

      {/* Bottom Information (Instructions) */}
      <footer className="absolute bottom-24 md:bottom-8 left-6 z-10 pointer-events-none hidden md:block">
        <div className="flex flex-col gap-1 text-[10px] font-mono text-gray-500">
           <div className="flex items-center gap-2">
              <span className="w-4 h-4 border border-gray-700 rounded flex items-center justify-center text-[8px]">1</span>
              <span>SHOW HAND TO CAMERA</span>
           </div>
           <div className="flex items-center gap-2">
              <span className="w-4 h-4 border border-gray-700 rounded flex items-center justify-center text-[8px]">2</span>
              <span>PINCH INDEX & THUMB TO GRAB</span>
           </div>
        </div>
      </footer>

    </div>
  );
};

export default App;
