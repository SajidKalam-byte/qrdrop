# Creates a "qrdrop" shortcut (with the logo) on your Desktop, pointing at this checkout.
# Run once:  powershell -ExecutionPolicy Bypass -File scripts\create-shortcut.ps1
$root = Split-Path -Parent $PSScriptRoot
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'qrdrop.lnk'
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
# Target cmd.exe (not the .bat directly): Windows only offers "Pin to taskbar" for exe targets.
$s.TargetPath = "$env:SystemRoot\System32\cmd.exe"
$s.Arguments = '/c "' + (Join-Path $root 'qrdrop.bat') + '"'
$s.WorkingDirectory = $root
$s.IconLocation = (Join-Path $root 'qrdrop.ico') + ',0'
$s.Description = 'qrdrop - send files between phone and laptop'
$s.Save()
Write-Host "Created $lnk  (right-click it -> Pin to taskbar, or drag it onto the taskbar)"
