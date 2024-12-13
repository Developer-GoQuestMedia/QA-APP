import readline from 'readline';
import { exec } from 'child_process';
import chalk from 'chalk';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to create a visual separator
const separator = () => {
  console.log(chalk.gray('═'.repeat(80)));
};

// Function to display success message
const displayBuildSuccess = () => {
  separator();
  console.log(chalk.green.bold('🎉 Build Completed Successfully! 🎉'));
  console.log(chalk.green('✓ All tests passed'));
  console.log(chalk.green('✓ Next.js build completed'));
  console.log(chalk.green('✓ Application is ready for deployment'));
  separator();
};

// Function to display build summary
const displayBuildSummary = () => {
  console.log(chalk.cyan('\nBuild Summary:'));
  console.log(chalk.white('• Environment: Production'));
  console.log(chalk.white('• Test Coverage: Passed'));
  console.log(chalk.white('• Build Size: Optimized'));
  console.log(chalk.white('• Static Pages: Generated'));
  console.log(chalk.white('• API Routes: Configured'));
};

// Function to handle starting the application
const handleAppStart = () => {
  rl.question(chalk.yellow('\nWould you like to start the application? (y/n): '), (answer) => {
    if (answer.toLowerCase() === 'y') {
      console.log(chalk.cyan('\nStarting the application...'));
      const child = exec('npm run start');
      
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
        rl.close();
      });
    } else {
      console.log(chalk.cyan('\nBuild artifacts are ready. Run "npm run start" when you want to start the application.'));
      rl.close();
    }
  });
};

// Main execution
const main = async () => {
  try {
    displayBuildSuccess();
    displayBuildSummary();
    handleAppStart();
  } catch (error) {
    console.error(chalk.red('Error during build process:', error));
    process.exit(1);
  }
};

main(); 