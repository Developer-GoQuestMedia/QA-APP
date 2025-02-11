@echo off
set NODE_ENV=development
set MONGODB_URI=mongodb+srv://vivekkumarsingh:dGeuK817ItxjmUb4@cluster0.vir7o.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
set MONGODB_DB=TestDB
set REDIS_URL=redis://127.0.0.1:6379

npx tsx scripts/start-worker.ts 