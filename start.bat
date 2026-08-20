@echo off
echo Starting CashFlo Backend Server...
start cmd /k "cd cashflo-backend && npm run dev"

echo Waiting for backend to initialize...
timeout /t 4 /nobreak > NUL

echo Starting CashFlo Terminal UI...
cd cashflo-ws
npm run dashboard
