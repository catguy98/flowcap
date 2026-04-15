Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d ""d:\video-recorder"" && npm run start", 0, False
