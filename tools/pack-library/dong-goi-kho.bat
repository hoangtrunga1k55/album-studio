@echo off
REM Album Studio - dong goi + phat hanh kho layout/typo (Windows)
REM Bam dup file nay. Khong can go lenh.

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "CONF=.pack-config.bat"
set "VENV=.venv"

echo === Album Studio - Dong goi kho ===
echo.

REM ---------- 1. moi truong Python ----------
where python >nul 2>&1
if errorlevel 1 (
  echo [LOI] Chua co Python. Cai tai https://www.python.org/downloads/
  echo       Nho tick "Add Python to PATH" khi cai.
  pause
  exit /b 1
)

if not exist "%VENV%\Scripts\python.exe" (
  echo Lan dau chay - dang cai thu vien ^(1-2 phut^)...
  python -m venv "%VENV%" || (echo [LOI] Tao venv that bai & pause & exit /b 1)
  "%VENV%\Scripts\python.exe" -m pip install -q --upgrade pip
  "%VENV%\Scripts\python.exe" -m pip install -q -r requirements.txt || (echo [LOI] Cai thu vien that bai & pause & exit /b 1)
  echo [OK] Da cai xong thu vien
  echo.
)
set "PYBIN=%VENV%\Scripts\python.exe"

REM ---------- 2. chon loai kho ----------
echo Dong goi kho nao?
echo   1^) Kho LAYOUT  ^(PSD layout -^> json + thumbnail + nen in^)
echo   2^) Kho TYPO    ^(PSD typo -^> preview + deco^)
set /p KIND="Chon [1/2]: "
if "%KIND%"=="1" (
  set "SCRIPT=build_layout_library.py"
  set "OUT=kho-layout"
  set "TAG=pack-layout"
) else if "%KIND%"=="2" (
  set "SCRIPT=build_typo_library.py"
  set "OUT=kho-typo"
  set "TAG=pack-typo"
) else (
  echo [LOI] Chon 1 hoac 2.
  pause
  exit /b 1
)
echo.

REM ---------- 3. thu muc PSD (keo tha vao cua so nay) ----------
echo Keo THU MUC PSD vao day roi Enter
echo ^(moi thu muc con = 1 nhom: cover-25x35, layout-30x30 / vn, korea...^)
set /p SRC="> "
set SRC=%SRC:"=%
if not exist "%SRC%\" (
  echo [LOI] Khong thay thu muc: %SRC%
  pause
  exit /b 1
)
echo.

REM ---------- 4. build ----------
echo Dang dong goi... ^(PSD lon co the mat vai phut^)
"%PYBIN%" "%SCRIPT%" --in "%SRC%" --out "%OUT%" || (echo [LOI] Dong goi that bai & pause & exit /b 1)
echo.
echo [OK] Kho da tao: %CD%\%OUT%
echo.

REM ---------- 5. phat hanh (tuy chon) ----------
set /p PUB="Day kho len GitHub cho user tu cap nhat? [y/N]: "
if /i not "%PUB%"=="y" (
  echo Bo qua. Co the gui thu muc %OUT% cho user de ho 'Nap kho...' thu cong.
  pause
  exit /b 0
)

if exist "%CONF%" call "%CONF%"
if "%REPO%"=="" set /p REPO="Repo GitHub (vd hoangtrunga1k55/album-studio): "
if "%TOKEN%"=="" (
  echo Token GitHub ^(Settings -^> Developer settings -^> Personal access tokens -^> scope 'repo'^)
  set /p TOKEN="Token: "
)
>"%CONF%" echo set "REPO=%REPO%"
>>"%CONF%" echo set "TOKEN=%TOKEN%"

echo.
echo Dang day len GitHub...
set "GITHUB_TOKEN=%TOKEN%"
"%PYBIN%" publish_pack.py --pack "%OUT%" --tag "%TAG%" --repo "%REPO%" || (echo [LOI] Day len GitHub that bai & pause & exit /b 1)

echo.
echo Gui link release nay cho user -^> app: Cai dat -^> dan vao 'Link kho tren mang' -^> Cap nhat
pause