/**
 * Generator Module - Uses Claude to generate enterprise-grade SaaS code
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import { SaaSAnalysis, Entity, Feature } from '../research/index.js';
import { logger } from '../utils/logger.js';
import * as templates from './templates.js';

export interface GenerationResult {
  outputDir: string;
  files: string[];
  errors: string[];
}

export class GeneratorModule {
  private anthropic: Anthropic;
  private outputBase: string;

  constructor(apiKey: string, outputBase: string = '/tmp/applabs2-output') {
    this.anthropic = new Anthropic({ apiKey });
    this.outputBase = outputBase;
  }

  async generateSaaS(analysis: SaaSAnalysis, projectSlug: string): Promise<GenerationResult> {
    const outputDir = path.join(this.outputBase, projectSlug);
    await fs.ensureDir(outputDir);
    
    const files: string[] = [];
    const errors: string[] = [];

    logger.info(`Generating SaaS: ${projectSlug}`);

    try {
      // 1. Generate project structure
      await this.scaffoldProject(outputDir, analysis, projectSlug);
      files.push('package.json', 'pnpm-workspace.yaml', '.gitignore', '.env.example');

      // 2. Generate Prisma schema
      const prismaSchema = await this.generatePrismaSchema(analysis);
      await fs.writeFile(path.join(outputDir, 'apps/api/prisma/schema.prisma'), prismaSchema);
      files.push('apps/api/prisma/schema.prisma');

      // 3. Generate API routes
      for (const entity of analysis.entities) {
        const route = await this.generateAPIRoute(entity, analysis);
        const routePath = `apps/api/src/routes/${entity.name.toLowerCase()}.ts`;
        await fs.ensureDir(path.dirname(path.join(outputDir, routePath)));
        await fs.writeFile(path.join(outputDir, routePath), route);
        files.push(routePath);
      }

      // 4. Generate API index
      const apiIndex = await this.generateAPIIndex(analysis);
      await fs.writeFile(path.join(outputDir, 'apps/api/src/index.ts'), apiIndex);
      files.push('apps/api/src/index.ts');

      // 5. Generate frontend pages
      await this.generateFrontend(outputDir, analysis, files);

      // 6. Generate seed data
      const seedScript = await this.generateSeedScript(analysis);
      await fs.writeFile(path.join(outputDir, 'apps/api/prisma/seed.ts'), seedScript);
      files.push('apps/api/prisma/seed.ts');

      // 7. Generate tests
      await this.generateTests(outputDir, analysis, files);

      // 8. Generate CI/CD
      await this.generateCICD(outputDir, analysis);
      files.push('.github/workflows/ci.yml', 'render.yaml');

      // 9. Generate README
      const readme = await this.generateREADME(analysis, projectSlug);
      await fs.writeFile(path.join(outputDir, 'README.md'), readme);
      files.push('README.md');

      logger.info(`Generated ${files.length} files`);

    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      errors.push(error);
      logger.error(`Generation error: ${error}`);
    }

    return { outputDir, files, errors };
  }

  private async scaffoldProject(outputDir: string, analysis: SaaSAnalysis, slug: string): Promise<void> {
    // Create directory structure (FLAT structure, no route groups - lesson learned)
    const dirs = [
      'apps/web/src/app',           // Root app dir
      'apps/web/src/components/ui',
      'apps/web/src/components/layout',
      'apps/web/src/components/forms',
      'apps/web/src/lib',
      'apps/api/src/routes',
      'apps/api/src/services',
      'apps/api/prisma',
      '.github/workflows',
    ];
    for (const dir of dirs) {
      await fs.ensureDir(path.join(outputDir, dir));
    }
    
    // Create entity page directories (flat structure)
    for (const entity of analysis.entities) {
      await fs.ensureDir(path.join(outputDir, `apps/web/src/app/${entity.name.toLowerCase()}s`));
    }

    // ESSENTIAL: Create Next.js config files (lesson learned from build failures)
    await fs.writeFile(path.join(outputDir, 'apps/web/next.config.js'), templates.NEXT_CONFIG);
    await fs.writeFile(path.join(outputDir, 'apps/web/tailwind.config.js'), templates.TAILWIND_CONFIG);
    await fs.writeFile(path.join(outputDir, 'apps/web/postcss.config.js'), templates.POSTCSS_CONFIG);
    await fs.writeFile(path.join(outputDir, 'apps/web/tsconfig.json'), templates.TSCONFIG_WEB);
    await fs.writeFile(path.join(outputDir, 'apps/web/next-env.d.ts'), templates.NEXT_ENV_DTS);
    
    // Create root layout and globals (REQUIRED for Next.js App Router)
    await fs.writeFile(
      path.join(outputDir, 'apps/web/src/app/layout.tsx'),
      templates.generateRootLayout(analysis.name, analysis.description)
    );
    await fs.writeFile(
      path.join(outputDir, 'apps/web/src/app/globals.css'),
      templates.GLOBALS_CSS
    );
    
    // Create home page
    const featureNames = analysis.coreFeatures.map(f => f.name);
    const entityNames = analysis.entities.map(e => e.name);
    await fs.writeFile(
      path.join(outputDir, 'apps/web/src/app/page.tsx'),
      templates.generateHomePage(analysis.name, featureNames, entityNames)
    );

    // Root package.json
    await fs.writeJson(path.join(outputDir, 'package.json'), {
      name: slug,
      version: '1.0.0',
      private: true,
      scripts: {
        dev: 'pnpm -r dev',
        build: 'pnpm -r build',
        lint: 'pnpm -r lint',
        test: 'pnpm -r test',
        'db:push': 'pnpm --filter api db:push',
        'db:seed': 'pnpm --filter api db:seed',
      },
      devDependencies: { typescript: '^5.3.3' },
    }, { spaces: 2 });

    // pnpm-workspace.yaml
    await fs.writeFile(path.join(outputDir, 'pnpm-workspace.yaml'), 
      "packages:\n  - 'apps/*'\n  - 'packages/*'\n");

    // .gitignore
    await fs.writeFile(path.join(outputDir, '.gitignore'),
      'node_modules/\n.next/\ndist/\n.env\n.env.local\n*.log\n');

    // .env.example
    await fs.writeFile(path.join(outputDir, '.env.example'), `
DATABASE_URL="postgresql://user:password@localhost:5432/${slug}?schema=public"
NEXTAUTH_SECRET="generate-with-openssl-rand-base64-32"
NEXTAUTH_URL="http://localhost:3000"
API_URL="http://localhost:3001"
DEMO_MODE="true"
`.trim());

    // Web package.json (using exact versions from templates - lesson learned)
    await fs.writeJson(path.join(outputDir, 'apps/web/package.json'), {
      name: `${slug}-web`,
      version: '1.0.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
      },
      dependencies: templates.WEB_PACKAGE_JSON.dependencies,
      devDependencies: templates.WEB_PACKAGE_JSON.devDependencies,
    }, { spaces: 2 });

    // API package.json
    await fs.writeJson(path.join(outputDir, 'apps/api/package.json'), {
      name: `@${slug}/api`,
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'tsx watch src/index.ts',
        build: 'tsc',
        start: 'node dist/index.js',
        'db:push': 'prisma db push',
        'db:seed': 'tsx prisma/seed.ts',
      },
      dependencies: {
        fastify: '^4.25.0',
        '@fastify/cors': '^8.5.0',
        '@prisma/client': '^5.8.0',
        zod: '^3.22.0',
        pino: '^8.19.0',
        bcryptjs: '^2.4.3',
      },
      devDependencies: {
        typescript: '^5.3.0',
        '@types/node': '^20.11.0',
        '@types/bcryptjs': '^2.4.6',
        tsx: '^4.7.0',
        prisma: '^5.8.0',
      },
    }, { spaces: 2 });
  }

  private async generatePrismaSchema(analysis: SaaSAnalysis): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Generate a Prisma schema for these entities:

${JSON.stringify(analysis.entities, null, 2)}

Include:
1. Standard generator and datasource blocks for PostgreSQL
2. User model with email, passwordHash, name, role, timestamps
3. Organization model with name and timestamps
4. AuditLog model for tracking actions
5. All entities from the list with proper relations
6. Use cuid() for IDs
7. Add createdAt/updatedAt timestamps to all models
8. Proper relation fields with @relation directives

Return ONLY the Prisma schema code, no markdown.`
      }],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  private async generateAPIRoute(entity: Entity, analysis: SaaSAnalysis): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Generate a Fastify route file for entity "${entity.name}" with these fields:

${JSON.stringify(entity, null, 2)}

Requirements:
1. TypeScript with ES modules
2. Full CRUD operations (list, get, create, update, delete)
3. Zod validation schemas
4. Prisma client for database operations
5. Audit logging for all mutations
6. Proper error handling
7. Export a register function that takes (app, prisma)

Return ONLY TypeScript code, no markdown.`
      }],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  private async generateAPIIndex(analysis: SaaSAnalysis): Promise<string> {
    const imports = analysis.entities
      .map(e => `import { register${e.name}Routes } from './routes/${e.name.toLowerCase()}.js';`)
      .join('\n');
    
    const registers = analysis.entities
      .map(e => `  register${e.name}Routes(app, prisma);`)
      .join('\n');

    return `import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
${imports}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const prisma = new PrismaClient();
const app = Fastify({ logger });

await app.register(cors, {
  origin: process.env.WEB_URL || 'http://localhost:3000',
  credentials: true,
});

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

${registers}

const port = parseInt(process.env.PORT || '3001');
const host = process.env.HOST || '0.0.0.0';

try {
  await app.listen({ port, host });
  logger.info(\`API server running on \${host}:\${port}\`);
} catch (err) {
  logger.error(err);
  process.exit(1);
}
`;
  }

  private async generateFrontend(outputDir: string, analysis: SaaSAnalysis, files: string[]): Promise<void> {
    // Generate each page using Claude (FLAT routing, no route groups - lesson learned)
    for (const entity of analysis.entities) {
      const slug = entity.name.toLowerCase() + 's';
      
      // List page (flat route: /users, /workspaces, etc.)
      const listPage = await this.generatePageCode(entity, 'list', analysis);
      const listPath = `apps/web/src/app/${slug}/page.tsx`;
      await fs.ensureDir(path.dirname(path.join(outputDir, listPath)));
      await fs.writeFile(path.join(outputDir, listPath), listPage);
      files.push(listPath);

      // Form component
      const formCode = await this.generateFormCode(entity);
      const formPath = `apps/web/src/components/forms/${entity.name.toLowerCase()}-form.tsx`;
      await fs.ensureDir(path.dirname(path.join(outputDir, formPath)));
      await fs.writeFile(path.join(outputDir, formPath), formCode);
      files.push(formPath);
    }

    // Dashboard (flat route: /dashboard)
    await fs.ensureDir(path.join(outputDir, 'apps/web/src/app/dashboard'));
    const dashboard = await this.generateDashboard(analysis);
    await fs.writeFile(path.join(outputDir, 'apps/web/src/app/dashboard/page.tsx'), dashboard);
    files.push('apps/web/src/app/dashboard/page.tsx');
    
    // Note: Root layout already created in scaffoldProject with templates

    // Login
    const login = await this.generateLoginPage(analysis);
    await fs.writeFile(path.join(outputDir, 'apps/web/src/app/login/page.tsx'), login);
    files.push('apps/web/src/app/login/page.tsx');

    // Root layout
    const rootLayout = `import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '${analysis.name}',
  description: '${analysis.description}',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
`;
    await fs.writeFile(path.join(outputDir, 'apps/web/src/app/layout.tsx'), rootLayout);
    files.push('apps/web/src/app/layout.tsx');

    // Global CSS
    const globalCss = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;
    await fs.writeFile(path.join(outputDir, 'apps/web/src/app/globals.css'), globalCss);
    files.push('apps/web/src/app/globals.css');

    // Tailwind config
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
`;
    await fs.writeFile(path.join(outputDir, 'apps/web/tailwind.config.js'), tailwindConfig);
    files.push('apps/web/tailwind.config.js');

    // Next config
    const nextConfig = `/** @type {import('next').NextConfig} */
