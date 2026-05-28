import React from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

interface DashboardProps {
  onNavigate: (view: string) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const username = useSelector((state: RootState) => state.auth.username);
  
  return (
    <div className="absolute inset-0 overflow-y-auto p-gutter space-y-gutter w-full h-full fade-in-slide bg-background">
      {/* Welcome Greeting */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-gutter">
        <div className="xl:col-span-2 glass-card rounded-xl p-6 flex flex-col justify-center relative overflow-hidden group">
          {/* Holographic background graphic decoration */}
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none transition-transform duration-700 group-hover:scale-105">
            <svg viewBox="0 0 100 100" className="w-full h-full stroke-secondary-fixed-dim fill-none stroke-[0.2]">
              <circle cx="50" cy="50" r="40" />
              <circle cx="50" cy="50" r="30" strokeDasharray="2 2" />
              <line x1="10" y1="50" x2="90" y2="50" />
              <line x1="50" y1="10" x2="50" y2="90" />
            </svg>
          </div>
          <div className="relative z-10">
            <span className="text-secondary-fixed-dim font-label-md text-xs uppercase tracking-widest mb-1 block">Industrial Operations</span>
            <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface mb-2">
              Welcome, <span className="capitalize">{username || 'Engineer'}</span>.
            </h2>
            <p className="text-on-surface-variant max-w-xl text-sm leading-relaxed mb-6">
              The PLM AI Assistant is synchronized. Database tables reflect 1,240 lifecycle events. Check BOM changes, workflow statuses, and tool actions below.
            </p>
            <div className="flex flex-wrap gap-sm">
              <button 
                className="bg-primary-container text-primary-fixed-dim px-4 py-2 rounded-lg font-bold border border-primary/20 hover:bg-primary/10 transition-all flex items-center gap-2 text-xs"
                onClick={() => onNavigate('copilot')}
              >
                <span className="material-symbols-outlined text-sm">smart_toy</span> Consult AI Copilot
              </button>
              <button 
                className="bg-secondary-container text-on-secondary-container px-4 py-2 rounded-lg font-bold hover:brightness-110 transition-all flex items-center gap-2 text-xs cyan-glow"
                onClick={() => onNavigate('search')}
              >
                <span className="material-symbols-outlined text-sm">search</span> Search Teamcenter
              </button>
            </div>
          </div>
        </div>

        {/* Active Alerts Panel */}
        <div className="glass-card rounded-xl p-5 flex flex-col space-y-sm">
          <h3 className="text-base font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed-dim text-lg">warning</span>
            Active Alerts
          </h3>
          <div className="space-y-sm overflow-y-auto max-h-[160px] pr-xs">
            {/* Critical Alert */}
            <div className="p-3 bg-error-container/10 border-l-4 border-error rounded flex gap-2">
              <span className="material-symbols-outlined text-error text-sm">error</span>
              <div>
                <p className="font-bold text-xs text-on-error-container">Critical Tolerance Offset</p>
                <p className="text-on-surface-variant text-[11px] mt-0.5">Component T-800 revision mismatch detected.</p>
              </div>
            </div>
            {/* Normal Alert */}
            <div className="p-3 bg-secondary-container/5 border-l-4 border-secondary-fixed-dim rounded flex gap-2">
              <span className="material-symbols-outlined text-secondary-fixed-dim text-sm">info</span>
              <div>
                <p className="font-bold text-xs text-on-secondary-container">Workflow Sync</p>
                <p className="text-on-surface-variant text-[11px] mt-0.5">Design release workflow 'Titan-04' is active.</p>
              </div>
            </div>
          </div>
          <button 
            className="mt-auto w-full text-center text-xs font-bold text-secondary-fixed-dim hover:underline py-1"
            onClick={() => onNavigate('security')}
          >
            View Security Audits
          </button>
        </div>
      </section>

      {/* Metrics Bento Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-gutter">
        {/* SVG Analytics Chart */}
        <div className="lg:col-span-8 glass-card rounded-xl p-5 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-base font-bold text-on-surface">Workflow Execution Trends</h3>
            <div className="flex gap-1 bg-surface-container-low p-1 rounded-lg">
              <button className="px-2.5 py-0.5 text-[10px] font-bold bg-secondary-container/20 text-secondary-fixed-dim rounded">7d</button>
              <button className="px-2.5 py-0.5 text-[10px] font-medium text-on-surface-variant">30d</button>
            </div>
          </div>
          
          <div className="h-44 w-full flex items-end gap-3 px-4 relative mt-2">
            <div className="absolute inset-0 flex flex-col justify-between opacity-5 py-2 pointer-events-none">
              <div className="border-b border-white w-full"></div>
              <div className="border-b border-white w-full"></div>
              <div className="border-b border-white w-full"></div>
            </div>
            {/* Animated Chart Bars */}
            <div className="flex-1 bg-primary/20 hover:bg-primary/40 transition-all rounded-t h-[45%]" title="Mon: 45"></div>
            <div className="flex-1 bg-primary/20 hover:bg-primary/40 transition-all rounded-t h-[60%]" title="Tue: 60"></div>
            <div className="flex-1 bg-secondary-fixed-dim/40 hover:bg-secondary-fixed-dim/60 transition-all rounded-t h-[80%] cyan-glow" title="Wed: 80"></div>
            <div className="flex-1 bg-primary/20 hover:bg-primary/40 transition-all rounded-t h-[50%]" title="Thu: 50"></div>
            <div className="flex-1 bg-primary/20 hover:bg-primary/40 transition-all rounded-t h-[75%]" title="Fri: 75"></div>
            <div className="flex-1 bg-primary/20 hover:bg-primary/40 transition-all rounded-t h-[35%]" title="Sat: 35"></div>
            <div className="flex-1 bg-primary/20 hover:bg-primary/40 transition-all rounded-t h-[40%]" title="Sun: 40"></div>
          </div>
          <div className="flex justify-between text-[10px] text-on-surface-variant mt-2 font-mono px-4">
            <span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span>
          </div>
        </div>

        {/* AI engagement breakdown */}
        <div className="lg:col-span-4 glass-card rounded-xl p-5">
          <h3 className="text-base font-bold text-on-surface mb-3">AI Agent Engagement</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-on-surface font-medium">Design Engineering</span>
                <span className="text-secondary-fixed-dim font-bold">88%</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-1.5">
                <div className="bg-secondary-fixed-dim h-full rounded-full" style={{ width: '88%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-on-surface font-medium">Material Science</span>
                <span className="text-primary font-bold">62%</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-1.5">
                <div className="bg-primary h-full rounded-full" style={{ width: '62%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-on-surface font-medium">Manufacturing</span>
                <span className="text-tertiary font-bold">45%</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-1.5">
                <div className="bg-tertiary h-full rounded-full" style={{ width: '45%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Queries Table */}
      <section className="glass-card rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="px-5 py-3 border-b border-outline-variant/10 bg-surface-container-low/30">
          <h3 className="text-base font-bold text-on-surface">Recent System Activity</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-surface-variant/20 text-on-surface-variant border-b border-outline-variant/10 font-bold uppercase tracking-wider">
                <th className="p-4">Event Description</th>
                <th className="p-4">Department</th>
                <th className="p-4">Status</th>
                <th className="p-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              <tr className="hover:bg-surface-variant/20 transition-colors">
                <td className="p-4 font-medium text-on-surface">Query bearing item details</td>
                <td className="p-4">Material Analysis</td>
                <td className="p-4">
                  <span className="px-2 py-0.5 bg-tertiary-container/30 text-tertiary rounded font-bold uppercase text-[9px]">Verified</span>
                </td>
                <td className="p-4 text-on-surface-variant">10:14 AM</td>
              </tr>
              <tr className="hover:bg-surface-variant/20 transition-colors">
                <td className="p-4 font-medium text-on-surface">Update dataset specification</td>
                <td className="p-4">CAD Design</td>
                <td className="p-4">
                  <span className="px-2 py-0.5 bg-tertiary-container/30 text-tertiary rounded font-bold uppercase text-[9px]">Verified</span>
                </td>
                <td className="p-4 text-on-surface-variant">09:42 AM</td>
              </tr>
              <tr className="hover:bg-surface-variant/20 transition-colors">
                <td className="p-4 font-medium text-on-surface">Add item revision B</td>
                <td className="p-4">Procurement</td>
                <td className="p-4">
                  <span className="px-2 py-0.5 bg-secondary-container/20 text-secondary-fixed-dim rounded font-bold uppercase text-[9px]">Pending</span>
                </td>
                <td className="p-4 text-on-surface-variant">Yesterday</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
