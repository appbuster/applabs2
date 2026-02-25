/**
 * Verifier Module - Checks generated app against target SaaS
 * Won't mark complete until 90% feature parity is achieved
 */
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import { SaaSAnalysis } from '../research/index.js';
import { logger } from '../utils/logger.js';

export interface FeatureCheck {
  feature: string;
  required: boolean;
  implemented: boolean;
  score: number; // 0-100
  notes: string;
}

export interface ParityReport {
  targetSaaS: string;
  generatedApp: string;
  overallScore: number; // 0-100
  featureChecks: FeatureCheck[];
  missingFeatures: string[];
  recommendations: string[];
  passesThreshold: boolean;
}

const PARITY_THRESHOLD = 90; // Must reach 90% to be "complete"

// Core features that most SaaS apps need (weighted heavily)
const CORE_FEATURE_WEIGHTS: Record<string, number> = {
  'landing_page': 10,
  'navigation': 8,
  'list_view': 10,
  'detail_view': 8,
  'create_form': 10,
  'edit_form': 8,
  'delete_action': 5,
  'search': 8,
  'responsive_design': 5,
  'loading_states': 3,
  'error_handling': 5,
  'empty_states': 3,
  'api_integration': 10,
  'mock_data': 7,
};

export class VerifierModule {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Check parity between generated app and target SaaS
   */
  async checkParity(
    analysis: SaaSAnalysis,
    outputDir: string,
    deployedUrl?: string
  ): Promise<ParityReport> {
    logger.info(`Checking parity for ${analysis.name}`);

    // Gather generated files
    const files = await this.gatherGeneratedFiles(outputDir);
    
    // Check each core feature
    const featureChecks = await this.checkFeatures(analysis, files, deployedUrl);
    
    // Calculate overall score
    const overallScore = this.calculateScore(featureChecks);
    
    // Get missing features
    const missingFeatures = featureChecks
      .filter(c => !c.implemented)
      .map(c => c.feature);

    // Get recommendations for improvement
    const recommendations = await this.getRecommendations(
      analysis,
      featureChecks,
      missingFeatures
    );

    const report: ParityReport = {
      targetSaaS: analysis.name,
      generatedApp: path.basename(outputDir),
      overallScore,
      featureChecks,
      missingFeatures,
      recommendations,
      passesThreshold: overallScore >= PARITY_THRESHOLD,
    };

    logger.info(`Parity score: ${overallScore}% (threshold: ${PARITY_THRESHOLD}%)`);
    
    return report;
  }

  /**
   * Gather all generated source files
   */
  private async gatherGeneratedFiles(outputDir: string): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.json'];
    
