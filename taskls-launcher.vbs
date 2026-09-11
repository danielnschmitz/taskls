' TaskLS - Inicializador silencioso em background
Dim FSO, ScriptDir, WshShell
Set FSO = CreateObject("Scripting.FileSystemObject")
ScriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = ScriptDir
WshShell.Run "node dist/server/server.js", 0, False
