@echo off
setlocal

:: Set environment variables
set NODE_ENV=development
set MONGODB_URI=mongodb+srv://vivekkumarsingh:dGeuK817ItxjmUb4@cluster0.vir7o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
set MONGODB_DB=TestDB
set REDIS_URL=redis://127.0.0.1:6379

:: Start Redis if not running (requires Redis to be installed)
redis-server.exe redis.windows.conf

:: Wait a moment for Redis to start
timeout /t 2

:: Start the worker
echo Starting audio cleaner worker...
call npx tsx scripts/start-worker.ts

:: If the worker crashes, wait before exiting
timeout /t 5
endlocal 