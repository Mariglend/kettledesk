@echo off
title Build Kettledesk

echo.
echo  ================================================
echo    KETTLEDESK - Build del .exe
echo  ================================================
echo.

REM Verifica che Node.js sia installato
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERRORE] Node.js NON e' installato.
    echo.
    echo  Scaricalo da: https://nodejs.org
    echo  Scegli la versione LTS, installa con le opzioni di default,
    echo  RIAVVIA IL PC e poi rilancia questo file.
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js trovato:
node --version
echo.

REM Installa/aggiorna dipendenze (serve internet solo per la build, non per usare l'app)
echo  [1/2] Installazione dipendenze... 2-3 minuti la prima volta
echo.
call npm install
if errorlevel 1 (
    echo.
    echo  [ERRORE] Installazione fallita. Controlla la connessione internet.
    pause
    exit /b 1
)

echo.
echo  [2/2] Costruzione del file .exe... 3-5 minuti
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo  [ERRORE] Build fallita. Vedi il messaggio sopra.
    pause
    exit /b 1
)

echo.
echo  ================================================
echo    FATTO! Il tuo .exe e' pronto.
echo  ================================================
echo.
echo    Lo trovi in:  dist\Kettledesk.exe
echo.
echo    Puoi copiarlo dove vuoi (Desktop, ecc.)
echo.

REM Apri la cartella dist
if exist "dist\" explorer dist

pause
