import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Plus,
  Search,
  Sparkles,
  Copy,
  Check,
  Save,
  Trash2,
  Edit3,
  ArrowLeft,
  History,
  Download,
  FolderOpen,
  Layers,
  ChevronRight,
  Eye,
  FileCode,
  X,
  AlertCircle,
  HelpCircle,
  Maximize2,
  RotateCcw,
} from 'lucide-react';
import { CardTemplate, SavedCard } from '../types';
import { DualMarkdownEditor, markdownToHtml } from './DualMarkdownEditor';
import { useAuth } from '../contexts/AuthContext';

interface CardWriterModuleProps {
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CardWriterModule: React.FC<CardWriterModuleProps> = ({ onShowToast }) => {
  const { user } = useAuth();

  // Estados principais
  const [templates, setTemplates] = useState<CardTemplate[]>([]);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Template ativo para escrita
  const [activeTemplate, setActiveTemplate] = useState<CardTemplate | null>(null);
  const [macroValues, setMacroValues] = useState<Record<string, string>>({});
  const [multilineToggles, setMultilineToggles] = useState<Record<string, boolean>>({});
  const [previewTab, setPreviewTab] = useState<'rendered' | 'raw'>('rendered');
  const [cardTitle, setCardTitle] = useState('');

  // Modais
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CardTemplate | null>(null);
  const [templateFormTitle, setTemplateFormTitle] = useState('');
  const [templateFormDesc, setTemplateFormDesc] = useState('');
  const [templateFormCategory, setTemplateFormCategory] = useState('Geral');
  const [templateFormContent, setTemplateFormContent] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  // Modal de Histórico de Cards
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');

  // Carregar templates e cards salvos
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resTemplates, resSaved] = await Promise.all([
        fetch('/api/cards/templates'),
        fetch('/api/cards/saved'),
      ]);