module.exports = { reactStrictMode: true };
`;
    await fs.writeFile(path.join(outputDir, 'apps/web/next.config.js'), nextConfig);
    files.push('apps/web/next.config.js');

    // TypeScript config for web
    await fs.writeJson(path.join(outputDir, 'apps/web/tsconfig.json'), {
      compilerOptions: {
        target: 'ES2022',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./src/*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx'],
      exclude: ['node_modules'],
    }, { spaces: 2 });
    files.push('apps/web/tsconfig.json');
  }

  private async generatePageCode(entity: Entity, type: 'list' | 'detail' | 'form', analysis: SaaSAnalysis): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Generate a Next.js 14 App Router page for entity "${entity.name}" (${type} view).

Entity: ${JSON.stringify(entity, null, 2)}

Requirements:
1. 'use client' directive
2. Full CRUD functionality
3. Loading states with skeletons
4. Empty states
5. Error handling with toast notifications
6. Responsive design with Tailwind
7. Clean, modern UI
8. NO feature locks, NO "coming soon", NO upgrade prompts
9. Search and filter functionality for list views
10. Use lucide-react icons

Return ONLY the TSX code, no markdown.`
      }],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  private async generateFormCode(entity: Entity): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Generate a React form component for entity "${entity.name}".

Entity: ${JSON.stringify(entity, null, 2)}

