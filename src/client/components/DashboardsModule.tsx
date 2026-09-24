import React, { useState } from 'react';
import {
  BarChart3,
  Timer,
  LayoutDashboard,
  TrendingUp,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { DashboardId } from '../types';
import { JiraLeadTimeDashboard } from './dashboards/JiraLeadTimeDashboard';
import { JiraNeoActivationsDashboard } from './dashboards/JiraNeoActivationsDashboard';

interface DashboardsModuleProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface DashboardTab {
  id: DashboardId;
  title: string;
  badge?: string;
  description: string;
  icon: React.ReactNode;
}

export const DashboardsModule: React.FC<DashboardsModuleProps> = ({ onShowToast }) => {
  const [activeDashboardId, setActiveDashboardId] = useState<DashboardId>('ativacoes-neo');

  const availableDashboards: DashboardTab[] = [
    {
      id: 'ativacoes-neo',
      title: 'Ativações Neogrid',
      badge: 'NEO',
      description: 'Volume de ativações por status, ERP, indústria e histórico mensal em produção',
      icon: <CheckCircle2 className="w-4 h-4" />,
    },
    {
      id: 'lead-time-jira',
      title: 'LeadTime Jira',
      badge: 'Ciclo & LeadTime',
      description: 'Métricas de Ciclo, Lead Time por etapa e análise de bloqueios no Jira',
      icon: <Timer className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header do Módulo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-600 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/20 flex-shrink-0">
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-extrabold tracking-tight text-white">Dashboards Analíticos</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5" /> Inteligência de Dados
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Painéis executivos, tempos de ciclo, identificação de gargalos e indicadores operacionais em tempo real.
            </p>
          </div>
        </div>

        {/* Abas / Seletores de Dashboards Disponíveis */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-inner">
          {availableDashboards.map((dash) => {
            const isActive = activeDashboardId === dash.id;
            return (
              <button
                key={dash.id}
                type="button"
                onClick={() => setActiveDashboardId(dash.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {dash.icon}
                <span>{dash.title}</span>
                {dash.badge && (
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[9px] font-black uppercase tracking-wider ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {dash.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Renderização do Dashboard Ativo */}
      {activeDashboardId === 'ativacoes-neo' && (
        <JiraNeoActivationsDashboard onShowToast={onShowToast} />
      )}
      {activeDashboardId === 'lead-time-jira' && (
        <JiraLeadTimeDashboard onShowToast={onShowToast} />
      )}
    </div>
  );
};