    const walk = async (dir: string) => {
      if (!await fs.pathExists(dir)) return;
      
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await walk(fullPath);
        } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const relativePath = path.relative(outputDir, fullPath);
          files.set(relativePath, content);
        }
      }
    };

    await walk(outputDir);
    return files;
  }

  /**
   * Check implementation of core features
   */
  private async checkFeatures(
    analysis: SaaSAnalysis,
    files: Map<string, string>,
    deployedUrl?: string
  ): Promise<FeatureCheck[]> {
    const checks: FeatureCheck[] = [];
    const allCode = Array.from(files.values()).join('\n');

    // 1. Landing Page
    checks.push({
      feature: 'landing_page',
      required: true,
      implemented: files.has('apps/web/src/app/page.tsx') && 
                   allCode.includes('Welcome') || allCode.includes('hero'),
      score: this.scoreFeature(allCode, ['Welcome', 'Get Started', 'hero', 'landing']),
      notes: 'Home page with hero section and CTA',
    });

    // 2. Navigation
    checks.push({
      feature: 'navigation',
      required: true,
      implemented: allCode.includes('<nav') || allCode.includes('navigation') || 
                   allCode.includes('<header'),
      score: this.scoreFeature(allCode, ['<nav', 'navigation', '<header', 'href=']),
      notes: 'Navigation header with links',
    });

    // 3. List Views (for each entity)
    const hasListViews = analysis.entities.every(e => {
      const slug = e.name.toLowerCase() + 's';
      return files.has(`apps/web/src/app/${slug}/page.tsx`);
    });
    checks.push({
      feature: 'list_view',
      required: true,
      implemented: hasListViews,
      score: hasListViews ? 100 : (analysis.entities.filter(e => 
        files.has(`apps/web/src/app/${e.name.toLowerCase()}s/page.tsx`)
      ).length / analysis.entities.length) * 100,
      notes: `List pages for entities: ${analysis.entities.map(e => e.name).join(', ')}`,
    });

    // 4. Create/Edit Forms
    const hasFormsCode = allCode.includes('form') && 
                         (allCode.includes('onSubmit') || allCode.includes('handleSubmit'));
    checks.push({
      feature: 'create_form',
      required: true,
      implemented: hasFormsCode,
      score: this.scoreFeature(allCode, ['<form', 'onSubmit', 'handleSubmit', '<input', '<button']),
      notes: 'Forms for creating/editing data',
    });

    // 5. Search Functionality
    checks.push({
      feature: 'search',
      required: true,
      implemented: allCode.includes('search') || allCode.includes('filter'),
      score: this.scoreFeature(allCode, ['search', 'filter', 'query', 'Search']),
      notes: 'Search or filter functionality',
    });

    // 6. API Integration
    const hasApiRoutes = Array.from(files.keys()).some(f => f.includes('routes/'));
    const hasFetch = allCode.includes('fetch(') || allCode.includes('axios');
    checks.push({
      feature: 'api_integration',
      required: true,
      implemented: hasApiRoutes,
      score: hasApiRoutes ? (hasFetch ? 100 : 70) : 0,
      notes: 'Backend API with CRUD endpoints',
    });

    // 7. Mock Data
    checks.push({
      feature: 'mock_data',
      required: true,
      implemented: allCode.includes('mock') || allCode.includes('Mock') || 
                   allCode.includes('sample') || allCode.includes('demo'),
      score: this.scoreFeature(allCode, ['mock', 'Mock', 'sample', 'demo', 'seed']),
      notes: 'Mock/sample data for demonstration',
    });

    // 8. Responsive Design
    checks.push({
      feature: 'responsive_design',
      required: false,
      implemented: allCode.includes('md:') || allCode.includes('lg:') || 
                   allCode.includes('@media'),
      score: this.scoreFeature(allCode, ['md:', 'lg:', 'sm:', 'xl:', '@media', 'responsive']),
      notes: 'Mobile-responsive layout',
    });

    // 9. Loading States
    checks.push({
      feature: 'loading_states',
      required: false,
      implemented: allCode.includes('loading') || allCode.includes('Loading') ||
                   allCode.includes('isLoading'),
      score: this.scoreFeature(allCode, ['loading', 'Loading', 'isLoading', 'spinner']),
      notes: 'Loading indicators',
    });

    // 10. Error Handling
    checks.push({
      feature: 'error_handling',
      required: false,
      implemented: allCode.includes('error') || allCode.includes('catch') ||
                   allCode.includes('Error'),
      score: this.scoreFeature(allCode, ['error', 'Error', 'catch', 'try {']),
      notes: 'Error handling and display',
    });

    // 11. Empty States
    checks.push({
      feature: 'empty_states',
      required: false,
      implemented: allCode.includes('empty') || allCode.includes('no results') ||
                   allCode.includes('No data'),
      score: this.scoreFeature(allCode, ['empty', 'No ', 'nothing', 'no results']),
      notes: 'Empty state messages',
    });

    return checks;
  }

  /**
   * Score a feature based on keyword presence
   */
  private scoreFeature(code: string, keywords: string[]): number {
    const foundCount = keywords.filter(k => code.includes(k)).length;
    return Math.min(100, (foundCount / keywords.length) * 100);
  }

  /**
   * Calculate weighted overall score
   */
  private calculateScore(checks: FeatureCheck[]): number {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const check of checks) {
      const weight = CORE_FEATURE_WEIGHTS[check.feature] || 5;
      totalWeight += weight;
      weightedScore += (check.score / 100) * weight;
    }

    return Math.round((weightedScore / totalWeight) * 100);
  }

  /**
   * Get AI-powered recommendations for improvement
   */
  private async getRecommendations(
    analysis: SaaSAnalysis,
    checks: FeatureCheck[],
    missing: string[]
  ): Promise<string[]> {
    if (missing.length === 0) {
      return ['All core features implemented!'];
    }

    const recommendations: string[] = [];

    for (const feature of missing.slice(0, 5)) { // Top 5 missing
      const weight = CORE_FEATURE_WEIGHTS[feature] || 5;
      
      switch (feature) {
        case 'landing_page':
          recommendations.push(`Add a landing page at /page.tsx with hero section, feature highlights, and CTA buttons`);
          break;
        case 'list_view':
          recommendations.push(`Create list pages for each entity with table/card layouts showing all records`);
          break;
        case 'create_form':
          recommendations.push(`Add create/edit forms with proper validation using react-hook-form + zod`);
          break;
        case 'search':
          recommendations.push(`Implement search/filter functionality on list pages`);
          break;
        case 'api_integration':
          recommendations.push(`Create CRUD API endpoints in apps/api/src/routes/`);
          break;
        case 'mock_data':
          recommendations.push(`Add mock data arrays or seed scripts for demonstration`);
          break;
        default:
          recommendations.push(`Implement ${feature.replace('_', ' ')} functionality`);
      }
    }

    return recommendations;
  }
}

export { PARITY_THRESHOLD };
