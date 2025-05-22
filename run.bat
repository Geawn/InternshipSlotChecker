echo off
set FLAG=%1

if "%FLAG%"=="BE" (
    echo "Running BE..."
    cd BE
    node server.js
) else if "%FLAG%"=="FE" (
    echo "Running FE..."
)
