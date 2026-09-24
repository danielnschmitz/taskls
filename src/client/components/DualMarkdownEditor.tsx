import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Sparkles,
  FileCode,
  Eye,
  CheckSquare,
  Plus,
  HelpCircle,
} from 'lucide-react';

interface DualMarkdownEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  minHeight?: string;
}

/**
 * Converte Markdown simples para HTML seguro para o editor visual
 */
export function markdownToHtml(md: string): string {
  if (!md) return '<p><br></p>';

  const lines = md.split('\n');
  let html = '';
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;

  const closeLists = () => {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
    if (inBlockquote) {
      html += '</blockquote>';
      inBlockquote = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Formatação inline geral
    const formatInline = (text: string) => {
      return text
        // Macros {{...}}
        .replace(
          /\{\{([^}]+)\}\}/g,
          '<span class="macro-badge inline-flex items-center bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-500/50 rounded px-1.5 py-0.5 mx-0.5 font-mono text-xs font-semibold select-all" data-macro="$1" contenteditable="false">{{$1}}</span>'
        )
        // Negrito **text**
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Itálico *text*
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Riscado ~~text~~
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        // Código inline `code`
        .replace(/`([^`]+)`/g, '<code class="bg-slate-100 dark:bg-slate-800/80 text-sky-700 dark:text-sky-300 px-1 py-0.5 rounded font-mono text-xs border border-slate-200 dark:border-slate-700">$1</code>');
    };

    // Linha horizontal
    if (line.trim() === '---' || line.trim() === '***') {
      closeLists();
      html += '<hr class="border-slate-200 dark:border-slate-700 my-4" />';
      continue;
    }

    // Título H1
    if (line.startsWith('# ')) {
      closeLists();
      html += `<h1 class="text-xl font-bold text-slate-900 dark:text-white my-3">${formatInline(line.slice(2))}</h1>`;
      continue;
    }

    // Título H2
    if (line.startsWith('## ')) {
      closeLists();
      html += `<h2 class="text-lg font-bold text-slate-800 dark:text-slate-100 my-2.5">${formatInline(line.slice(3))}</h2>`;
      continue;
    }

    // Título H3
    if (line.startsWith('### ')) {
      closeLists();
      html += `<h3 class="text-base font-semibold text-slate-700 dark:text-slate-200 my-2">${formatInline(line.slice(4))}</h3>`;
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      if (!inBlockquote) {
        closeLists();
        html += '<blockquote class="border-l-4 border-indigo-500 pl-3 my-2 text-slate-600 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-900/40 py-1 rounded-r">';
        inBlockquote = true;
      }
      html += `<p class="my-0.5">${formatInline(line.slice(2))}</p>`;
      continue;
    } else if (inBlockquote) {
      html += '</blockquote>';
      inBlockquote = false;
    }

    // Lista não ordenada (- ou *)
    if (line.match(/^(\s*)[-*]\s(.*)/)) {
      const match = line.match(/^(\s*)[-*]\s(.*)/);
      if (!inUl) {
        closeLists();
        html += '<ul class="list-disc pl-5 my-1.5 space-y-1">';
        inUl = true;
      }
      html += `<li class="my-0.5">${formatInline(match![2])}</li>`;
      continue;
    } else if (inUl) {
      html += '</ul>';
      inUl = false;
    }

    // Lista ordenada (1. 2.)
    if (line.match(/^(\s*)\d+\.\s(.*)/)) {
      const match = line.match(/^(\s*)\d+\.\s(.*)/);
      if (!inOl) {
        closeLists();
        html += '<ol class="list-decimal pl-5 my-1.5 space-y-1">';
        inOl = true;
      }
      html += `<li class="my-0.5">${formatInline(match![2])}</li>`;
      continue;
    } else if (inOl) {
      html += '</ol>';
      inOl = false;
    }

    // Linha vazia
    if (line.trim() === '') {
      closeLists();
      html += '<p><br></p>';
      continue;
    }

    // Parágrafo comum
    closeLists();
    html += `<p class="my-1 leading-relaxed">${formatInline(line)}</p>`;
  }

  closeLists();
  return html;
}

/**
 * Converte HTML gerado pelo editor visual de volta para Markdown limpo
 */
export function htmlToMarkdown(html: string): string {
  const container = document.createElement('div');
  container.innerHTML = html;

  function traverse(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    // Se for badge de macro
    if (el.classList.contains('macro-badge') || el.getAttribute('data-macro')) {
      const macroName = el.getAttribute('data-macro') || el.textContent?.replace(/^\{\{|\}\}$/g, '') || '';
      return `{{${macroName}}}`;
    }

    let inner = '';
    el.childNodes.forEach((child) => {
      inner += traverse(child);
    });

    switch (tag) {
      case 'h1':
        return `\n\n# ${inner.trim()}\n\n`;
      case 'h2':
        return `\n\n## ${inner.trim()}\n\n`;
      case 'h3':
        return `\n\n### ${inner.trim()}\n\n`;
      case 'h4':
      case 'h5':
      case 'h6':
        return `\n\n### ${inner.trim()}\n\n`;
      case 'strong':
      case 'b':
        return `**${inner}**`;
      case 'em':
      case 'i':
        return `*${inner}*`;
      case 'del':
      case 'strike':
      case 's':
        return `~~${inner}~~`;
      case 'code':
        return `\`${inner}\``;
      case 'pre':
        return `\n\n\`\`\`\n${inner.trim()}\n\`\`\`\n\n`;
      case 'blockquote':
        return `\n\n> ${inner.trim().replace(/\n/g, '\n> ')}\n\n`;
      case 'hr':
        return '\n\n---\n\n';
      case 'ul':
        return `\n${inner}\n`;
      case 'ol':
        return `\n${inner}\n`;
      case 'li': {
        const parentTag = el.parentElement?.tagName.toLowerCase();
        if (parentTag === 'ol') {
          const index = Array.from(el.parentElement?.children || []).indexOf(el) + 1;
          return `${index}. ${inner.trim()}\n`;
        }
        return `- ${inner.trim()}\n`;
      }
      case 'p':
        if (inner.trim() === '' || inner === '<br>') {
          return '\n';
        }
        return `\n${inner}\n`;
      case 'div':
        return `\n${inner}\n`;
      case 'br':
        return '\n';
      default:
        return inner;
    }
  }

  const result = traverse(container);

  // Limpeza de quebras de linha excessivas
  return result
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trim();
}

