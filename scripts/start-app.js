import { exec } from 'child_process';
import chalk from 'chalk';
import { promisify } from 'util';
import net from 'net';

const execAsync = promisify(exec);

// Function to check if port is in use
const isPortInUse = async (port) => {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => {
        server.close();
        resolve(false);
      })
      .listen(port);
  });
};

// Function to find next available port
const findAvailablePort = async (startPort) => {
  let port = startPort;
  while (await isPortInUse(port)) {
    port++;
    if (port > startPort + 100) return null; // Limit search to 100 ports
  }
  return port;
};

// Function to get process info using port
const getProcessInfo = async (port) => {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.split('\n').filter(line => line.includes(`:${port}`));
      if (lines.length > 0) {
        const processId = lines[0].split(' ').filter(Boolean).pop();
        if (processId) {
          const { stdout: processInfo } = await execAsync(`tasklist /FI "PID eq ${processId}"`);
          return { pid: processId, info: processInfo };
        }
      }
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Function to kill process on port
const killProcess = async (port) => {
  try {
    if (process.platform === 'win32') {
      const processInfo = await getProcessInfo(port);
      if (processInfo) {
        console.log(chalk.yellow(`\nProcess using port ${port}:`));
        console.log(chalk.gray(processInfo.info));
        await execAsync(`taskkill /F /PID ${processInfo.pid}`);
        return true;
      }
    } else {
      await execAsync(`lsof -i :${port} -t | xargs kill -9`);
      return true;
    }
  } catch (error) {
    return false;
  }
  return false;
};

// Function to start the application
const startApp = async (port) => {
  const command = `npm run start:port ${port}`;
  console.log(chalk.cyan(`\nStarting application on port ${port}...`));
  
  const child = exec(command);
  
  child.stdout.on('data', (data) => {
    console.log(data);
  });

  child.stderr.on('data', (data) => {
    console.error(chalk.red(data));
  });

  child.on('close', (code) => {
    if (code !== 0) {
      console.log(chalk.red(`Process exited with code ${code}`));
    }
    process.exit(code);
  });
};

// Main execution
const main = async () => {
  const defaultPort = 3000;
  
  try {
    // Check if default port is in use
    if (await isPortInUse(defaultPort)) {
      console.log(chalk.yellow(`\nPort ${defaultPort} is in use.`));
      
      // Try to find next available port
      const nextPort = await findAvailablePort(defaultPort + 1);
      
      if (nextPort) {
        console.log(chalk.green(`Found available port: ${nextPort}`));
        await startApp(nextPort);
      } else {
        console.error(chalk.red('No available ports found. Please free up some ports and try again.'));
        process.exit(1);
      }
    } else {
      await startApp(defaultPort);
    }
  } catch (error) {
    console.error(chalk.red('Error starting application:', error));
    process.exit(1);
  }
};

// Start the application
main(); 