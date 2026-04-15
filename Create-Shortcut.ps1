$DesktopPath = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "FlowCap.lnk"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = """d:\video-recorder\Launch-FlowCap.vbs"""
$Shortcut.IconLocation = "d:\video-recorder\icon.ico"
$Shortcut.WorkingDirectory = "d:\video-recorder"
$Shortcut.Save()
Write-Host "Shortcut created at $ShortcutPath"
