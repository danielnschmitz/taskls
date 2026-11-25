import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Send,
  Loader2,
  MessageCircle,
  RotateCcw,
  Users,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { JiraReviewEvent, JiraReviewGroup, WahaConfig, WahaGroup, WahaTemplate } from '../types';

interface WhatsappSendModalProps {
  isOpen: boolean;
  group: JiraReviewGroup | null;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function formatEventChangeLine(ev: JiraReviewEvent): string {
  const { eventType, diff } = ev;
  if (eventType === 'comment_added') {
    const snippet = (diff.text || '').trim();
    return `• Comentário: "${snippet.length > 180 ? snippet.slice(0, 177) + '...' : snippet}"`;
  }
  if (eventType === 'issue_created') {
    return '• Card criado';
  }
  if (eventType === 'flagged_changed') {
    return diff.isBlocked
      ? `• Card marcado como BLOQUEADO${diff.text ? ` (${diff.text})` : ''}`
      : '• Impedimento removido';
  }
  const label = diff.label || diff.field || 'Campo';
  const from = diff.from ? diff.from : 'vazio';
  const to = diff.to ? diff.to : 'vazio';
  return `• ${label}: ${from} → ${to}`;
}

export function renderWahaTemplate(templateContent: string, group: JiraReviewGroup): string {
  const orderedEvents = [...group.events].sort(
    (a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime()
  );
  const changesText = orderedEvents.map(formatEventChangeLine).join('\n');
  const card = group.cardData;

  const replacements: Record<string, string> = {
    '{{issueKey}}': group.issueKey || '',
    '{{summary}}': group.summary || card?.summary || '',
    '{{status}}': card?.displayStatus || card?.rawStatus || '',
    '{{industry}}': card?.industry || 'Não informada',
    '{{layout}}': card?.layout || 'Não informado',
    '{{author}}': group.authorName || '',
    '{{changes}}': changesText,
    '{{url}}': card?.url || '',
  };

  let rendered = templateContent;
  for (const [token, value] of Object.entries(replacements)) {
    rendered = rendered.split(token).join(value);
  }
  return rendered.trim();
}

export const WhatsappSendModal: React.FC<WhatsappSendModalProps> = ({
  isOpen,
  group,
  onClose,
  onShowToast,
}) => {
  const [templates, setTemplates] = useState<WahaTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [messageText, setMessageText] = useState<string>('');
  const [chatId, setChatId] = useState<string>('');
  const [defaultGroupName, setDefaultGroupName] = useState<string>('');
  const [groups, setGroups] = useState<WahaGroup[]>([]);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [wahaConfigured, setWahaConfigured] = useState(true);

  const applyTemplate = useCallback(
    (tplId: string, tplList: WahaTemplate[], targetGroup: JiraReviewGroup) => {
      const tpl = tplList.find((t) => t.id === tplId) || tplList[0];
      if (!tpl) return;
      setSelectedTemplateId(tpl.id);
      setMessageText(renderWahaTemplate(tpl.content, targetGroup));
    },
    []
  );

  useEffect(() => {
    if (!isOpen || !group) return;

    let cancelled = false;
    setIsLoadingInitial(true);

    Promise.all([fetch('/api/waha/templates'), fetch('/api/waha/config')])
      .then(async ([tplRes, cfgRes]) => {
        if (cancelled) return;
        const tplData = tplRes.ok ? await tplRes.json() : { templates: [] };
        const cfgData: WahaConfig | null = cfgRes.ok ? await cfgRes.json() : null;

        const loadedTemplates: WahaTemplate[] = tplData.templates || [];
        setTemplates(loadedTemplates);

        if (cfgData) {
          setChatId(cfgData.defaultGroupId || '');
          setDefaultGroupName(cfgData.defaultGroupName || '');
          setWahaConfigured(Boolean(cfgData.baseUrl));
        }

        const defaultTpl =
          loadedTemplates.find((t) => t.isDefault) || loadedTemplates[0];
        if (defaultTpl) {
          applyTemplate(defaultTpl.id, loadedTemplates, group);
        } else {
          setMessageText(`${group.issueKey} — ${group.summary}`);
        }
      })
      .catch((err) => {
        console.error('[WhatsappSendModal] Erro ao carregar dados:', err);
        onShowToast('Erro ao carregar templates ou configuração do WAHA.', 'error');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingInitial(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, group, applyTemplate, onShowToast]);

  const handleTemplateChange = (tplId: string) => {
    if (!group) return;
    applyTemplate(tplId, templates, group);
  };

  const handleResetToTemplate = () => {
    if (!group) return;
    applyTemplate(selectedTemplateId, templates, group);
  };

  const handleFetchGroups = async () => {
    setIsLoadingGroups(true);
    try {
      const res = await fetch('/api/waha/groups');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao buscar grupos');
      setGroups(data.groups || []);
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao listar grupos do WAHA.', 'error');
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatId.trim()) {
      onShowToast('Informe o grupo de destino do WhatsApp.', 'error');
      return;
    }
    if (!messageText.trim()) {
      onShowToast('A mensagem não pode estar vazia.', 'error');
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch('/api/waha/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: chatId.trim(),
          text: messageText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao enviar mensagem');

      onShowToast(`Mensagem de ${group?.issueKey} enviada para o WhatsApp!`, 'success');
      onClose();
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao enviar mensagem via WAHA.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen || !group) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-white dark:bg-[#0c1222] border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-emerald-500/5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <MessageCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                Enviar Atualização para WhatsApp — {group.issueKey}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {group.summary}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSend} className="p-6 space-y-4 overflow-y-auto flex-1">
          {!wahaConfigured && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                O servidor WAHA ainda não foi configurado. Acesse <strong>Configurações &gt; WhatsApp (WAHA)</strong>.
              </span>
            </div>
          )}

          {isLoadingInitial ? (
            <div className="py-12 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <span className="text-xs">Carregando templates e grupo...</span>
            </div>
          ) : (
            <>
              {/* Seleção de Template */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-indigo-500" />
                    Template da Mensagem:
                  </label>
                  <button
                    type="button"
                    onClick={handleResetToTemplate}
                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Recarregar do template
                  </button>
                </div>

                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} {tpl.isDefault ? '(Padrão)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Grupo de Destino */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                    Grupo de Destino (chatId):
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchGroups}
                    disabled={isLoadingGroups}
                    className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {isLoadingGroups && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>Listar grupos da sessão</span>
                  </button>
                </div>

                {groups.length > 0 ? (
                  <select
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Selecione um grupo...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name} ({g.id})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-1">
                    <input
                      type="text"
                      placeholder="ex: 120363012345678901@g.us"
                      value={chatId}
                      onChange={(e) => setChatId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                    {defaultGroupName && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Grupo padrão configurado: <strong>{defaultGroupName}</strong>
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Editor de Mensagem */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Pré-visualização / Edição da Mensagem:
                </label>
                <textarea
                  rows={10}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-sans leading-relaxed focus:outline-none focus:border-emerald-500"
                />
                <p className="text-[11px] text-slate-400">
                  Você pode editar o texto livremente antes de enviar. Formatação do WhatsApp (*negrito*, _itálico_) é suportada.
                </p>
              </div>
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSending || isLoadingInitial}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 transition-all"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>Enviar para WhatsApp</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