      if (resTemplates.ok) {
        const templatesData = await resTemplates.json();
        setTemplates(templatesData);
      }
      if (resSaved.ok) {
        const savedData = await resSaved.json();
        setSavedCards(savedData);
      }
    } catch (err) {
      console.error('Erro ao carregar dados do módulo de cards:', err);
      onShowToast('Falha ao carregar templates de cards.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Categorias disponíveis nos templates
  const categories = useMemo(() => {
    const set = new Set(templates.map((t) => t.category || 'Geral'));
    return Array.from(set).sort();
  }, [templates]);

  // Templates filtrados
  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchSearch =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        t.content.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCat = selectedCategory === 'all' || t.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [templates, searchQuery, selectedCategory]);

  // Extrair macros únicas do template ativo
  const activeMacros = useMemo(() => {
    if (!activeTemplate) return [];
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = Array.from(activeTemplate.content.matchAll(regex));
    const unique = Array.from(new Set(matches.map((m) => m[1].trim()))).filter(Boolean);
    return unique;
  }, [activeTemplate]);

  // Heurística para saber se um campo de macro deve ser textarea multiline
  const isDefaultMultiline = (name: string) => {
    return /critério|criterio|regra|passo|descri|evidência|evidencia|log|escopo|observa|detalhe|solução|solucao|contexto/i.test(
      name
    );
  };

  // Iniciar escrita de card para um template
  const handleStartWriting = (template: CardTemplate) => {
    setActiveTemplate(template);
    setCardTitle('');
    setMacroValues({});
    setMultilineToggles({});
    setPreviewTab('rendered');
  };

  // Geração do Markdown final substituindo as macros
  const generatedMarkdown = useMemo(() => {
    if (!activeTemplate) return '';
    let result = activeTemplate.content;

    activeMacros.forEach((macro) => {
      const val = macroValues[macro];
      const replacement = val && val.trim() ? val.trim() : `{{${macro}}}`;
      // Substitui todas as ocorrências de {{macro}} respeitando espaços internos
      const escaped = macro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`\\{\\{\\s*${escaped}\\s*\\}\\}`, 'g');
      result = result.replace(reg, replacement);
    });

    return result;
  }, [activeTemplate, activeMacros, macroValues]);

  // Copiar Markdown para a área de transferência
  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(generatedMarkdown);
      onShowToast('Markdown copiado com sucesso para a área de transferência!', 'success');
    } catch (err) {
      onShowToast('Erro ao copiar Markdown.', 'error');
    }
  };

  // Salvar Card no Histórico
  const handleSaveCard = async () => {
    if (!activeTemplate) return;
    const titleToUse = cardTitle.trim() || macroValues[activeMacros[0]] || `Card ${activeTemplate.title}`;

    try {
      const res = await fetch('/api/cards/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: activeTemplate.id,
          templateTitle: activeTemplate.title,
          title: titleToUse,
          macroValues,
          contentMarkdown: generatedMarkdown,
        }),
      });

      if (!res.ok) throw new Error('Erro na requisição');

      const saved = await res.json();
      setSavedCards((prev) => [saved, ...prev]);
      onShowToast('Card gravado com sucesso no seu histórico!', 'success');
    } catch (err) {
      onShowToast('Erro ao salvar card no histórico.', 'error');
    }
  };

  // Download como arquivo .md
  const handleDownloadMarkdown = () => {
    const titleToUse = cardTitle.trim() || 'card';
    const blob = new Blob([generatedMarkdown], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${titleToUse.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast('Arquivo .md baixado!', 'info');
  };

  // Abrir modal de criação/edição de template
  const handleOpenTemplateModal = (template?: CardTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setTemplateFormTitle(template.title);
      setTemplateFormDesc(template.description || '');
      setTemplateFormCategory(template.category || 'Geral');
      setTemplateFormContent(template.content);
    } else {
      setEditingTemplate(null);
      setTemplateFormTitle('');
      setTemplateFormDesc('');
      setTemplateFormCategory('Geral');
      setTemplateFormContent(`# [{{ID}}] {{Título da Demanda}}\n\n### 📝 Descrição:\n{{Descrição da Demanda}}\n\n### 📋 Critérios:\n{{Critérios de Aceitação}}`);
    }
    setIsTemplateModalOpen(true);
  };

  // Salvar template
  const handleSaveTemplateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFormTitle.trim() || !templateFormContent.trim()) {
      onShowToast('Título e conteúdo Markdown são obrigatórios.', 'error');
      return;
    }

    setIsSavingTemplate(true);
    try {
      if (editingTemplate) {
        // Atualizar
        const res = await fetch(`/api/cards/templates/${editingTemplate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: templateFormTitle,
            description: templateFormDesc,
            category: templateFormCategory,
            content: templateFormContent,
          }),
        });
        if (!res.ok) throw new Error('Falha ao atualizar template');
        const updated = await res.json();
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        if (activeTemplate?.id === updated.id) {
          setActiveTemplate(updated);
        }
        onShowToast('Template atualizado com sucesso!', 'success');
      } else {
        // Criar
        const res = await fetch('/api/cards/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: templateFormTitle,
            description: templateFormDesc,
            category: templateFormCategory,
            content: templateFormContent,
          }),
        });
        if (!res.ok) throw new Error('Falha ao criar template');
        const created = await res.json();
        setTemplates((prev) => [...prev, created]);
        onShowToast('Template criado com sucesso!', 'success');
      }
      setIsTemplateModalOpen(false);
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao salvar template.', 'error');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Excluir template
  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Deseja realmente excluir este template?')) return;

    try {
      const res = await fetch(`/api/cards/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao excluir template');
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      if (activeTemplate?.id === id) setActiveTemplate(null);
      onShowToast('Template removido com sucesso.', 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao excluir template.', 'error');
    }
  };

  // Excluir card do histórico
  const handleDeleteSavedCard = async (id: string) => {
    try {
      const res = await fetch(`/api/cards/saved/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir card');
      setSavedCards((prev) => prev.filter((c) => c.id !== id));
      onShowToast('Card removido do histórico.', 'success');
    } catch (err) {
      onShowToast('Erro ao remover card.', 'error');
    }
  };

  // Restaurar card salvo para edição/visualização
  const handleLoadSavedCard = (card: SavedCard) => {
    const template = templates.find((t) => t.id === card.templateId) || {
      id: card.templateId || 'custom',
      title: card.templateTitle || 'Template Personalizado',
      description: 'Card restaurado do histórico',
      category: 'Histórico',
      content: card.contentMarkdown,
      isSystem: false,
      createdAt: card.createdAt,
      updatedAt: card.createdAt,
    };

    setActiveTemplate(template);
    setCardTitle(card.title);
    setMacroValues(card.macroValues || {});
    setIsHistoryModalOpen(false);
    onShowToast(`Card "${card.title}" carregado!`, 'info');
  };

  return (
    <div className="space-y-6">
      {/* Module Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 bg-[#0d1424] border border-slate-800 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-600/30 ring-1 ring-white/20">
            <FileText className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-extrabold text-white tracking-tight">Escrita de Cards</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Markdown & Macros
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Crie templates inteligentes com macros dinâmicas e gere especificações formatadas em Markdown com 1 clique.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {activeTemplate && (
            <button
              onClick={() => setActiveTemplate(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Ver Todos Templates</span>
            </button>
          )}

          <button
            onClick={() => setIsHistoryModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-semibold transition-all"
          >
            <History className="w-4 h-4 text-purple-400" />
            <span>Cards Salvos ({savedCards.length})</span>
          </button>

          <button
            onClick={() => handleOpenTemplateModal()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Template</span>
          </button>
        </div>
      </div>

      {/* RENDER VIEW: Se não houver template ativo -> Exibe Grade de Templates */}
      {!activeTemplate ? (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-2xl">
            <div className="relative flex-1 w-full sm:max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar templates por título ou macro..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedCategory === 'all'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 bg-slate-800/40'
                }`}
              >
                Todas Categorias
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-800/40'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid de Templates */}
          {isLoading ? (
            <div className="py-20 text-center text-slate-400 text-xs">
              Carregando templates de cards...
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-12 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-3xl space-y-3">
              <FileText className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-bold text-slate-300">Nenhum template encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Crie seu primeiro template com macros personalizadas para agilizar a escrita de cards para Jira e GitHub.
              </p>
              <button
                onClick={() => handleOpenTemplateModal()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30"
              >
                Criar Template Agora
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => {
                const regex = /\{\{([^}]+)\}\}/g;
                const matches = Array.from(template.content.matchAll(regex));
                const templateMacros = Array.from(new Set(matches.map((m) => m[1].trim())));

                return (
                  <div
                    key={template.id}
                    onClick={() => handleStartWriting(template)}
                    className="group relative bg-[#0c1222] hover:bg-[#11192e] border border-slate-800 hover:border-indigo-500/50 rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:shadow-xl hover:shadow-indigo-950/30 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {template.category || 'Geral'}
                        </span>

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                          {(!template.isSystem || user?.isAdmin) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTemplateModal(template);
                              }}
                              className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-800"
                              title="Editar Template"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(!template.isSystem || user?.isAdmin) && (
                            <button
                              onClick={(e) => handleDeleteTemplate(template.id, e)}
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800"
                              title="Excluir Template"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <h3 className="text-base font-bold text-white group-hover:text-indigo-300 transition-colors">
                        {template.title}
                      </h3>

                      {template.description && (
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {template.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 space-y-2.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1 font-semibold text-purple-300">
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          {templateMacros.length} {templateMacros.length === 1 ? 'macro' : 'macros'}
                        </span>
                        {template.isSystem && (
                          <span className="text-[10px] text-slate-500 font-medium">Padrão do Sistema</span>
                        )}
                      </div>

                      {/* Chips das macros */}
                      <div className="flex flex-wrap gap-1 max-h-16 overflow-hidden">
                        {templateMacros.slice(0, 4).map((m) => (
                          <span
                            key={m}
                            className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 text-[10px] font-mono"
                          >
                            {`{{${m}}}`}
                          </span>
                        ))}
                        {templateMacros.length > 4 && (
                          <span className="px-1 py-0.5 text-[10px] text-slate-500 font-mono">
                            +{templateMacros.length - 4}
                          </span>
                        )}
                      </div>

                      <div className="pt-2 flex items-center justify-between text-xs font-bold text-indigo-400 group-hover:text-indigo-300">
                        <span>Escrever Novo Card</span>
                        <ChevronRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* RENDER VIEW: Modo de Escrita Interativa de Card (Template Ativo) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LADO ESQUERDO: Formulário de Preenchimento das Macros (5 Colunas) */}
          <div className="lg:col-span-5 bg-[#0c1222] border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                  Preenchimento do Template:
                </span>
                <h3 className="text-base font-bold text-white">{activeTemplate.title}</h3>
              </div>
              <button
                onClick={() => {
                  if (confirm('Deseja limpar todos os campos preenchidos?')) {
                    setMacroValues({});
                  }
                }}
                className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-amber-400 transition-colors"
                title="Limpar todos os campos"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Limpar</span>
              </button>
            </div>

            {/* Identificação do Card */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Título / Identificador do Card:
              </label>
              <input
                type="text"
                placeholder="Ex: [NEO-1234] Implementar login social com Google"
                value={cardTitle}
                onChange={(e) => setCardTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-semibold"
              />
            </div>

            {/* Lista Dinâmica de Macros */}
            <div className="space-y-4 max-h-[650px] overflow-y-auto pr-1">
              {activeMacros.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200 text-xs">
                  Este template não possui nenhuma macro no formato <code>{'{{nome}}'}</code>. Você pode editar o texto diretamente no painel à direita.
                </div>
              ) : (
                activeMacros.map((macro, idx) => {
                  const isMulti = multilineToggles[macro] !== undefined
                    ? multilineToggles[macro]
                    : isDefaultMultiline(macro);

                  return (
                    <div key={macro} className="space-y-1.5 p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px] flex items-center justify-center font-bold">
                            {idx + 1}
                          </span>
                          <span>{macro}</span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setMultilineToggles((prev) => ({
                              ...prev,
                              [macro]: !isMulti,
                            }))
                          }
                          className="text-[10px] text-slate-400 hover:text-indigo-300 font-mono"
                          title="Alternar entre campo simples ou área de texto multilinhas"
                        >
                          {isMulti ? 'Texto longo' : 'Linha única'} ⚙️
                        </button>
                      </div>

                      {isMulti ? (
                        <textarea
                          rows={3}
                          placeholder={`Informe ${macro}...`}
                          value={macroValues[macro] || ''}
                          onChange={(e) =>
                            setMacroValues((prev) => ({ ...prev, [macro]: e.target.value }))
                          }
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-y leading-relaxed"
                        />
                      ) : (
                        <input
                          type="text"
                          placeholder={`Informe ${macro}...`}
                          value={macroValues[macro] || ''}
                          onChange={(e) =>
                            setMacroValues((prev) => ({ ...prev, [macro]: e.target.value }))
                          }
                          className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* LADO DIREITO: Entrega em Markdown & Pré-visualização (7 Colunas) */}
          <div className="lg:col-span-7 bg-[#0c1222] border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
            {/* Header da Pré-visualização com Ações Principais */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              
              {/* Tabs Rendered vs Raw */}
              <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setPreviewTab('rendered')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    previewTab === 'rendered'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Visualização Formatada</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('raw')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    previewTab === 'raw'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>Código Markdown</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadMarkdown}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all"
                  title="Baixar arquivo .md"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Baixar .md</span>
                </button>

                <button
                  onClick={handleSaveCard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all"
                  title="Salvar no histórico"
                >
                  <Save className="w-3.5 h-3.5 text-purple-400" />
                  <span className="hidden sm:inline">Salvar</span>
                </button>

                <button
                  onClick={handleCopyMarkdown}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copiar Markdown</span>
                </button>
              </div>
            </div>

            {/* Conteúdo Renderizado ou Código Bruto */}
            <div className="min-h-[550px] max-h-[680px] overflow-y-auto bg-slate-950/80 border border-slate-800/80 rounded-2xl p-6">
              {previewTab === 'rendered' ? (
                <div
                  className="text-slate-200 text-sm leading-relaxed space-y-3 font-sans selection:bg-indigo-500/30"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(generatedMarkdown) }}
                />
              ) : (
                <textarea
                  readOnly
                  value={generatedMarkdown}
                  className="w-full h-full min-h-[520px] bg-transparent outline-none text-slate-200 text-xs font-mono leading-relaxed resize-none selection:bg-indigo-500/30 cursor-text"
                />
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span>{activeMacros.filter((m) => Boolean(macroValues[m]?.trim())).length} de {activeMacros.length} macros preenchidas</span>
              <span className="font-mono text-[10px]">Pronto para colar no Jira, Azure DevOps ou GitHub</span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Criação / Edição de Template de Card */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b101e] border border-slate-700 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/30 text-indigo-400 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {editingTemplate ? 'Editar Template de Card' : 'Novo Template de Card'}
                </h3>
              </div>
              <button
                onClick={() => setIsTemplateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveTemplateSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Título do Template: *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: História de Usuário (User Story)"
                    value={templateFormTitle}
                    onChange={(e) => setTemplateFormTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Categoria:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Ágil, Bugs, Técnico"
                    value={templateFormCategory}
                    onChange={(e) => setTemplateFormCategory(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Descrição Curta / Objetivo:
                </label>
                <input
                  type="text"
                  placeholder="Ex: Estrutura recomendada para histórias ágeis com critérios de aceite."
                  value={templateFormDesc}
                  onChange={(e) => setTemplateFormDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    Conteúdo do Template com Macros: *
                  </label>
                  <span className="text-[11px] text-indigo-400 font-mono">
                    Use o editor Word ou Markdown para incluir formatações e macros
                  </span>
                </div>

                <DualMarkdownEditor
                  value={templateFormContent}
                  onChange={setTemplateFormContent}
                  placeholder="Escreva seu template aqui com macros {{exemplo}}..."
                  minHeight="340px"
                />
              </div>

              {/* Footer Actions */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingTemplate}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all"
                >
                  {isSavingTemplate ? 'Salvando...' : 'Salvar Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Histórico de Cards Salvos */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b101e] border border-slate-700 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-600/30 text-purple-400 flex items-center justify-center">
                  <History className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-white">Histórico de Cards Gerados</h3>
              </div>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-800/80">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar cards no histórico..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="p-6 space-y-3 overflow-y-auto flex-1">
              {savedCards.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Nenhum card foi salvo ainda. Ao preencher um template, clique em "Salvar" para manter um histórico.
                </div>
              ) : (
                savedCards
                  .filter((c) => c.title.toLowerCase().includes(historySearch.toLowerCase()) || (c.templateTitle && c.templateTitle.toLowerCase().includes(historySearch.toLowerCase())))
                  .map((card) => (
                    <div
                      key={card.id}
                      className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all"
                    >
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider block">
                          {card.templateTitle || 'Template Personalizado'}
                        </span>
                        <h4 className="text-sm font-bold text-white">{card.title}</h4>
                        <span className="text-[10px] text-slate-500 block">
                          Salvo em {new Date(card.createdAt).toLocaleDateString('pt-BR')} às {new Date(card.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          onClick={async () => {
                            await navigator.clipboard.writeText(card.contentMarkdown);
                            onShowToast('Markdown copiado do histórico!', 'success');
                          }}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-all"
                          title="Copiar Markdown"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleLoadSavedCard(card)}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-bold transition-all"
                        >
                          Abrir / Editar
                        </button>

                        <button
                          onClick={() => handleDeleteSavedCard(card.id)}
                          className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 text-xs transition-all"
                          title="Excluir do Histórico"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
