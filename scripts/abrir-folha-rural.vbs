Option Explicit

Dim fso, shell, root, logDir, logPath, starter, waiter, command, q
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
q = Chr(34)

root = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
logDir = fso.BuildPath(root, "logs")
logPath = fso.BuildPath(logDir, "inicializacao.log")
starter = fso.BuildPath(root, "INICIAR-FOLHA-RURAL.bat")
waiter = fso.BuildPath(root, "scripts\aguardar-servidor.ps1")

If Not fso.FolderExists(logDir) Then fso.CreateFolder(logDir)

command = shell.ExpandEnvironmentStrings("%ComSpec%") & " /d /c " & q & q & starter & q & " >> " & q & logPath & q & " 2>&1" & q
shell.Run command, 0, False
shell.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & q & waiter & q, 0, False
