; electron-builder'ın varsayılan "uygulama açık mı" kontrolü kurulum klasöründen çalışan HER süreci
; (eski sürümün kendi kaldırıcısı dahil) açık launcher sanıp "kapatılamıyor" hatası veriyor.
; Burada yalnızca gerçek launcher exe'sine (bu kullanıcıya ait) bakıyoruz. Kurulum/kaldırma programlarının
; adı farklı olduğu için kendilerini asla bulmazlar.
!macro customCheckAppRunning
  nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
  Pop $R0
  ${if} $R0 == 0
    DetailPrint "$(appClosing)"
    nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
    Pop $R0
    Sleep 1500
  ${endIf}
!macroend