Requirements:
1. Use react-hook-form
2. All fields from the entity
3. Proper input types (text, number, date, select for enums)
4. Validation
5. Submit and cancel buttons
6. Loading state during submission
7. TypeScript interfaces

Return ONLY the TSX code, no markdown.`
      }],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  private async generateDashboard(analysis: SaaSAnalysis): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Generate a Next.js dashboard page for a ${analysis.category} application called "${analysis.name}".

Features: ${analysis.coreFeatures.map(f => f.name).join(', ')}
Entities: ${analysis.entities.map(e => e.name).join(', ')}

Requirements:
1. Stats cards showing counts for each entity
2. Recent activity feed
3. Quick action buttons
4. Charts/graphs for key metrics (use simple divs as placeholders)
5. Responsive grid layout
6. Modern, clean design
7. NO feature locks or upgrade prompts

Return ONLY the TSX code, no markdown.`
      }],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  private async generateLayout(analysis: SaaSAnalysis): Promise<string> {
    const navItems = analysis.entities.map(e => ({
      name: e.name + 's',
      href: '/' + e.name.toLowerCase() + 's',
    }));

    return `import Link from 'next/link';
import { Home, Settings, Menu, ${analysis.entities.map(() => 'Folder').join(', ')} } from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: Home },
${navItems.map(n => `  { name: '${n.name}', href: '${n.href}', icon: Folder },`).join('\n')}
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <aside className="fixed inset-y-0 left-0 w-64 bg-gray-900 hidden lg:block">
        <div className="flex items-center h-16 px-4">
          <span className="text-xl font-bold text-white">${analysis.name}</span>
        </div>
        <nav className="px-2 py-4 space-y-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="flex items-center px-3 py-2 text-gray-300 rounded-md hover:bg-gray-800 hover:text-white"
            >
              <item.icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="lg:pl-64 p-6">{children}</main>
    </div>
  );
}
`;
  }

  private async generateLoginPage(analysis: SaaSAnalysis): Promise<string> {
    return `'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    
    // Demo login - accepts any credentials
    setTimeout(() => {
      toast.success('Welcome to ${analysis.name}!');
      router.push('/dashboard');
    }, 500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg">
        <h2 className="text-center text-3xl font-bold text-gray-900">${analysis.name}</h2>
        <p className="mt-2 text-center text-sm text-gray-600">Sign in to continue</p>
        
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="admin@demo.local"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 text-center">
            Demo: admin@demo.local / demo123456
          </p>
        </div>
      </div>
    </div>
  );
}
`;
  }

  private async generateSeedScript(analysis: SaaSAnalysis): Promise<string> {
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Generate a Prisma seed script that creates:
1. 1 demo organization
2. 2 users (admin and member)
3. 25+ realistic records for each entity

Entities: ${JSON.stringify(analysis.entities, null, 2)}

Requirements:
1. TypeScript with ES modules
2. Use bcryptjs for password hashing
3. Realistic fake data (names, emails, dates, etc.)
4. Proper relations between entities
5. Print credentials at the end

Return ONLY TypeScript code, no markdown.`
      }],
    });

    const content = response.content[0];
    return content.type === 'text' ? content.text : '';
  }

  private async generateTests(outputDir: string, analysis: SaaSAnalysis, files: string[]): Promise<void> {
    // Generate basic smoke tests
    const smokeTest = `import { test, expect } from '@playwright/test';

test.describe('${analysis.name} Smoke Tests', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('${analysis.name}');
  });

  test('can login with demo credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@demo.local');
    await page.fill('input[type="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
  });

  test('dashboard shows stats', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@demo.local');
    await page.fill('input[type="password"]', 'demo123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('no forbidden patterns on pages', async ({ page }) => {
    const forbidden = ['unlock', 'upgrade', 'pro feature', 'subscribe', 'paywall'];
    await page.goto('/dashboard');
    const content = await page.textContent('body');
    for (const pattern of forbidden) {
      expect(content?.toLowerCase()).not.toContain(pattern);
    }
  });
});
`;
    await fs.ensureDir(path.join(outputDir, 'apps/web/tests'));
    await fs.writeFile(path.join(outputDir, 'apps/web/tests/smoke.spec.ts'), smokeTest);
    files.push('apps/web/tests/smoke.spec.ts');

    // Playwright config
    const pwConfig = `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:3000' },
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000' },
});
`;
    await fs.writeFile(path.join(outputDir, 'apps/web/playwright.config.ts'), pwConfig);
    files.push('apps/web/playwright.config.ts');
  }

  private async generateCICD(outputDir: string, analysis: SaaSAnalysis): Promise<void> {
    const ciWorkflow = `name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with: { version: 8 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm build
`;
    await fs.ensureDir(path.join(outputDir, '.github/workflows'));
    await fs.writeFile(path.join(outputDir, '.github/workflows/ci.yml'), ciWorkflow);

    const slug = analysis.name.toLowerCase().replace(/\s+/g, '-');
    const renderYaml = `services:
  - type: web
    name: ${slug}-web
    runtime: node
    buildCommand: npm install -g pnpm && pnpm install && cd apps/web && pnpm build
    startCommand: cd apps/web && pnpm start
    envVars:
      - key: NEXT_PUBLIC_API_URL
        fromService:
          name: ${slug}-api
          type: web
          property: host
          prefix: https://

  - type: web
    name: ${slug}-api
    runtime: node
    buildCommand: npm install -g pnpm && pnpm install && cd apps/api && npx prisma generate && pnpm build
    startCommand: cd apps/api && node dist/index.js
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: ${slug}-db
          property: connectionString
      - key: DEMO_MODE
        value: "true"

databases:
  - name: ${slug}-db
    plan: free
`;
    await fs.writeFile(path.join(outputDir, 'render.yaml'), renderYaml);
  }

  private async generateREADME(analysis: SaaSAnalysis, slug: string): Promise<string> {
    return `# ${analysis.name}

${analysis.description}

## Features

${analysis.coreFeatures.map(f => `- **${f.name}**: ${f.description}`).join('\n')}

## Quick Start

\`\`\`bash
pnpm install
cp .env.example .env
# Edit .env with your database URL
pnpm db:push
pnpm db:seed
pnpm dev
\`\`\`

## Demo Credentials

- **Admin**: admin@demo.local / demo123456
- **Member**: member@demo.local / demo123456

## Tech Stack

- **Frontend**: ${analysis.techStack.frontend}
- **Backend**: ${analysis.techStack.backend}
- **Database**: ${analysis.techStack.database}
- **Auth**: ${analysis.techStack.auth}

## Deployment

Deploy to Render using the included \`render.yaml\` blueprint.

---

Generated by AppLabs2
`;
  }
}
