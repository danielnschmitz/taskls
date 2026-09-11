import React from 'react';
import {
  Briefcase,
  GraduationCap,
  DollarSign,
  HeartPulse,
  Home,
  Target,
  CheckSquare,
  Tag,
  Book,
  Coffee,
  Laptop,
  Code,
  Calendar,
  Sparkles,
  LucideIcon,
} from 'lucide-react';
import { CategoryInfo } from '../types';

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Briefcase,
  GraduationCap,
  DollarSign,
  HeartPulse,
  Home,
  Target,
  CheckSquare,
  Tag,
  Book,
  Coffee,
  Laptop,
  Code,
  Calendar,
  Sparkles,
};

export const DEFAULT_CATEGORIES: CategoryInfo[] = [
  { id: 'trabalho', name: 'Trabalho', color: '#6366f1', icon: 'Briefcase' },
  { id: 'estudos', name: 'Estudos', color: '#a855f7', icon: 'GraduationCap' },
  { id: 'financas', name: 'Finanças', color: '#10b981', icon: 'DollarSign' },
  { id: 'saude', name: 'Saúde', color: '#f43f5e', icon: 'HeartPulse' },
  { id: 'casa', name: 'Casa', color: '#f59e0b', icon: 'Home' },
  { id: 'estrategia', name: 'Estratégia', color: '#06b6d4', icon: 'Target' },
  { id: 'geral', name: 'Geral', color: '#64748b', icon: 'CheckSquare' },
];

export function getCategoryInfo(categoryName: string, customCategories: CategoryInfo[] = []): CategoryInfo {
  const all = [...customCategories, ...DEFAULT_CATEGORIES];
  const found = all.find(
    (c) => c.name.toLowerCase() === (categoryName || '').toLowerCase()
  );
  if (found) return found;

  return {
    id: (categoryName || 'geral').toLowerCase(),
    name: categoryName || 'Geral',
    color: '#6366f1',
    icon: 'Tag',
  };
}

export function renderCategoryIcon(iconName: string, className = 'w-3 h-3') {
  const IconComponent = CATEGORY_ICON_MAP[iconName] || Tag;
  return <IconComponent className={className} />;
}
