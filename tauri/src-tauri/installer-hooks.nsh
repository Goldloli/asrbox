; NSIS installer hooks for the Windows desktop bundle.
;
; Upgrades replace the sidecar resource tree in place, so files a previous
; version shipped and the current one dropped survive the upgrade. PyInstaller's
; onedir layout is sensitive to that: a stale `<dist>-<old version>.dist-info`
; makes importlib.metadata report the old version, and transformers rejects its
; own modules when the reported tokenizers version is out of range. Clear the
; installer-managed tree before copying so an upgrade matches a clean install.
;
; The installer's own running-instance check runs right after this hook, so run
; it here first: removing resources under a live process would leave a partial
; tree if the user then cancelled the install.

!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  RMDir /r "$INSTDIR\binaries"
!macroend
