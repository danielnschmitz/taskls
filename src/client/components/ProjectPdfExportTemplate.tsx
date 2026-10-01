import React, { useMemo } from 'react';
import { format, parseISO, differenceInCalendarDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ScheduledPlanItem, ProjectSettings } from '../types';
import { SYSMIDDLE_LOGO_BASE64, SYSMIDDLE_ICON_BASE64 } from '../utils/sysmiddleBrand';
import { isWorkingDay } from '../utils/projectScheduling';

interface ProjectPdfExportTemplateProps {
  projectName: string;
  items: ScheduledPlanItem[];
  settings: ProjectSettings;
  holidaySet: Set<string>;
  isClientView: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const ProjectPdfExportTemplate: React.FC<ProjectPdfExportTemplateProps> = ({
  projectName,
  items,
  settings,
  holidaySet,
  isClientView,
  containerRef,
}) => {
  const todayStr = useMemo(() => format(new Date(), 'dd/MM/yyyy'), []);

  // 1. Calculate project timeline bounds and unique working days
  const { minStartDate, maxEndDate, workingDays, totalWorkingDays } = useMemo(() => {
    if (items.length === 0) {
      return {
        minStartDate: format(new Date(), 'yyyy-MM-dd'),
        maxEndDate: format(new Date(), 'yyyy-MM-dd'),
        workingDays: [],
        totalWorkingDays: 0,
      };
    }

    let minStart = items[0].start_date;
    let maxEnd = items[0].end_date;

    for (const it of items) {
      if (it.start_date < minStart) minStart = it.start_date;
      if (it.end_date > maxEnd) maxEnd = it.end_date;
    }

    const startD = parseISO(minStart);
    const endD = parseISO(maxEnd);
    const diffDays = Math.max(0, differenceInCalendarDays(endD, startD));

    const wDays: Array<{
      dateStr: string;
      dayMonth: string;
      weekdayLabel: string;
      isToday: boolean;
      dateObj: Date;
    }> = [];

    const todayYMD = format(new Date(), 'yyyy-MM-dd');

    for (let i = 0; i <= diffDays; i++) {
      const curr = addDays(startD, i);
      if (isWorkingDay(curr, holidaySet)) {
        const dStr = format(curr, 'yyyy-MM-dd');
        const isToday = dStr === todayYMD;

        // Weekday abbreviation formatted like 'Sex', 'Seg', 'Qui (hoje)'
        const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const shortWk = WEEKDAYS_SHORT[curr.getDay()] || 'Dia';
        const weekdayLabel = isToday ? `${shortWk} (hoje)` : shortWk;

        wDays.push({
          dateStr: dStr,
          dayMonth: format(curr, 'dd/MM'),
          weekdayLabel,
          isToday,
          dateObj: curr,
        });
      }
    }

    return {
      minStartDate: minStart,
      maxEndDate: maxEnd,
      workingDays: wDays,
      totalWorkingDays: wDays.length,
    };
  }, [items, holidaySet]);

  // 2. Channel distribution and labels
  const { canalDistributionStr, canalLabelStr } = useMemo(() => {
    let distCount = 0;
    let varejoCount = 0;

    for (const it of items) {
      const c = (it.metadata?.canal || '').toLowerCase().trim();
      if (c.includes('distrib')) {
        distCount++;
      } else if (c.includes('varejo')) {
        varejoCount++;
      }
    }

    if (distCount > 0 && varejoCount > 0) {
      return {
        canalDistributionStr: `${distCount} / ${varejoCount}`,
        canalLabelStr: 'distribuidor / varejo',
      };
    } else if (distCount > 0 || varejoCount > 0) {
      return {
        canalDistributionStr: distCount > 0 ? `${distCount}` : `${varejoCount}`,
        canalLabelStr: distCount > 0 ? 'distribuidor' : 'varejo',
      };
    }

    // Fallback if no specific channels are configured
    const uniqueAssignees = new Set(items.map((i) => i.assignee_name.trim())).size;
    return {
      canalDistributionStr: String(uniqueAssignees),
      canalLabelStr: uniqueAssignees === 1 ? 'executor ativo' : 'executores na equipe',
    };
  }, [items]);

  // Projected end date for card 2 (DD/MM)
  const previsaoTerminoStr = useMemo(() => {
    if (!maxEndDate) return '-';
    try {
      return format(parseISO(maxEndDate), 'dd/MM');
    } catch {
      return '-';
    }
  }, [maxEndDate]);

  // Subtitle date range
  const subtitleRangeStr = useMemo(() => {
    try {
      const s = format(parseISO(minStartDate), 'dd/MM');
      const e = format(parseISO(maxEndDate), 'dd/MM/yyyy');
      return `Dias úteis de ${s} a ${e}, com início e entrega de cada demanda`;
    } catch {
      return 'Dias úteis de execução, com início e entrega de cada demanda';
    }
  }, [minStartDate, maxEndDate]);

  // Weekend note in Gantt legend
  const weekendNote = useMemo(() => {
    for (let i = 0; i < workingDays.length - 1; i++) {
      const d1 = workingDays[i].dateObj;
      const d2 = workingDays[i + 1].dateObj;
      if (differenceInCalendarDays(d2, d1) > 1) {
        const s1 = workingDays[i].dayMonth;
        const s2 = workingDays[i + 1].dayMonth;
        return `Linha contínua entre ${s1} e ${s2} = fim de semana`;
      }
    }
    return 'Linha contínua = dias úteis consecutivos (fins de semana omitidos)';
  }, [workingDays]);

  // 3. Paginate Table and Gantt slides (up to 9 items per slide for optimal layout)
  const TABLE_PAGE_SIZE = 9;
  const GANTT_PAGE_SIZE = 9;

  const tableChunks = useMemo(() => {
    if (items.length === 0) return [[]];
    const chunks: ScheduledPlanItem[][] = [];
    for (let i = 0; i < items.length; i += TABLE_PAGE_SIZE) {
      chunks.push(items.slice(i, i + TABLE_PAGE_SIZE));
    }
    return chunks;
  }, [items]);

  const ganttChunks = useMemo(() => {
    if (items.length === 0) return [[]];
    const chunks: ScheduledPlanItem[][] = [];
    for (let i = 0; i < items.length; i += GANTT_PAGE_SIZE) {
      chunks.push(items.slice(i, i + GANTT_PAGE_SIZE));
    }
    return chunks;
  }, [items]);

  const totalPages = tableChunks.length + ganttChunks.length;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: 1024,
        zIndex: -9999,
        pointerEvents: 'none',
        opacity: 1,
        backgroundColor: '#ffffff',
      }}
    >
      {/* ------------------------------------------------------------- */}
      {/* SLIDE TYPE 1: DEMANDS LIST & SUMMARY KPIS                      */}
      {/* ------------------------------------------------------------- */}
      {tableChunks.map((chunk, pageIdx) => {
        const currentPageNum = pageIdx + 1;
        const isFirstPage = pageIdx === 0;

        return (
          <div
            key={`table-page-${pageIdx}`}
            className="pdf-export-slide"
            style={{
              width: 1024,
              height: 576,
              backgroundColor: '#ffffff',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              boxSizing: 'border-box',
              padding: '28px 44px 22px 48px',
            }}
          >
            {/* Left Brand Stripe */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 7,
                backgroundColor: '#0265b0',
              }}
            />

            {/* Subtle Watermark Loop Icon in Bottom Right */}
            <img
              src={SYSMIDDLE_ICON_BASE64}
              alt=""
              style={{
                position: 'absolute',
                right: -30,
                bottom: -40,
                width: 380,
                height: 380,
                objectFit: 'contain',
                opacity: 0.05,
                pointerEvents: 'none',
              }}
            />

            {/* Top Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <img
                src={SYSMIDDLE_LOGO_BASE64}
                alt="SysMiddle"
                style={{
                  height: 28,
                  width: 'auto',
                  objectFit: 'contain',
                }}
              />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                  {projectName}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  Atualizado em {todayStr}
                </div>
              </div>
            </div>

            {/* Title & Subtitle */}
            <div style={{ marginBottom: isFirstPage ? 14 : 18 }}>
              <h1
                style={{
                  fontSize: 23,
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Plano de Projeto & Cronograma
              </h1>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                Fila de implantações {projectName}: demandas, ERPs e datas de entrega
                {tableChunks.length > 1 ? ` (Parte ${pageIdx + 1})` : ''}
              </div>
            </div>

            {/* 4 KPI Summary Cards (rendered on first page) */}
            {isFirstPage && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 14,
                  marginBottom: 16,
                }}
              >
                {/* Card 1: Blue - Total de demandas */}
                <div
                  style={{
                    backgroundColor: '#0265b0',
                    borderRadius: 12,
                    padding: '11px 18px',
                    color: '#ffffff',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1 }}>{items.length}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 500, opacity: 0.9, marginTop: 4 }}>
                    demandas na fila
                  </div>
                </div>

                {/* Card 2: White - Previsão de término */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '11px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                    {previsaoTerminoStr}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b', marginTop: 4 }}>
                    previsão de término
                  </div>
                </div>

                {/* Card 3: White - Dias úteis de execução */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '11px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                    {totalWorkingDays}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b', marginTop: 4 }}>
                    dias úteis de execução
                  </div>
                </div>

                {/* Card 4: White - Distribuidor / Varejo */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '11px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                  }}
                >
                  <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                    {canalDistributionStr}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 500, color: '#64748b', marginTop: 4 }}>
                    {canalLabelStr}
                  </div>
                </div>
              </div>
            )}

            {/* Table */}
            <div style={{ flex: 1, minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr
                    style={{
                      borderTop: '1.5px solid #167fd0',
                      borderBottom: '1px solid #e2e8f0',
                      height: 25,
                    }}
                  >
                    <th style={{ width: '4%', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#167fd0', paddingLeft: 4 }}>
                      #
                    </th>
                    <th style={{ width: '10%', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#167fd0' }}>
                      Chave
                    </th>
                    <th style={{ width: '42%', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#167fd0' }}>
                      Demanda
                    </th>
                    <th style={{ width: '22%', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#167fd0' }}>
                      Indústria
                    </th>
                    <th style={{ width: '11%', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#167fd0' }}>
                      Canal
                    </th>
                    <th style={{ width: '11%', textAlign: 'right', fontSize: 10, fontWeight: 700, color: '#167fd0', paddingRight: 4 }}>
                      Entrega
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((item, idx) => {
                    const globalIdx = pageIdx * TABLE_PAGE_SIZE + idx + 1;
                    const c = (item.metadata?.canal || '').toLowerCase().trim();
                    const isDistribuidor = c.includes('distrib');
                    const isVarejo = c.includes('varejo');

                    let deliveryWk = '';
                    let deliveryDM = '';
                    try {
                      const dObj = parseISO(item.end_date);
                      const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                      deliveryWk = WEEKDAYS_SHORT[dObj.getDay()] || '';
                      deliveryDM = format(dObj, 'dd/MM');
                    } catch {
                      deliveryDM = item.end_date;
                    }

                    return (
                      <tr
                        key={item.id || item.issue_key}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          height: 27,
                        }}
                      >
                        <td style={{ fontSize: 10.5, color: '#94a3b8', paddingLeft: 4 }}>
                          {globalIdx}
                        </td>
                        <td style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>
                          {item.issue_key}
                        </td>
                        <td
                          style={{
                            fontSize: 10.5,
                            fontWeight: 500,
                            color: '#1e293b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            paddingRight: 10,
                          }}
                          title={item.summary}
                        >
                          {item.summary}
                        </td>
                        <td
                          style={{
                            fontSize: 10.5,
                            color: item.metadata?.industry ? '#334155' : '#94a3b8',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            paddingRight: 10,
                          }}
                        >
                          {item.metadata?.industry || '—'}
                        </td>
                        <td>
                          {isDistribuidor ? (
                            <span
                              style={{
                                backgroundColor: '#d6e8f8',
                                color: '#167fd0',
                                fontWeight: 700,
                                fontSize: 9,
                                padding: '2px 8px',
                                borderRadius: 9999,
                                display: 'inline-block',
                              }}
                            >
                              Distribuidor
                            </span>
                          ) : isVarejo ? (
                            <span
                              style={{
                                backgroundColor: '#185083',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: 9,
                                padding: '2px 8px',
                                borderRadius: 9999,
                                display: 'inline-block',
                              }}
                            >
                              Varejo
                            </span>
                          ) : item.metadata?.canal ? (
                            <span
                              style={{
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                fontWeight: 600,
                                fontSize: 9,
                                padding: '2px 8px',
                                borderRadius: 9999,
                                display: 'inline-block',
                              }}
                            >
                              {item.metadata.canal}
                            </span>
                          ) : (
                            <span style={{ color: '#cbd5e1', fontSize: 10 }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: 4, whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#64748b', fontSize: 10, marginRight: 4 }}>
                            {deliveryWk}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 11, color: '#0f172a' }}>
                            {deliveryDM}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 'auto',
                paddingTop: 8,
                fontSize: 9.5,
                color: '#94a3b8',
              }}
            >
              <div>SysMiddle | Integration as a Service</div>
              <div>{currentPageNum} / {totalPages}</div>
            </div>
          </div>
        );
      })}

      {/* ------------------------------------------------------------- */}
      {/* SLIDE TYPE 2: CRONOGRAMA DE EXECUÇÃO (GANTT)                  */}
      {/* ------------------------------------------------------------- */}
      {ganttChunks.map((chunk, gIdx) => {
        const currentPageNum = tableChunks.length + gIdx + 1;

        return (
          <div
            key={`gantt-page-${gIdx}`}
            className="pdf-export-slide"
            style={{
              width: 1024,
              height: 576,
              backgroundColor: '#ffffff',
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              boxSizing: 'border-box',
              padding: '28px 44px 22px 48px',
            }}
          >
            {/* Left Brand Stripe */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 7,
                backgroundColor: '#0265b0',
              }}
            />

            {/* Subtle Watermark Loop Icon in Bottom Right */}
            <img
              src={SYSMIDDLE_ICON_BASE64}
              alt=""
              style={{
                position: 'absolute',
                right: -30,
                bottom: -40,
                width: 380,
                height: 380,
                objectFit: 'contain',
                opacity: 0.05,
                pointerEvents: 'none',
              }}
            />

            {/* Top Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <img
                src={SYSMIDDLE_LOGO_BASE64}
                alt="SysMiddle"
                style={{
                  height: 28,
                  width: 'auto',
                  objectFit: 'contain',
                }}
              />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                  {projectName}
                </div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  Atualizado em {todayStr}
                </div>
              </div>
            </div>

            {/* Title & Subtitle */}
            <div style={{ marginBottom: 14 }}>
              <h1
                style={{
                  fontSize: 23,
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                Cronograma de execução
              </h1>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>
                {subtitleRangeStr}
                {ganttChunks.length > 1 ? ` (Parte ${gIdx + 1})` : ''}
              </div>
            </div>

            {/* Gantt Area */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Header Days Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  borderBottom: '2px solid #167fd0',
                  paddingBottom: 6,
                }}
              >
                {/* Left Demanda Title */}
                <div style={{ width: 220, flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: '#167fd0', paddingLeft: 4 }}>
                  Demanda
                </div>

                {/* Day Columns */}
                <div
                  style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.max(1, workingDays.length)}, 1fr)`,
                  }}
                >
                  {workingDays.map((d) => (
                    <div key={d.dateStr} style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: 9.5,
                          fontWeight: d.isToday ? 700 : 600,
                          color: d.isToday ? '#167fd0' : '#475569',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {d.weekdayLabel}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 800,
                          color: d.isToday ? '#167fd0' : '#0f172a',
                          lineHeight: 1.2,
                        }}
                      >
                        {d.dayMonth}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gantt Body Area: items placed directly below header */}
              {(() => {
                const totalCols = Math.max(1, workingDays.length);
                return (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-start',
                      position: 'relative',
                    }}
                  >
                    {/* Full-height background vertical grid lines for all day columns */}
                    <div
                      style={{
                        position: 'absolute',
                        left: 220,
                        right: 0,
                        top: 0,
                        bottom: 0,
                        display: 'grid',
                        gridTemplateColumns: `repeat(${totalCols}, 1fr)`,
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    >
                      {workingDays.map((_, colIdx) => (
                        <div
                          key={colIdx}
                          style={{
                            height: '100%',
                            borderRight: '1px solid #f1f5f9',
                            boxSizing: 'border-box',
                          }}
                        />
                      ))}
                    </div>

                    {chunk.map((item) => {
                  const c = (item.metadata?.canal || '').toLowerCase().trim();
                  const isDistribuidor = c.includes('distrib');
                  const isVarejo = c.includes('varejo');
                  const barColor = isDistribuidor ? '#1982d2' : isVarejo ? '#185083' : '#0265b0';

                  // Calculate column span within workingDays
                  const totalCols = Math.max(1, workingDays.length);
                  let startIdx = workingDays.findIndex((w) => w.dateStr >= item.start_date);
                  if (startIdx === -1) startIdx = 0;

                  let endIdx = -1;
                  for (let w = workingDays.length - 1; w >= 0; w--) {
                    if (workingDays[w].dateStr <= item.end_date) {
                      endIdx = w;
                      break;
                    }
                  }
                  if (endIdx === -1 || endIdx < startIdx) endIdx = startIdx;

                  const spanCols = Math.max(1, endIdx - startIdx + 1);
                  const leftPercent = (startIdx / totalCols) * 100;
                  const widthPercent = (spanCols / totalCols) * 100;

                  let endDM = '';
                  try {
                    endDM = format(parseISO(item.end_date), 'dd/MM');
                  } catch {
                    endDM = item.end_date;
                  }

                  return (
                    <div
                      key={item.id || item.issue_key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        borderBottom: '1px solid #f8fafc',
                        height: 33,
                        position: 'relative',
                      }}
                    >
                      {/* Left Demanda Info */}
                      <div style={{ width: 220, flexShrink: 0, paddingRight: 14, paddingLeft: 4, overflow: 'hidden' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>
                          {item.issue_key}
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: '#64748b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            marginTop: 1,
                          }}
                          title={item.summary}
                        >
                          {item.summary}
                        </div>
                      </div>

                      {/* Day Columns Grid with Overlay Bar */}
                      <div
                        style={{
                          flex: 1,
                          height: '100%',
                          position: 'relative',
                          display: 'grid',
                          gridTemplateColumns: `repeat(${totalCols}, 1fr)`,
                        }}
                      >
                        {/* Vertical grid lines */}
                        {workingDays.map((_, colIdx) => (
                          <div
                            key={colIdx}
                            style={{
                              height: '100%',
                              borderRight: '1px solid #f1f5f9',
                              boxSizing: 'border-box',
                            }}
                          />
                        ))}

                        {/* Gantt Bar */}
                        <div
                          style={{
                            position: 'absolute',
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            height: 25,
                            backgroundColor: barColor,
                            borderRadius: 6,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            padding: '0 5px',
                            boxSizing: 'border-box',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            zIndex: 2,
                          }}
                        >
                          <span
                            style={{
                              backgroundColor: '#ffffff',
                              color: '#185083',
                              fontWeight: 900,
                              fontSize: 8.5,
                              padding: '1.5px 6px',
                              borderRadius: 9999,
                              flexShrink: 0,
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            }}
                          >
                            {endDM}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

            {/* Legend below Gantt Chart */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginTop: 10,
                fontSize: 9.5,
                color: '#64748b',
              }}
            >
              {/* Distribuidor pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 14,
                    height: 7,
                    borderRadius: 3,
                    backgroundColor: '#1982d2',
                    display: 'inline-block',
                  }}
                />
                <span>Distribuidor</span>
              </div>

              {/* Varejo pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span
                  style={{
                    width: 14,
                    height: 7,
                    borderRadius: 3,
                    backgroundColor: '#185083',
                    display: 'inline-block',
                  }}
                />
                <span>Varejo</span>
              </div>

              <span>Etiqueta branca = data de entrega</span>
              <span>{weekendNote}</span>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 'auto',
                paddingTop: 8,
                fontSize: 9.5,
                color: '#94a3b8',
              }}
            >
              <div>SysMiddle | Integration as a Service</div>
              <div>{currentPageNum} / {totalPages}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
