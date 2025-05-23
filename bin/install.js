#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { Command } = require('commander');
const { execSync } = require('child_process');
const ora = require('ora');
const chalk = require('chalk');
const boxen = require('boxen');
const updateNotifier = require('update-notifier');
const packageJson = require('../package.json');

// Dynamic import for Inquirer
const importInquirer = async () => {
  try {
    const { default: inquirer } = await import('inquirer');
    return inquirer;
  } catch (error) {
    console.error('Failed to import inquirer:', error);
    process.exit(1);
  }
};

// Main function to make the script async
async function main() {
  const program = new Command();
  let inquirer;

  // Spinner for loading states
  let spinner;

  // Configuration validation
  const validateProjectStructure = async () => {
    const projectRoot = process.cwd();
    
    // Check if it's a React/Next.js project
    try {
      const pkgJson = require(path.join(projectRoot, 'package.json'));
      const hasReact = pkgJson.dependencies?.react || pkgJson.devDependencies?.react;
      if (!hasReact) {
        throw new Error('React is not installed in this project');
      }
    } catch (error) {
      throw new Error('This command must be run in a valid React/Next.js project');
    }
  };

  // Enhanced dependency checking
  const checkDependencies = async (projectRoot) => {
    const dependencies = ['clsx', 'tailwind-merge'];
    const missing = [];

    for (const dep of dependencies) {
      try {
        require(path.join(projectRoot, 'node_modules', dep));
      } catch {
        missing.push(dep);
      }
    }

    return missing;
  };

  // Install dependencies with progress
  const installDependencies = async (dependencies) => {
    spinner = ora('Installing dependencies...').start();
    
    try {
      execSync(`npm install ${dependencies.join(' ')} --save`, { stdio: 'pipe' });
      spinner.succeed('Dependencies installed successfully');
    } catch (error) {
      spinner.fail('Failed to install dependencies');
      throw new Error(`Installation failed: ${error.message}`);
    }
  };

  // Component installation with validation
  const installComponent = async (component, destinationPath) => {
    spinner = ora(`Installing ${component} component...`).start();

    try {
      await fs.copy(
        path.join(__dirname, '../components', `${component}.tsx`),
        destinationPath,
        { overwrite: true }
      );
      spinner.succeed(`Component ${component} installed successfully`);
    } catch (error) {
      spinner.fail(`Failed to install component ${component}`);
      throw error;
    }
  };

  // NEW: Block installation function
  const installBlock = async (blockName, destinationDir) => {
    spinner = ora(`Installing ${blockName} block...`).start();

    try {
      const blockSourceDir = path.join(__dirname, '../blocks', blockName);
      
      // Check if block exists
      if (!fs.existsSync(blockSourceDir)) {
        throw new Error(`Block "${blockName}" not found`);
      }

      // Copy all files from block directory to destination
      await fs.copy(blockSourceDir, destinationDir, { overwrite: true });
      
      spinner.succeed(`Block ${blockName} installed successfully`);
    } catch (error) {
      spinner.fail(`Failed to install block ${blockName}`);
      throw error;
    }
  };

  // List available components
  const listComponents = () => {
    const componentsDir = path.join(__dirname, '../components');
    try {
      const components = fs.readdirSync(componentsDir)
        .filter(file => file.endsWith('.tsx'))
        .map(file => file.replace('.tsx', ''));
      return components;
    } catch {
      return [];
    }
  };

  // NEW: List available blocks
  const listBlocks = () => {
    const blocksDir = path.join(__dirname, '../blocks');
    try {
      const blocks = fs.readdirSync(blocksDir)
        .filter(dir => fs.statSync(path.join(blocksDir, dir)).isDirectory());
      return blocks;
    } catch {
      return [];
    }
  };

  // Welcome message
  const showWelcome = () => {
    console.log(
      boxen(
        chalk.bold('PixelBlock UI CLI') + '\n' +
        chalk.dim(`v${packageJson.version}`),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan'
        }
      )
    );
  };

  // Import inquirer at the start
  inquirer = await importInquirer();

  // Main program
  program
    .version(packageJson.version)
    .description('PixelBlock UI component installer');

  // Add component command
  program
    .command('add [component]')
    .description('Add a PixelBlock UI component')
    .option('-f, --force', 'Force installation without confirmation')
    .action(async (component, options) => {
      try {
        showWelcome();
        await validateProjectStructure();

        const components = listComponents();
        
        // If no component specified, show selection prompt
        if (!component) {
          const answer = await inquirer.prompt([{
            type: 'list',
            name: 'component',
            message: 'Select a component to install:',
            choices: components
          }]);
          component = answer.component;
        }

        // Validate component exists
        if (!components.includes(component)) {
          console.error(chalk.red(`Error: Component '${component}' not found`));
          console.log(chalk.yellow('\nAvailable components:'));
          components.forEach(c => console.log(`  - ${c}`));
          process.exit(1);
        }

        const projectRoot = process.cwd();
        const destinationDir = path.join(projectRoot, 'components', 'PixelBlock');
        const destinationFile = path.join(destinationDir, `${component}.tsx`);

        // Check if component already exists
        if (fs.existsSync(destinationFile) && !options.force) {
          const { overwrite } = await inquirer.prompt([{
            type: 'confirm',
            name: 'overwrite',
            message: `Component ${component} already exists. Overwrite?`,
            default: false
          }]);

          if (!overwrite) {
            console.log(chalk.yellow('Installation cancelled'));
            process.exit(0);
          }
        }

        // Create directory if it doesn't exist
        await fs.ensureDir(destinationDir);

        // Check and install dependencies
        const missingDeps = await checkDependencies(projectRoot);
        if (missingDeps.length > 0) {
          await installDependencies(missingDeps);
        }

        // Install component
        await installComponent(component, destinationFile);

        console.log(chalk.green('\n✨ Installation complete!'));
        console.log(chalk.dim('\nImport your component like this:'));
        console.log(chalk.cyan(`import { ${component} } from '@/components/PixelBlock/${component}'`));

      } catch (error) {
        if (spinner) spinner.fail('Operation failed');
        console.error(chalk.red(`\n${error.message}`));
        process.exit(1);
      }
    });

  // NEW: Add block command
  program
    .command('add-block [blockName]')
    .description('Add a complete PixelBlock UI block (like login or blog)')
    .option('-f, --force', 'Force installation without confirmation')
    .action(async (blockName, options) => {
      try {
        showWelcome();
        await validateProjectStructure();

        const blocks = listBlocks();
        
        // If no block specified, show selection prompt
        if (!blockName) {
          const answer = await inquirer.prompt([{
            type: 'list',
            name: 'block',
            message: 'Select a block to install:',
            choices: blocks
          }]);
          blockName = answer.block;
        }

        // Validate block exists
        if (!blocks.includes(blockName)) {
          console.error(chalk.red(`Error: Block '${blockName}' not found`));
          console.log(chalk.yellow('\nAvailable blocks:'));
          blocks.forEach(b => console.log(`  - ${b}`));
          process.exit(1);
        }

        const projectRoot = process.cwd();
        const destinationDir = path.join(projectRoot, 'components', 'PixelBlock', 'blocks', blockName);

        // Check if block already exists
        if (fs.existsSync(destinationDir) && !options.force) {
          const { overwrite } = await inquirer.prompt([{
            type: 'confirm',
            name: 'overwrite',
            message: `Block ${blockName} already exists. Overwrite?`,
            default: false
          }]);

          if (!overwrite) {
            console.log(chalk.yellow('Installation cancelled'));
            process.exit(0);
          }
        }

        // Create directory if it doesn't exist
        await fs.ensureDir(destinationDir);

        // Check and install dependencies
        const missingDeps = await checkDependencies(projectRoot);
        if (missingDeps.length > 0) {
          await installDependencies(missingDeps);
        }

        // Install block
        await installBlock(blockName, destinationDir);

        console.log(chalk.green('\n✨ Block installation complete!'));
        console.log(chalk.dim('\nImport your block like this:'));
        console.log(chalk.cyan(`import { ${blockName.charAt(0).toUpperCase() + blockName.slice(1)} } from '@/components/PixelBlock/blocks/${blockName}'`));

      } catch (error) {
        if (spinner) spinner.fail('Operation failed');
        console.error(chalk.red(`\n${error.message}`));
        process.exit(1);
      }
    });

  // Modified: List command to show both components and blocks
  program
    .command('list')
    .description('List all available components and blocks')
    .action(() => {
      showWelcome();
      const components = listComponents();
      const blocks = listBlocks();
      
      if (components.length === 0 && blocks.length === 0) {
        console.log(chalk.yellow('No components or blocks available'));
        return;
      }

      if (components.length > 0) {
        console.log(chalk.cyan('\nAvailable components:'));
        components.forEach(component => {
          console.log(chalk.white(`  - ${component}`));
        });
      }

      if (blocks.length > 0) {
        console.log(chalk.cyan('\nAvailable blocks:'));
        blocks.forEach(block => {
          console.log(chalk.white(`  - ${block}`));
        });
      }
    });

  // Version command
  program
    .command('version')
    .description('Show CLI version')
    .action(() => {
      console.log(`v${packageJson.version}`);
    });

  // Parse arguments
  program.parse(process.argv);
}

// Call the main function
main().catch(error => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});