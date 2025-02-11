const { Service } = require('node-windows');
const path = require('path');
require('dotenv').config({ path: '.env.production' });

// Create a new service object
const svc = new Service({
  name: 'AudioCleanerWorker',
  description: 'Audio Cleaner Queue Worker Service',
  script: path.join(__dirname, 'start-worker.ts'),
  execPath: 'npx tsx',
  workingDirectory: path.join(__dirname, '..'),
  // Log output to file
  logpath: path.join(__dirname, '../logs'),
  env: [
    {
      name: "NODE_ENV",
      value: process.env.NODE_ENV || "production"
    },
    {
      name: "MONGODB_URI",
      value: process.env.MONGODB_URI
    },
    {
      name: "MONGODB_DB",
      value: process.env.MONGODB_DB
    },
    {
      name: "REDIS_URL",
      value: process.env.REDIS_URL
    },
    {
      name: "REDIS_TOKEN",
      value: process.env.REDIS_TOKEN
    },
    {
      name: "REDIS_TLS_URL",
      value: process.env.REDIS_TLS_URL
    }
  ]
});

// Listen for service install/uninstall
svc.on('install', () => {
  console.log('Service installed successfully');
  svc.start();
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully');
});

svc.on('start', () => {
  console.log('Service started successfully');
});

svc.on('stop', () => {
  console.log('Service stopped');
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

// Create logs directory if it doesn't exist
const fs = require('fs');
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Install the service
console.log('Installing service...');
svc.install(); 