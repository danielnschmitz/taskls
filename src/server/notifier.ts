import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Helper to escape XML characters
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Sends a native Windows 10/11 Toast Notification using PowerShell WinRT API.
 * Runs completely silently in the background with -WindowStyle Hidden.
 */
export async function sendWindowsNotification(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const cleanTitle = escapeXml(title || 'TaskLS - Lembrete');
      const cleanMessage = escapeXml(message || 'Você tem uma tarefa agendada!');

      const psScript = `
$ErrorActionPreference = 'Stop'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$template = @"
<toast duration="long">
    <visual>
        <binding template="ToastGeneric">
            <text>${cleanTitle}</text>
            <text>${cleanMessage}</text>
            <text placement="attribution">TaskLS Tarefas</text>
        </binding>
    </visual>
    <audio src="ms-winsoundevent:Notification.Default" />
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($template)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
$notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe")
$notifier.Show($toast)
`;

      const child = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass',
        '-Command', psScript,
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let errorOutput = '';

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`[Notifier] Notificação enviada: "${title}"`);
          resolve(true);
        } else {
          console.warn(`[Notifier] Aviso ao enviar notificação (código ${code}):`, errorOutput);
          // Don't fail the whole app if toast service is in quiet hours or suppressed
          resolve(false);
        }
      });

      child.on('error', (err) => {
        console.error('[Notifier] Erro ao disparar processo de notificação:', err);
        resolve(false);
      });
    } catch (err) {
      console.error('[Notifier] Falha ao invocar notificação do Windows:', err);
      resolve(false);
    }
  });
}
