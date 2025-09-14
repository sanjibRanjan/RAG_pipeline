#!/usr/bin/env node

/**
 * Simple Test Runner for RAG Pipeline API
 *
 * This script provides an easy way to run the comprehensive test suite
 * with sensible defaults and helpful output.
 *
 * Usage:
 *   node test-runner.js [options]
 *
 * Options:
 *   --quick       Run only basic tests (health, upload, ingest)
 *   --full        Run all tests including performance and load tests
 *   --verbose     Enable verbose output
 *   --report      Generate detailed report
 *   --help        Show help
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SUITE_PATH = path.join(__dirname, 'tests', 'test-suite.js');

class TestRunner {
  constructor() {
    this.options = this.parseArguments();
  }

  parseArguments() {
    const args = process.argv.slice(2);
    const options = {
      quick: false,
      full: false,
      verbose: false,
      report: false,
      help: false
    };

    args.forEach(arg => {
      switch (arg) {
        case '--quick':
          options.quick = true;
          break;
        case '--full':
          options.full = true;
          break;
        case '--verbose':
          options.verbose = true;
          break;
        case '--report':
          options.report = true;
          break;
        case '--help':
          options.help = true;
          break;
      }
    });

    return options;
  }

  showHelp() {
    console.log(`
🚀 RAG Pipeline Test Runner

Easy-to-use test runner for the RAG Pipeline API test suite.

USAGE:
  node test-runner.js [options]

OPTIONS:
  --quick       Run basic tests only (health, upload, ingest, QA)
                 Fastest option for quick validation
  --full        Run complete test suite (all tests + performance + load)
                 Most comprehensive but slowest
  --verbose     Show detailed test execution output
  --report      Generate detailed JSON test report
  --help        Show this help message

EXAMPLES:
  node test-runner.js                 # Run standard test suite
  node test-runner.js --quick         # Quick validation tests
  node test-runner.js --full --report # Complete test suite with report
  node test-runner.js --verbose       # Standard tests with verbose output

TEST COVERAGE:

QUICK TESTS (--quick):
  ✅ Health check
  ✅ Document upload
  ✅ Document ingestion
  ✅ Question answering
  ✅ Document discovery
  ✅ Error handling

FULL TESTS (--full):
  All quick tests plus:
  ✅ Version management
  ✅ Metadata operations
  ✅ Conversation management
  ✅ Performance tests
  ✅ Load tests
  ✅ Integration tests

NOTES:
- Server must be running before running tests
- ChromaDB must be accessible
- Test files must exist in data/docs/
- Use --verbose for troubleshooting failed tests

For more details, see tests/README.md
`);
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    const checks = [
      {
        name: 'Server running',
        command: 'curl -s http://localhost:3000/health > /dev/null',
        success: false
      },
      {
        name: 'ChromaDB running',
        command: 'docker ps | grep -q chromadb',
        success: false
      },
      {
        name: 'Test files exist',
        command: `test -f "${path.join(__dirname, 'data/docs/sample-local-pdf.pdf')}"`,
        success: false
      }
    ];

    for (const check of checks) {
      try {
        const result = await this.runCommand(check.command);
        check.success = result.code === 0;
      } catch (error) {
        check.success = false;
      }
    }

    console.log('');
    checks.forEach(check => {
      const status = check.success ? '✅' : '❌';
      console.log(`${status} ${check.name}`);
    });

    const allPassed = checks.every(check => check.success);

    if (!allPassed) {
      console.log('\n❌ Some prerequisites are not met!');
      console.log('\nTo fix:');
      console.log('1. Start server: npm start');
      console.log('2. Start ChromaDB: npm run chromadb:start');
      console.log('3. Ensure test files exist in data/docs/');
      process.exit(1);
    }

    console.log('\n✅ All prerequisites met!\n');
    return true;
  }

  async runCommand(command, silent = true) {
    return new Promise((resolve) => {
      const child = spawn(command, {
        shell: true,
        stdio: silent ? 'pipe' : 'inherit'
      });

      let stdout = '';
      let stderr = '';

      if (silent) {
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      child.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      child.on('error', (error) => {
        resolve({ code: 1, stdout: '', stderr: error.message });
      });
    });
  }

  async runTests() {
    const testArgs = [];

    if (this.options.quick) {
      testArgs.push('--unit');
      console.log('🏃 Running quick tests...\n');
    } else if (this.options.full) {
      testArgs.push('--integration', '--performance', '--load');
      console.log('🏃 Running full test suite...\n');
    } else {
      testArgs.push('--integration');
      console.log('🏃 Running standard test suite...\n');
    }

    if (this.options.verbose) {
      testArgs.push('--verbose');
    }

    if (this.options.report) {
      testArgs.push('--report');
    }

    const testCommand = `node ${TEST_SUITE_PATH} ${testArgs.join(' ')}`;

    console.log(`Executing: ${testCommand}\n`);
    console.log('═'.repeat(60));

    const result = await this.runCommand(testCommand, false);

    console.log('═'.repeat(60));

    if (result.code === 0) {
      console.log('\n🎉 Tests completed successfully!');
      if (this.options.report) {
        console.log('📄 Detailed report saved to: test-report.json');
      }
    } else {
      console.log('\n❌ Some tests failed!');
      console.log('💡 Use --verbose flag for detailed error information');
    }

    return result.code;
  }

  async run() {
    if (this.options.help) {
      this.showHelp();
      return 0;
    }

    console.log('🚀 RAG Pipeline Test Runner\n');

    try {
      // Check prerequisites
      await this.checkPrerequisites();

      // Run tests
      const exitCode = await this.runTests();

      return exitCode;
    } catch (error) {
      console.error('❌ Test runner failed:', error.message);
      return 1;
    }
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new TestRunner();
  runner.run().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
