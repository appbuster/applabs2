/**
 * Tester Module - Automated testing and bug detection
 */
import { execa } from 'execa';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface TestResult {
  passed: boolean;
  tests: {
    name: string;
    passed: boolean;
    error?: string;
  }[];
  lintErrors: string[];
  typeErrors: string[];
  suggestions: string[];
}

export interface BugFix {
  file: string;
  issue: string;
  fix: string;
  applied: boolean;
}

export class TesterModule {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async runTests(projectDir: string): Promise<TestResult> {
    logger.info(`Running tests in ${projectDir}`);
    
    const result: TestResult = {
      passed: true,
      tests: [],
      lintErrors: [],
      typeErrors: [],
      suggestions: [],
    };

    // 1. Check if dependencies are installed
    try {
      if (!await fs.pathExists(path.join(projectDir, 'node_modules'))) {
        logger.info('Installing dependencies...');
        await execa('pnpm', ['install'], { cwd: projectDir });
      }
    } catch (e) {
      logger.error('Failed to install dependencies');
      result.passed = false;
      result.suggestions.push('Check package.json for invalid dependencies');
    }

    // 2. TypeScript check
    try {
      logger.info('Running TypeScript check...');
      await execa('pnpm', ['exec', 'tsc', '--noEmit'], { 
        cwd: path.join(projectDir, 'apps/web'),
        reject: false 
      });
      result.tests.push({ name: 'TypeScript (web)', passed: true });
    } catch (e: any) {
      result.passed = false;
      result.typeErrors.push(e.stderr || e.message);
      result.tests.push({ name: 'TypeScript (web)', passed: false, error: e.message });
    }

    // 3. Lint check
    try {
      logger.info('Running lint...');
      await execa('pnpm', ['lint'], { cwd: projectDir, reject: false });
      result.tests.push({ name: 'ESLint', passed: true });
    } catch (e: any) {
      result.lintErrors.push(e.stderr || e.message);
      result.tests.push({ name: 'ESLint', passed: false, error: e.message });
    }

    // 4. Build check
    try {
      logger.info('Running build...');
      await execa('pnpm', ['build'], { cwd: projectDir, reject: false });
      result.tests.push({ name: 'Build', passed: true });
    } catch (e: any) {
      result.passed = false;
      result.tests.push({ name: 'Build', passed: false, error: e.message });
    }

    // 5. Scan for forbidden patterns
    const forbiddenPatterns = [
      'unlock', 'demo version', 'trial', 'upgrade to', 'pro feature',
      'locked', 'subscribe', 'license key', 'feature disabled', 'paywall',
      'coming soon', 'beta', 'request access', 'waitlist', 'contact sales'
    ];

    try {
      const files = await this.getSourceFiles(path.join(projectDir, 'apps/web/src'));
      let foundForbidden = false;
      
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');
        const lower = content.toLowerCase();
        
        for (const pattern of forbiddenPatterns) {
          if (lower.includes(pattern) && !file.includes('.spec.') && !file.includes('.test.')) {
            result.suggestions.push(`Found "${pattern}" in ${path.relative(projectDir, file)}`);
            foundForbidden = true;
          }
        }
      }
      
      result.tests.push({ 
        name: 'Anti-gating scan', 
        passed: !foundForbidden,
        error: foundForbidden ? 'Found forbidden patterns' : undefined
      });
      
      if (foundForbidden) result.passed = false;
    } catch (e: any) {
      result.tests.push({ name: 'Anti-gating scan', passed: false, error: e.message });
    }

    logger.info(`Tests complete: ${result.passed ? 'PASSED' : 'FAILED'}`);
    return result;
  }

  async fixBugs(projectDir: string, testResult: TestResult): Promise<BugFix[]> {
    const fixes: BugFix[] = [];
    
    if (testResult.passed) {
      logger.info('No bugs to fix');
      return fixes;
    }

    logger.info('Attempting to fix bugs...');

    // Collect all errors
    const errors = [
      ...testResult.typeErrors,
      ...testResult.lintErrors,
      ...testResult.tests.filter(t => !t.passed).map(t => t.error || ''),
    ].filter(Boolean);

    if (errors.length === 0) {
      return fixes;
    }

    // Ask Claude to suggest fixes
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `I have these errors in a Next.js + Fastify project:

${errors.join('\n\n')}

For each error, provide a JSON array of fixes:
[
  {
    "file": "relative/path/to/file.ts",
    "issue": "description of the issue",
    "originalCode": "the problematic code snippet",
    "fixedCode": "the corrected code snippet"
  }
]

Return ONLY valid JSON array, no markdown.`
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') return fixes;

    try {
      const suggestedFixes = JSON.parse(content.text);
      
      for (const fix of suggestedFixes) {
        const filePath = path.join(projectDir, fix.file);
        
        if (await fs.pathExists(filePath)) {
          const fileContent = await fs.readFile(filePath, 'utf-8');
          
          if (fix.originalCode && fileContent.includes(fix.originalCode)) {
            const newContent = fileContent.replace(fix.originalCode, fix.fixedCode);
            await fs.writeFile(filePath, newContent);
            
            fixes.push({
              file: fix.file,
              issue: fix.issue,
              fix: 'Applied code replacement',
              applied: true,
            });
            
            logger.info(`Fixed: ${fix.file}`);
          } else {
            fixes.push({
              file: fix.file,
              issue: fix.issue,
              fix: fix.fixedCode,
              applied: false,
            });
          }
        }
      }
    } catch (e) {
      logger.error('Failed to parse fix suggestions');
    }

    return fixes;
  }

  private async getSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    if (!await fs.pathExists(dir)) return files;
    
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        files.push(...await this.getSourceFiles(fullPath));
      } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
}
