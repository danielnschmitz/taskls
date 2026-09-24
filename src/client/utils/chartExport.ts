import { toJpeg } from 'html-to-image';

export interface ExportChartOptions {
  fileName?: string;
  backgroundColor?: string;
  quality?: number;
  pixelRatio?: number;
}

/**
 * Exporta um elemento DOM (gráfico SVG ou container de card de gráfico) como arquivo JPG de alta qualidade.
 */
export async function exportElementToJpg(
  element: HTMLElement,
  options: ExportChartOptions = {}
): Promise<void> {
  const isDark = document.documentElement.classList.contains('dark');
  const defaultBg = isDark ? '#0c1222' : '#ffffff';
  const bgColor = options.backgroundColor || defaultBg;
  const quality = options.quality ?? 0.95;
  const pixelRatio = options.pixelRatio ?? 2;

  // Data formatada para nome do arquivo
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const rawFileName = options.fileName || 'grafico';
  const sanitizedFileName = rawFileName.replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_');
  const fullFileName = `${sanitizedFileName}_${dateStr}.jpg`;

  try {
    const dataUrl = await toJpeg(element, {
      quality,
      backgroundColor: bgColor,
      pixelRatio,
      cacheBust: true,
      filter: (node: Node) => {
        // Ignora botões de exportação e elementos marcados com data-export-ignore
        if (node instanceof HTMLElement && node.getAttribute('data-export-ignore') === 'true') {
          return false;
        }
        return true;
      },
    });

    const link = document.createElement('a');
    link.download = fullFileName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('[chartExport] Erro ao exportar gráfico para JPG:', error);
    throw error;
  }
}
