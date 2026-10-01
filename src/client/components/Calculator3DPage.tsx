import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Zap,
  Clock,
  DollarSign,
  Coins,
  Percent,
  Calculator,
  Share2,
  Check,
  Copy,
  ArrowLeft,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Sun,
  Moon,
  Info,
  Scale,
  Package,
  Receipt,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

// Chaves do localStorage para manter no cache do navegador
const STORAGE_KEY_PRINTER_POWER = 'taskls_calc3d_printer_power';
const STORAGE_KEY_KWH_PRICE = 'taskls_calc3d_kwh_price';
const STORAGE_KEY_TAX_PERCENT = 'taskls_calc3d_tax_percent';

// Opções pré-definidas para compor os custos adicionais
const ADDITIONAL_COST_OPTIONS = [
  'Acessórios (Argola de Chaveiro, Imã, Cordão)',
  'Embalagem Individual',
  'Embalagem Final',
  'Papelaria',
  'Material de Acabamento',
  'Outro',
] as const;

interface CalculationResult {
  filamentCost: number;
  energyCost: number;
  laborCost: number;
  totalCost: number;
  profitAmount: number;
  baseSalePrice: number;
  additionalCost: number;
  priceBeforeTax: number;
  taxAmount: number;
  finalPrice: number;
  calculated: boolean;
}

interface Calculator3DPageProps {
  onNavigateHome?: () => void;
}

