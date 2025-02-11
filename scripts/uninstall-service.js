const { Service } = require('node-windows');
const path = require('path');

// Create a new service object
const svc = new Service({
  name: 'AudioCleanerWorker',
  description: 'Audio Cleaner Queue Worker Service',
  script: path.join(__dirname, 'start-worker.ts'),
  workingDirectory: path.join(__dirname, '..')
});

// Listen for uninstall events
svc.on('uninstall', () => {
  console.log('Service uninstalled successfully');
  process.exit();
});

svc.on('error', (err) => {
  console.error('Service error:', err);
  process.exit(1);
});

// Uninstall the service
console.log('Uninstalling service...');
svc.uninstall(); 