export const DualMarkdownEditor: React.FC<DualMarkdownEditorProps> = ({
  value,
  onChange,
  placeholder = 'Escreva seu template aqui com macros {{exemplo}}...',
  minHeight = '320px',
}) => {
  const [mode, setMode] = useState<'visual' | 'markdown'>('visual');
  const [macroInputOpen, setMacroInputOpen] = useState(false);
  const [newMacroName, setNewMacroName] = useState('');
  const [macroCategory, setMacroCategory] = useState<string>('custom');

  const editorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isUpdatingRef = useRef(false);

  // Sugestões comuns de macros para produtividade rápida
  const COMMON_MACROS = [
    'Título da História',
    'Papel do Usuário',
    'Necessidade',
    'Benefício',
    'Critérios de Aceitação',
    'Regras de Negócio',
    'Passos para Reprodução',
    'Comportamento Atual',
    'Comportamento Esperado',
    'Ambiente',
    'Evidências e Logs',
    'Objetivo da Tarefa',
    'Escopo Técnico',
    'Dependências',
    'Observações',
  ];

  // Sincroniza o valor de Markdown para o editor visual quando o modo muda
  useEffect(() => {
    if (mode === 'visual' && editorRef.current) {
      const html = markdownToHtml(value);
      if (editorRef.current.innerHTML !== html) {
        editorRef.current.innerHTML = html;
      }
    }
  }, [mode, value]);

  // Handler de alteração no modo visual
  const handleVisualInput = useCallback(() => {
    if (isUpdatingRef.current || !editorRef.current) return;
    const md = htmlToMarkdown(editorRef.current.innerHTML);
    onChange(md);
  }, [onChange]);

  // Executa comandos de formatação visual
  const executeCommand = (command: string, val: string | undefined = undefined) => {
    if (mode !== 'visual' || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, val);
    handleVisualInput();
  };

  // Inserir formatação de bloco (H1, H2, H3, P)
  const formatBlock = (tag: string) => {
    if (mode !== 'visual' || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('formatBlock', false, tag);
    handleVisualInput();
  };

  // Inserir Macro
  const handleInsertMacro = (macroName: string) => {
    const cleanName = macroName.trim().replace(/^\{\{|\}\}$/g, '');
    if (!cleanName) return;

    if (mode === 'visual') {
      if (editorRef.current) {
        editorRef.current.focus();
        const badgeHtml = `<span class="macro-badge" data-macro="${cleanName}" contenteditable="false" style="display:inline-flex;align-items:center;background:rgba(99,102,241,0.2);color:#a5b4fc;border:1px solid rgba(99,102,241,0.5);border-radius:4px;padding:1px 6px;margin:0 2px;font-family:monospace;font-size:11px;font-weight:600;user-select:all;">{{${cleanName}}}</span>&nbsp;`;
        document.execCommand('insertHTML', false, badgeHtml);
        handleVisualInput();
      }
    } else {
      if (textareaRef.current) {
        const textarea = textareaRef.current;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const textToInsert = `{{${cleanName}}}`;
        const newValue = value.substring(0, start) + textToInsert + value.substring(end);
        onChange(newValue);
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
        }, 0);
      } else {
        onChange(value + ` {{${cleanName}}}`);
      }
    }

    setNewMacroName('');
    setMacroInputOpen(false);
  };

  // Inserção rápida de markdown no modo de código
  const insertMarkdownSnippet = (before: string, after: string = '', defaultText: string = '') => {
    if (!textareaRef.current) return;
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.substring(start, end) || defaultText;
    const replacement = `${before}${selected}${after}`;
    const newValue = value.substring(0, start) + replacement + value.substring(end);
    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        start + before.length + selected.length
      );
    }, 0);
  };

  return (
    <div className="flex flex-col border border-slate-300 dark:border-slate-700/80 rounded-2xl bg-white dark:bg-slate-950/70 overflow-hidden shadow-sm dark:shadow-xl">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800">
        
        {/* Left: Mode Toggle (Word Visual vs Código Markdown) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950/80 rounded-xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setMode('visual')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'visual'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Editor Visual (Word)</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('markdown')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              mode === 'markdown'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Código Markdown</span>
          </button>
        </div>

        {/* Center/Right: Formatting Tools */}
        <div className="flex flex-wrap items-center gap-1">
          {mode === 'visual' ? (
            <>
              {/* Headings */}
              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-950/60 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => formatBlock('h1')}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Título 1 (H1)"
                >
                  <Heading1 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatBlock('h2')}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Título 2 (H2)"
                >
                  <Heading2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => formatBlock('h3')}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Título 3 (H3)"
                >
                  <Heading3 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Text Styles */}
              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-950/60 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => executeCommand('bold')}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
                  title="Negrito (Ctrl+B)"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('italic')}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Itálico (Ctrl+I)"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('strikeThrough')}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Riscado"
                >
                  <Strikethrough className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Lists & Blocks */}
              <div className="flex items-center gap-0.5 bg-white dark:bg-slate-950/60 p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => executeCommand('insertUnorderedList')}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Lista com Marcadores"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => executeCommand('insertOrderedList')}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Lista Numerada"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    executeCommand('insertHorizontalRule');
                  }}
                  className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Linha Divisória (---)"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            /* Markdown Code Shortcuts */
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => insertMarkdownSnippet('# ', '', 'Título')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-mono text-slate-700 dark:text-slate-300"
                title="Inserir H1"
              >
                # H1
              </button>
              <button
                type="button"
                onClick={() => insertMarkdownSnippet('## ', '', 'Subtítulo')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-mono text-slate-700 dark:text-slate-300"
                title="Inserir H2"
              >
                ## H2
              </button>
              <button
                type="button"
                onClick={() => insertMarkdownSnippet('**', '**', 'negrito')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300"
                title="Inserir Negrito"
              >
                **B**
              </button>
              <button
                type="button"
                onClick={() => insertMarkdownSnippet('*', '*', 'itálico')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] italic text-slate-700 dark:text-slate-300"
                title="Inserir Itálico"
              >
                *I*
              </button>
              <button
                type="button"
                onClick={() => insertMarkdownSnippet('- ', '', 'Item da lista')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] text-slate-700 dark:text-slate-300"
                title="Inserir Item de Lista"
              >
                - Lista
              </button>
              <button
                type="button"
                onClick={() => insertMarkdownSnippet('\n---\n')}
                className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] text-slate-700 dark:text-slate-300"
                title="Inserir Divisor"
              >
                ---
              </button>
            </div>
          )}

          {/* Botão de Inserir Macro (Disponível em ambos os modos) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMacroInputOpen(!macroInputOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600/90 to-purple-600/90 hover:from-indigo-600 hover:to-purple-600 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 border border-indigo-400/30 transition-all"
              title="Inserir macro dinâmica que será solicitada ao preencher o card"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>+ Inserir Macro</span>
            </button>

            {macroInputOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-[#0c1222] border border-slate-200 dark:border-indigo-500/40 rounded-2xl shadow-2xl p-3 z-50 animate-in fade-in slide-in-from-top-2 text-slate-800 dark:text-slate-200">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    Inserir Variável / Macro
                  </span>
                  <button
                    type="button"
                    onClick={() => setMacroInputOpen(false)}
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nome da Macro:
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Título da Demanda, Critérios..."
                      value={newMacroName}
                      onChange={(e) => setNewMacroName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleInsertMacro(newMacroName);
                        }
                      }}
                      autoFocus
                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleInsertMacro(newMacroName)}
                    disabled={!newMacroName.trim()}
                    className="w-full py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30"
                  >
                    Inserir {newMacroName.trim() ? `{{${newMacroName.trim()}}}` : 'Macro'}
                  </button>

                  {/* Sugestões rápidas */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="block text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider mb-1.5">
                      Sugestões comuns:
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
                      {COMMON_MACROS.map((macro) => (
                        <button
                          key={macro}
                          type="button"
                          onClick={() => handleInsertMacro(macro)}
                          className="px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800/90 dark:hover:bg-indigo-600/40 text-slate-700 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-200 border border-slate-200 hover:border-indigo-300 dark:border-slate-700/60 dark:hover:border-indigo-500/40 text-[10px] font-mono transition-all"
                        >
                          +{macro}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Editor Content Area */}
      <div className="p-4 bg-white dark:bg-slate-950/90">
        {mode === 'visual' ? (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleVisualInput}
            onBlur={handleVisualInput}
            className="w-full outline-none text-slate-800 dark:text-slate-200 text-sm leading-relaxed focus:ring-0 font-sans selection:bg-indigo-500/30"
            style={{ minHeight }}
            data-placeholder={placeholder}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent outline-none text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-mono leading-relaxed resize-y focus:ring-0 selection:bg-indigo-500/30"
            style={{ minHeight }}
          />
        )}
      </div>

      {/* Footer / Helper Note */}
      <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
          <span>
            {mode === 'visual'
              ? 'Modo Visual ativado. Formate o texto com a barra de ferramentas como no Word.'
              : 'Modo Código Markdown ativado. Escreva sintaxe Markdown pura.'}
          </span>
        </div>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
          Variáveis: <code className="text-indigo-600 dark:text-indigo-400">{'{{macro}}'}</code>
        </span>
      </div>
    </div>
  );
};
