import fs from 'fs';
import path from 'path';

export function getStartupFolderPath(): string {
  const appData = process.env.APPDATA;
  if (!appData) {
    throw new Error('APPDATA environment variable not found');
  }
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

export function getStartupScriptPath(): string {
  return path.join(getStartupFolderPath(), 'TaskLS.vbs');
}

export function getLauncherScriptContent(projectDir: string): string {
  // Silent VBS launcher (0 = hide window, False = don't wait)
  return `' Launcher Silencioso em Segundo Plano para o TaskLS
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "${projectDir.replace(/"/g, '""')}"
WshShell.Run "node dist/server/server.js", 0, False
`;
}

export function isAutostartEnabled(): boolean {
  try {
    const scriptPath = getStartupScriptPath();
    return fs.existsSync(scriptPath);
  } catch (err) {
    console.error('[Autostart] Erro ao checar status de inicialização:', err);
    return false;
  }
}

export function setAutostart(enable: boolean): { success: boolean; enabled: boolean; path: string } {
  const scriptPath = getStartupScriptPath();
  const projectDir = process.cwd();

  try {
    if (enable) {
      const startupFolder = getStartupFolderPath();
      if (!fs.existsSync(startupFolder)) {
        fs.mkdirSync(startupFolder, { recursive: true });
      }

      const content = getLauncherScriptContent(projectDir);
      fs.writeFileSync(scriptPath, content, 'utf8');
      console.log(`[Autostart] Inicialização com Windows ativada em: ${scriptPath}`);
      return { success: true, enabled: true, path: scriptPath };
    } else {
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
        console.log(`[Autostart] Inicialização com Windows desativada: ${scriptPath}`);
      }
      return { success: true, enabled: false, path: scriptPath };
    }
  } catch (err: any) {
    console.error('[Autostart] Erro ao configurar inicialização:', err);
    return { success: false, enabled: isAutostartEnabled(), path: scriptPath };
  }
}