export const Calculator3DPage: React.FC<Calculator3DPageProps> = ({ onNavigateHome }) => {
  const { setTheme, resolvedTheme } = useTheme();
  const { isAuthenticated } = useAuth();

  // 1. Filamento
  const [filamentPrice, setFilamentPrice] = useState<string>('89,90');
  const [filamentQty, setFilamentQty] = useState<string>('150');

  // 2. Energia e Tempo (com persistência no cache do navegador)
  const [printerPower, setPrinterPower] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_PRINTER_POWER) || '350';
  });
  const [printTime, setPrintTime] = useState<string>('1,5');
  const [kwhPrice, setKwhPrice] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_KWH_PRICE) || '0,85';
  });

  // 3. Mão de Obra (desmembrado: por hora OU total, mutuamente exclusivos - padrão: Valor Total Fixo)
  const [laborMode, setLaborMode] = useState<'hourly' | 'total'>('total');
  const [laborCostHourly, setLaborCostHourly] = useState<string>('');
  const [laborCostTotal, setLaborCostTotal] = useState<string>('50,00');

  // 4. Margem de Lucro (%)
  const [profitMargin, setProfitMargin] = useState<string>('50');

  // 5. Custos Adicionais (valor único + lista de composição)
  const [additionalCost, setAdditionalCost] = useState<string>('');
  const [additionalCostItems, setAdditionalCostItems] = useState<string[]>([]);
  const [additionalCostOtherText, setAdditionalCostOtherText] = useState<string>('');

  // 6. Alíquota de Imposto (%) - salva no localStorage para persistência de alíquota do negócio
  const [taxPercent, setTaxPercent] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_TAX_PERCENT) || '';
  });

  // Estado do cálculo e erros de validação
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [hasCalculated, setHasCalculated] = useState(false);

  // Armazena no cache do navegador quando o consumo da impressora é alterado
  const handlePrinterPowerChange = (value: string) => {
    setPrinterPower(value);
    localStorage.setItem(STORAGE_KEY_PRINTER_POWER, value);
    if (errors.printerPower) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.printerPower;
        return next;
      });
    }
  };

  // Armazena no cache do navegador quando o valor do kWh é alterado
  const handleKwhPriceChange = (value: string) => {
    setKwhPrice(value);
    localStorage.setItem(STORAGE_KEY_KWH_PRICE, value);
    if (errors.kwhPrice) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.kwhPrice;
        return next;
      });
    }
  };

  // Armazena no cache do navegador quando o % de imposto é alterado
  const handleTaxPercentChange = (value: string) => {
    setTaxPercent(value);
    localStorage.setItem(STORAGE_KEY_TAX_PERCENT, value);
    if (errors.taxPercent) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.taxPercent;
        return next;
      });
    }
  };

  // Alterna a seleção de itens de custos adicionais
  const handleToggleAdditionalItem = (option: string) => {
    setAdditionalCostItems((prev) => {
      if (prev.includes(option)) {
        return prev.filter((item) => item !== option);
      } else {
        return [...prev, option];
      }
    });
  };

  // Helpers para conversão numérica (suporta formato brasileiro com vírgula e ponto)
  const parsePtBrNumber = (val: string): number => {
    if (!val) return NaN;
    const clean = val.trim().replace(/\./g, '').replace(',', '.');
    const num = Number(clean);
    return Number.isFinite(num) ? num : NaN;
  };

  const formatCurrency = (val: number): string => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  // Rótulos formatados dos itens de composição dos custos adicionais selecionados
  const selectedCompositionLabels = useMemo(() => {
    return additionalCostItems.map((item) => {
      if (item === 'Outro' && additionalCostOtherText.trim()) {
        return `Outro (${additionalCostOtherText.trim()})`;
      }
      return item;
    });
  }, [additionalCostItems, additionalCostOtherText]);

  // Alterna o modo da mão de obra garantindo exclusividade mútua estrita
  const handleSelectLaborMode = (mode: 'hourly' | 'total') => {
    setLaborMode(mode);
    if (mode === 'hourly') {
      setLaborCostTotal('');
      if (!laborCostHourly) setLaborCostHourly('25,00');
    } else {
      setLaborCostHourly('');
      if (!laborCostTotal) setLaborCostTotal('50,00');
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next.labor;
      return next;
    });
  };

  // Quando o usuário digita na Mão de obra por hora
  const handleHourlyLaborInput = (val: string) => {
    setLaborMode('hourly');
    setLaborCostHourly(val);
    setLaborCostTotal(''); // Zera o total para nunca estarem ambos preenchidos
    if (errors.labor) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.labor;
        return next;
      });
    }
  };

  // Quando o usuário digita na Mão de obra total
  const handleTotalLaborInput = (val: string) => {
    setLaborMode('total');
    setLaborCostTotal(val);
    setLaborCostHourly(''); // Zera o por hora para nunca estarem ambos preenchidos
    if (errors.labor) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.labor;
        return next;
      });
    }
  };

  // Validação dos campos
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    const fPrice = parsePtBrNumber(filamentPrice);
    if (isNaN(fPrice) || fPrice <= 0) {
      newErrors.filamentPrice = 'Informe um preço válido para o filamento';
    }

    const fQty = parsePtBrNumber(filamentQty);
    if (isNaN(fQty) || fQty <= 0) {
      newErrors.filamentQty = 'Informe a quantidade utilizada em gramas';
    }

    const pPower = parsePtBrNumber(printerPower);
    if (isNaN(pPower) || pPower < 0) {
      newErrors.printerPower = 'Informe o consumo da impressora em Watts';
    }

    const pTime = parsePtBrNumber(printTime);
    if (isNaN(pTime) || pTime <= 0) {
      newErrors.printTime = 'Informe o tempo de impressão em horas';
    }

    const kwh = parsePtBrNumber(kwhPrice);
    if (isNaN(kwh) || kwh < 0) {
      newErrors.kwhPrice = 'Informe o valor do kWh';
    }

    // Regra: Mão de obra por hora ou Mão de obra total (obrigatoriamente um e nunca ambos)
    if (laborMode === 'hourly') {
      const lHourly = parsePtBrNumber(laborCostHourly);
      if (isNaN(lHourly) || lHourly < 0) {
        newErrors.labor = 'Informe o valor da mão de obra por hora';
      }
    } else {
      const lTotal = parsePtBrNumber(laborCostTotal);
      if (isNaN(lTotal) || lTotal < 0) {
        newErrors.labor = 'Informe o valor total da mão de obra';
      }
    }

    const pMargin = parsePtBrNumber(profitMargin);
    if (isNaN(pMargin) || pMargin < 0 || pMargin > 1000) {
      newErrors.profitMargin = 'Informe uma margem de lucro válida (0% a 1000%)';
    }

    if (additionalCost.trim()) {
      const addCost = parsePtBrNumber(additionalCost);
      if (isNaN(addCost) || addCost < 0) {
        newErrors.additionalCost = 'Informe um valor válido para os custos adicionais';
      }
    }

    if (taxPercent.trim()) {
      const taxNum = parsePtBrNumber(taxPercent);
      if (isNaN(taxNum) || taxNum < 0 || taxNum > 100) {
        newErrors.taxPercent = 'Informe uma alíquota válida de imposto (0% a 100%)';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Motor de cálculo com Custos de Produção, Lucro, Custos Adicionais e Impostos
  const calculation: CalculationResult = useMemo(() => {
    const fPrice = parsePtBrNumber(filamentPrice) || 0;
    const fQty = parsePtBrNumber(filamentQty) || 0;
    const pPower = parsePtBrNumber(printerPower) || 0;
    const pTime = parsePtBrNumber(printTime) || 0;
    const kwh = parsePtBrNumber(kwhPrice) || 0;
    const pMargin = parsePtBrNumber(profitMargin) || 0;
    const addCost = parsePtBrNumber(additionalCost) || 0;
    const taxRate = parsePtBrNumber(taxPercent) || 0;

    // 1. Custo do Filamento: (Preço * Quantidade) / 1000
    const filamentCost = (fPrice * fQty) / 1000;

    // 2. Custo de Energia: (Consumo * Tempo * Valor kWh) / 1000
    const energyCost = (pPower * pTime * kwh) / 1000;

    // 3. Mão de Obra: por hora * tempo OU valor total fixo
    let laborCost = 0;
    if (laborMode === 'hourly') {
      const lHourly = parsePtBrNumber(laborCostHourly) || 0;
      laborCost = lHourly * pTime;
    } else {
      laborCost = parsePtBrNumber(laborCostTotal) || 0;
    }

    // 4. Custo Total de Produção
    const totalCost = filamentCost + energyCost + laborCost;

    // 5. Lucro sobre a produção
    const profitAmount = totalCost * (pMargin / 100);
    const baseSalePrice = totalCost + profitAmount;

    // 6. Preço de venda com custos adicionais adicionados
    // Regra: "Esse valor deverá ser adicionado ao 'Preço de venda recomendado'"
    const priceBeforeTax = baseSalePrice + addCost;

    // 7. Imposto sobre o Preço de Venda Recomendado
    // Regra: "Deverá também permitir incluir um % de imposto, que deverá ser calculado sobre o 'Preço de venda recomendado' e adicionado nesse mesmo preço."
    const taxAmount = priceBeforeTax * (taxRate / 100);

    // 8. Preço Final de Venda Recomendado
    const finalPrice = priceBeforeTax + taxAmount;

    return {
      filamentCost,
      energyCost,
      laborCost,
      totalCost,
      profitAmount,
      baseSalePrice,
      additionalCost: addCost,
      priceBeforeTax,
      taxAmount,
      finalPrice,
      calculated: totalCost > 0 || addCost > 0,
    };
  }, [
    filamentPrice,
    filamentQty,
    printerPower,
    printTime,
    kwhPrice,
    laborMode,
    laborCostHourly,
    laborCostTotal,
    profitMargin,
    additionalCost,
    taxPercent,
  ]);

  const handleCalculate = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      setHasCalculated(true);
      const resEl = document.getElementById('calc3d-result-card');
      if (resEl) {
        resEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const handleCopyPublicLink = () => {
    const url = `${window.location.origin}/calculadora-3d`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleCopySummary = () => {
    const lines: string[] = [
      '🖨️ *Orçamento de Impressão 3D*',
      `• Custo do Filamento: ${formatCurrency(calculation.filamentCost)}`,
      `• Custo de Energia: ${formatCurrency(calculation.energyCost)}`,
      `• Mão de Obra: ${formatCurrency(calculation.laborCost)}`,
      `• Custo Total de Produção (peça 3D): ${formatCurrency(calculation.totalCost)}`,
      `• Margem de Lucro (${profitMargin || '0'}%): + ${formatCurrency(calculation.profitAmount)}`,
    ];

    if (calculation.additionalCost > 0) {
      const compText = selectedCompositionLabels.length > 0 
        ? ` (${selectedCompositionLabels.join(', ')})` 
        : '';
      lines.push(`• Custos Adicionais: + ${formatCurrency(calculation.additionalCost)}${compText}`);
    }

    if (calculation.taxAmount > 0) {
      lines.push(`• Imposto sobre a Venda (${taxPercent}%): + ${formatCurrency(calculation.taxAmount)}`);
    }

    lines.push('──────────────────────────────');
    lines.push(`💰 *Preço de Venda Recomendado: ${formatCurrency(calculation.finalPrice)}*`);

    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      {/* Barra de Topo / Navegação Pública */}
      <nav className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Box className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm tracking-tight text-white">TaskLS</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Acesso Livre
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Calculadora de Custo de Impressão 3D</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Botão de Compartilhar / Copiar Link */}
            <button
              type="button"
              onClick={handleCopyPublicLink}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all shadow-sm active:scale-95"
              title="Copiar link público da calculadora"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Link Copiado!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Compartilhar</span>
                </>
              )}
            </button>

            {/* Alternador de Tema */}
            <button
              type="button"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all shadow-sm"
              title={`Alternar para tema ${resolvedTheme === 'dark' ? 'claro' : 'escuro'}`}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-400" />
              )}
            </button>

            {/* Botão para ir ao App ou Login */}
            <button
              type="button"
              onClick={() => {
                if (onNavigateHome) {
                  onNavigateHome();
                } else {
                  window.location.href = '/';
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isAuthenticated ? 'Voltar ao TaskLS' : 'Entrar no Sistema'}</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 space-y-6">
        {/* Card Principal da Calculadora */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header estilizado (idêntico ao calculo3d.com.br com gradiente indigo) */}
          <header className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 p-6 sm:p-8 text-white relative overflow-hidden">
            <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center space-x-4 relative z-10">
              <div className="bg-white/15 p-3.5 rounded-2xl shadow-inner border border-white/20">
                <Calculator className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-white tracking-tight">
                  Calculadora de Custo de Impressão 3D
                </h1>
                <p className="text-indigo-100 text-xs sm:text-sm mt-1">
                  Simule custos de filamento, energia e mão de obra para precificar suas impressões 3D
                </p>
              </div>
            </div>
          </header>

          {/* Formulário de Cálculo */}
          <form onSubmit={handleCalculate} className="p-6 sm:p-8 space-y-8">
            {/* SEÇÃO 1: FILAMENTO */}
            <section aria-labelledby="section-filament">
              <div className="flex items-center space-x-3 mb-4 pb-2 border-b border-slate-700/60">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Scale className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="section-filament" className="text-base font-bold text-white">
                    Filamento
                  </h2>
                  <p className="text-[11px] text-slate-400">Dados do carretel e consumo da peça</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Preço do filamento por quilo */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5" htmlFor="filament-price">
                    Preço do filamento por quilo (R$/kg) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      id="filament-price"
                      type="text"
                      inputMode="decimal"
                      value={filamentPrice}
                      onChange={(e) => {
                        setFilamentPrice(e.target.value);
                        if (errors.filamentPrice) {
                          setErrors((prev) => {
                            const n = { ...prev };
                            delete n.filamentPrice;
                            return n;
                          });
                        }
                      }}
                      placeholder="Ex: 89,90"
                      className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border ${
                        errors.filamentPrice
                          ? 'border-rose-500 ring-1 ring-rose-500'
                          : 'border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      } text-white text-xs font-bold focus:outline-none transition-all`}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Preço médio: R$ 80 - 140/kg</span>
                  {errors.filamentPrice && (
                    <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                      {errors.filamentPrice}
                    </span>
                  )}
                </div>

                {/* Quantidade utilizada */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5" htmlFor="filament-qty">
                    Quantidade utilizada (gramas) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="filament-qty"
                      type="text"
                      inputMode="numeric"
                      value={filamentQty}
                      onChange={(e) => {
                        setFilamentQty(e.target.value);
                        if (errors.filamentQty) {
                          setErrors((prev) => {
                            const n = { ...prev };
                            delete n.filamentQty;
                            return n;
                          });
                        }
                      }}
                      placeholder="Ex: 150"
                      className={`w-full pl-3 pr-9 py-2.5 rounded-xl bg-slate-900 border ${
                        errors.filamentQty
                          ? 'border-rose-500 ring-1 ring-rose-500'
                          : 'border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      } text-white text-xs font-bold focus:outline-none transition-all`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      g
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Em gramas (ex: 1000g = 1kg)</span>
                  {errors.filamentQty && (
                    <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                      {errors.filamentQty}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* SEÇÃO 2: ENERGIA E TEMPO */}
            <section aria-labelledby="section-energy">
              <div className="flex items-center space-x-3 mb-4 pb-2 border-b border-slate-700/60">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="section-energy" className="text-base font-bold text-white">
                    Energia e Tempo
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    O consumo e o valor do kWh são salvos no cache do navegador para consultas futuras
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Consumo da impressora (Gravado no localStorage) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300" htmlFor="printer-power">
                      Consumo da impressora <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-1 rounded border border-indigo-500/20" title="Valor salvo no cache do navegador">
                      Auto-salvo
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      id="printer-power"
                      type="text"
                      inputMode="numeric"
                      value={printerPower}
                      onChange={(e) => handlePrinterPowerChange(e.target.value)}
                      placeholder="Ex: 350"
                      className={`w-full pl-3 pr-9 py-2.5 rounded-xl bg-slate-900 border ${
                        errors.printerPower
                          ? 'border-rose-500 ring-1 ring-rose-500'
                          : 'border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      } text-white text-xs font-bold focus:outline-none transition-all`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      W
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Potência média: 200 - 500W</span>
                  {errors.printerPower && (
                    <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                      {errors.printerPower}
                    </span>
                  )}
                </div>

                {/* Tempo de impressão */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5" htmlFor="print-time">
                    Tempo de impressão <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      id="print-time"
                      type="text"
                      inputMode="decimal"
                      value={printTime}
                      onChange={(e) => {
                        setPrintTime(e.target.value);
                        if (errors.printTime) {
                          setErrors((prev) => {
                            const n = { ...prev };
                            delete n.printTime;
                            return n;
                          });
                        }
                      }}
                      placeholder="Ex: 1,5"
                      className={`w-full pl-3 pr-9 py-2.5 rounded-xl bg-slate-900 border ${
                        errors.printTime
                          ? 'border-rose-500 ring-1 ring-rose-500'
                          : 'border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      } text-white text-xs font-bold focus:outline-none transition-all`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      h
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Aceita vírgula ou ponto (ex: 1,5)</span>
                  {errors.printTime && (
                    <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                      {errors.printTime}
                    </span>
                  )}
                </div>

                {/* Valor do kWh (Gravado no localStorage) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300" htmlFor="kwh-price">
                      Valor do kWh <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[9px] font-bold text-indigo-400 bg-indigo-500/10 px-1 rounded border border-indigo-500/20" title="Valor salvo no cache do navegador">
                      Auto-salvo
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      R$
                    </span>
                    <input
                      id="kwh-price"
                      type="text"
                      inputMode="decimal"
                      value={kwhPrice}
                      onChange={(e) => handleKwhPriceChange(e.target.value)}
                      placeholder="Ex: 0,85"
                      className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border ${
                        errors.kwhPrice
                          ? 'border-rose-500 ring-1 ring-rose-500'
                          : 'border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                      } text-white text-xs font-bold focus:outline-none transition-all`}
                    />
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Média Brasil: R$ 0,80 - R$ 0,95</span>
                  {errors.kwhPrice && (
                    <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                      {errors.kwhPrice}
                    </span>
                  )}
                </div>
              </div>
            </section>

            {/* SEÇÃO 3: CUSTO E LUCRO (Mão de obra desmembrada com exclusividade mútua) */}
            <section aria-labelledby="section-cost-profit">
              <div className="flex items-center space-x-3 mb-4 pb-2 border-b border-slate-700/60">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="section-cost-profit" className="text-base font-bold text-white">
                    Mão de Obra e Lucro
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Defina o valor da mão de obra (por hora ou fixo total) e a margem desejada
                  </p>
                </div>
              </div>

              {/* Seletor de Modo de Mão de Obra */}
              <div className="mb-4 p-3 rounded-xl bg-slate-900/80 border border-slate-700/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <span>Modalidade de Mão de Obra:</span>
                    <span className="text-[10px] font-normal text-amber-400">
                      (Obrigatório preencher um ou outro, nunca ambos)
                    </span>
                  </span>

                  <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleSelectLaborMode('total')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        laborMode === 'total'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Valor Total Fixo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectLaborMode('hourly')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                        laborMode === 'hourly'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Por Hora
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* Campo 1: Mão de obra total (Padrão) */}
                  <div className={`p-2.5 rounded-xl border transition-all ${
                    laborMode === 'total'
                      ? 'bg-indigo-950/20 border-indigo-500/40'
                      : 'bg-slate-900/40 border-slate-800 opacity-60'
                  }`}>
                    <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="labor-cost-total">
                      Mão de obra total {laborMode === 'total' && <span className="text-indigo-400 font-normal">(Ativo - Padrão)</span>}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        R$
                      </span>
                      <input
                        id="labor-cost-total"
                        type="text"
                        inputMode="decimal"
                        value={laborCostTotal}
                        onChange={(e) => handleTotalLaborInput(e.target.value)}
                        placeholder="Ex: 50,00"
                        disabled={laborMode === 'hourly'}
                        className={`w-full pl-9 pr-14 py-2 rounded-lg bg-slate-900 border ${
                          laborMode === 'total' && errors.labor
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                        } text-white text-xs font-bold focus:outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        fixo
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Valor fixo fechado de serviço para esta peça
                    </span>
                  </div>

                  {/* Campo 2: Mão de obra por hora */}
                  <div className={`p-2.5 rounded-xl border transition-all ${
                    laborMode === 'hourly'
                      ? 'bg-indigo-950/20 border-indigo-500/40'
                      : 'bg-slate-900/40 border-slate-800 opacity-60'
                  }`}>
                    <label className="block text-xs font-bold text-slate-300 mb-1" htmlFor="labor-cost-hourly">
                      Mão de obra por hora {laborMode === 'hourly' && <span className="text-indigo-400 font-normal">(Ativo)</span>}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        R$
                      </span>
                      <input
                        id="labor-cost-hourly"
                        type="text"
                        inputMode="decimal"
                        value={laborCostHourly}
                        onChange={(e) => handleHourlyLaborInput(e.target.value)}
                        placeholder="Ex: 25,00"
                        disabled={laborMode === 'total'}
                        className={`w-full pl-9 pr-12 py-2 rounded-lg bg-slate-900 border ${
                          laborMode === 'hourly' && errors.labor
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                        } text-white text-xs font-bold focus:outline-none transition-all disabled:opacity-40 disabled:cursor-not-allowed`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        /h
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Multiplicado pelo tempo de impressão ({printTime || '0'}h)
                    </span>
                  </div>
                </div>

                {errors.labor && (
                  <span className="text-[11px] text-rose-400 mt-2 block font-medium">
                    {errors.labor}
                  </span>
                )}
              </div>

              {/* Margem de Lucro */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5" htmlFor="profit-margin">
                  Margem de lucro (%) <span className="text-rose-500">*</span>
                </label>
                <div className="relative max-w-xs">
                  <input
                    id="profit-margin"
                    type="text"
                    inputMode="numeric"
                    value={profitMargin}
                    onChange={(e) => {
                      setProfitMargin(e.target.value);
                      if (errors.profitMargin) {
                        setErrors((prev) => {
                          const n = { ...prev };
                          delete n.profitMargin;
                          return n;
                        });
                      }
                    }}
                    placeholder="Ex: 50"
                    className={`w-full pl-3 pr-9 py-2.5 rounded-xl bg-slate-900 border ${
                      errors.profitMargin
                        ? 'border-rose-500 ring-1 ring-rose-500'
                        : 'border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                    } text-white text-xs font-bold focus:outline-none transition-all`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    %
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 mt-1 block">Recomendado no mercado 3D: 30% a 80%</span>
                {errors.profitMargin && (
                  <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                    {errors.profitMargin}
                  </span>
                )}
              </div>
            </section>

            {/* SEÇÃO 4: CUSTOS ADICIONAIS E IMPOSTOS */}
            <section aria-labelledby="section-additional-costs">
              <div className="flex items-center space-x-3 mb-4 pb-2 border-b border-slate-700/60">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="section-additional-costs" className="text-base font-bold text-white">
                    Custos Adicionais e Impostos
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Acessórios, embalagens, acabamentos e alíquota de impostos sobre a venda
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                {/* Inputs de Valor Único e Alíquota de Imposto em Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Valor dos Custos Adicionais */}
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5" htmlFor="additional-cost">
                      Valor dos custos adicionais (R$)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        R$
                      </span>
                      <input
                        id="additional-cost"
                        type="text"
                        inputMode="decimal"
                        value={additionalCost}
                        onChange={(e) => {
                          setAdditionalCost(e.target.value);
                          if (errors.additionalCost) {
                            setErrors((prev) => {
                              const n = { ...prev };
                              delete n.additionalCost;
                              return n;
                            });
                          }
                        }}
                        placeholder="Ex: 15,00"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border ${
                          errors.additionalCost
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                        } text-white text-xs font-bold focus:outline-none transition-all`}
                      />
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Valor único adicionado ao preço de venda recomendado
                    </span>
                    {errors.additionalCost && (
                      <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                        {errors.additionalCost}
                      </span>
                    )}
                  </div>

                  {/* Alíquota de Imposto (%) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-300" htmlFor="tax-percent">
                        Alíquota de imposto (%)
                      </label>
                      <span
                        className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 px-1 rounded border border-cyan-500/20"
                        title="Valor salvo no cache do navegador"
                      >
                        Auto-salvo
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        id="tax-percent"
                        type="text"
                        inputMode="decimal"
                        value={taxPercent}
                        onChange={(e) => handleTaxPercentChange(e.target.value)}
                        placeholder="Ex: 6"
                        className={`w-full pl-3 pr-9 py-2.5 rounded-xl bg-slate-900 border ${
                          errors.taxPercent
                            ? 'border-rose-500 ring-1 ring-rose-500'
                            : 'border-slate-700 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                        } text-white text-xs font-bold focus:outline-none transition-all`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        %
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Calculado sobre o preço de venda e somado ao preço final
                    </span>
                    {errors.taxPercent && (
                      <span className="text-[11px] text-rose-400 mt-1 block font-medium">
                        {errors.taxPercent}
                      </span>
                    )}
                  </div>
                </div>

                {/* Composição do Custo Adicional (Listbox Interativa) */}
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-800">
                    <div>
                      <span className="text-xs font-bold text-slate-200 block">
                        O que compõe esse valor de custos adicionais?
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Selecione as opções que compõem o valor informado acima
                      </span>
                    </div>
                    {additionalCostItems.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-full">
                          {additionalCostItems.length} {additionalCostItems.length === 1 ? 'item selecionado' : 'itens selecionados'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setAdditionalCostItems([]);
                            setAdditionalCostOtherText('');
                          }}
                          className="text-[10px] text-slate-400 hover:text-slate-200 underline transition-colors"
                        >
                          Limpar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Listbox com as opções */}
                  <div
                    role="listbox"
                    aria-multiselectable="true"
                    aria-label="Opções que compõem o custo adicional"
                    className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                  >
                    {ADDITIONAL_COST_OPTIONS.map((option) => {
                      const isSelected = additionalCostItems.includes(option);
                      return (
                        <div
                          key={option}
                          role="option"
                          aria-selected={isSelected}
                          tabIndex={0}
                          onClick={() => handleToggleAdditionalItem(option)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              handleToggleAdditionalItem(option);
                            }
                          }}
                          className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs cursor-pointer select-none transition-all ${
                            isSelected
                              ? 'bg-cyan-950/30 border-cyan-500/60 text-white shadow-sm'
                              : 'bg-slate-900/50 border-slate-800/80 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                          }`}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-cyan-400" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={`block font-medium ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                              {option}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Campo de Texto para a opção 'Outro' quando selecionada */}
                  {additionalCostItems.includes('Outro') && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <label
                        className="block text-xs font-bold text-cyan-300 mb-1.5"
                        htmlFor="additional-other-text"
                      >
                        Descreva o outro custo adicional <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        id="additional-other-text"
                        type="text"
                        value={additionalCostOtherText}
                        onChange={(e) => setAdditionalCostOtherText(e.target.value)}
                        placeholder="Ex: Fita de cetim decorativa, tag metálica gravada a laser, adesivo personalizado..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-cyan-500/50 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-white text-xs font-medium focus:outline-none transition-all placeholder:text-slate-500"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* BOTÃO CALCULAR */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 px-6 rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 shadow-xl shadow-indigo-600/30 active:scale-[0.99] cursor-pointer"
                id="calculate-btn"
              >
                <Calculator className="w-5 h-5" />
                <span className="text-sm">Calcular Custo da Impressão</span>
              </button>
            </div>
          </form>

          {/* SEÇÃO DE RESULTADOS */}
          <div
            id="calc3d-result-card"
            className="border-t border-slate-700 bg-slate-950/70 p-6 sm:p-8 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Resultado do Cálculo</h3>
                  <p className="text-xs text-slate-400">Detalhamento dos custos operacionais, adicionais e preço final sugerido</p>
                </div>
              </div>

              {/* Botão de Copiar Resumo / Orçamento */}
              <button
                type="button"
                onClick={handleCopySummary}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all shadow-sm active:scale-95 self-start sm:self-auto"
                title="Copiar resumo do orçamento formatado para a área de transferência"
              >
                {copiedSummary ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Copiar Orçamento</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-3">
              {/* Custo do Filamento */}
              <div className="flex justify-between items-center py-2.5 border-b border-slate-800 text-xs sm:text-sm">
                <span className="text-slate-300 font-medium">Custo do filamento</span>
                <span className="font-mono font-bold text-white">
                  {formatCurrency(calculation.filamentCost)}
                </span>
              </div>

              {/* Custo de Energia */}
              <div className="flex justify-between items-center py-2.5 border-b border-slate-800 text-xs sm:text-sm">
                <span className="text-slate-300 font-medium">Custo de energia</span>
                <span className="font-mono font-bold text-white">
                  {formatCurrency(calculation.energyCost)}
                </span>
              </div>

              {/* Custo de Mão de Obra */}
              <div className="flex justify-between items-center py-2.5 border-b border-slate-800 text-xs sm:text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-300 font-medium">Custo de mão de obra</span>
                  <span className="text-[10px] text-slate-500">
                    ({laborMode === 'hourly' ? 'por hora' : 'valor total fixo'})
                  </span>
                </div>
                <span className="font-mono font-bold text-white">
                  {formatCurrency(calculation.laborCost)}
                </span>
              </div>

              {/* Custo Total de Produção */}
              <div className="flex justify-between items-center py-3 border-t-2 border-b border-slate-700/80 text-sm sm:text-base">
                <span className="text-white font-bold">Custo total de produção (peça 3D)</span>
                <span className="font-mono font-black text-indigo-300">
                  {formatCurrency(calculation.totalCost)}
                </span>
              </div>

              {/* Margem de Lucro */}
              <div className="flex justify-between items-center py-2.5 border-b border-slate-800 text-xs sm:text-sm">
                <span className="text-slate-300 font-medium">Margem de lucro ({profitMargin || '0'}%)</span>
                <span className="font-mono font-bold text-emerald-400">
                  + {formatCurrency(calculation.profitAmount)}
                </span>
              </div>

              {/* Custos Adicionais (se informado) */}
              {calculation.additionalCost > 0 && (
                <div className="py-2.5 border-b border-slate-800 text-xs sm:text-sm space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Custos adicionais</span>
                    </span>
                    <span className="font-mono font-bold text-cyan-300">
                      + {formatCurrency(calculation.additionalCost)}
                    </span>
                  </div>

                  {selectedCompositionLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {selectedCompositionLabels.map((lbl, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-950/60 text-cyan-300 border border-cyan-800/60"
                        >
                          {lbl}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Subtotal antes dos Impostos (quando há imposto ou adicionais) */}
              {(calculation.taxAmount > 0 || calculation.additionalCost > 0) && (
                <div className="flex justify-between items-center py-2 border-b border-slate-800/80 text-xs text-slate-400">
                  <span>Subtotal recomendado (produção + lucro + adicionais)</span>
                  <span className="font-mono font-semibold text-slate-300">
                    {formatCurrency(calculation.priceBeforeTax)}
                  </span>
                </div>
              )}

              {/* Imposto sobre a Venda (se informado) */}
              {calculation.taxAmount > 0 && (
                <div className="flex justify-between items-center py-2.5 border-b border-slate-800 text-xs sm:text-sm">
                  <span className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Receipt className="w-3.5 h-3.5 text-amber-400" />
                    <span>Imposto sobre a venda ({taxPercent}%)</span>
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    + {formatCurrency(calculation.taxAmount)}
                  </span>
                </div>
              )}

              {/* Preço de Venda com Lucro (Destaque Esmeralda) */}
              <div className="bg-gradient-to-r from-emerald-950/40 via-emerald-900/30 to-teal-950/40 border border-emerald-500/40 rounded-2xl p-4 sm:p-5 shadow-lg shadow-emerald-950/20 mt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="block text-xs uppercase tracking-wider font-bold text-emerald-400">
                      Preço de venda recomendado
                    </span>
                    <span className="text-xs text-emerald-200/80">
                      Com margem de lucro de {profitMargin || '0'}%
                      {calculation.additionalCost > 0 ? ` + adicionais (${formatCurrency(calculation.additionalCost)})` : ''}
                      {calculation.taxAmount > 0 ? ` + imposto (${taxPercent}%)` : ''}
                    </span>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-400 tracking-tight">
                    {formatCurrency(calculation.finalPrice)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-6 px-4 text-center text-xs text-slate-500 mt-10">
        <p>
          Calculadora de Impressão 3D &bull; TaskLS Platform &bull; Acesso livre e sem necessidade de autenticação.
        </p>
      </footer>
    </div>
  );
};
