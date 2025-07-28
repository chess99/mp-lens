#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// A simple colored logger
const colors = {
  blue: (text) => `\x1b[34m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
};

const projectRoot = path.resolve(__dirname, '..');
const cliPath = path.join(projectRoot, 'dist', 'cli.js');
const packageJsonPath = path.join(projectRoot, 'package.json');

function runSmokeTest() {
  console.log(colors.blue('💨 Running smoke test...'));

  // 1. Check if the build artifact exists
  if (!fs.existsSync(cliPath)) {
    console.error(colors.red(`❌ Smoke test failed: Build artifact not found at ${cliPath}`));
    console.error(colors.yellow('   Please run "npm run build" first.'));
    process.exit(1);
  }

  try {
    // 2. Get version from package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const expectedVersion = packageJson.version;

    // 3. Execute the CLI command
    console.log(`   Executing: node ${path.relative(projectRoot, cliPath)} --version`);
    const output = execSync(`node ${cliPath} --version`, { encoding: 'utf8' }).trim();

    // 4. Validate the output
    if (output === expectedVersion) {
      console.log(colors.green(`✅ Smoke test passed! Version matches: ${output}`));
    } else {
      console.error(colors.red('❌ Smoke test failed: Version mismatch.'));
      console.error(`   Expected: ${expectedVersion}`);
      console.error(`   Received: ${output}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(colors.red('❌ Smoke test failed: CLI command threw an error.'));
    console.error('   This likely means the executable is broken (e.g., missing shebang).');
    console.error('--- Error Details ---');
    console.error(error.message);
    if (error.stdout) console.error('Stdout:', error.stdout);
    if (error.stderr) console.error('Stderr:', error.stderr);
    console.error('---------------------');
    process.exit(1);
  }
}

runSmokeTest();
