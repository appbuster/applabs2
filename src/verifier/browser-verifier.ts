/**
 * Browser-Based Parity Verifier
 * Actually loads the deployed app and tests functionality
 */
import { chromium, Browser, Page } from 'playwright';
import { SaaSAnalysis } from '../research/index.js';
import { logger } from '../utils/logger.js';

export interface BrowserCheck {
  name: string;
  category: 'ui' | 'navigation' | 'crud' | 'search' | 'forms';
  passed: boolean;
  score: number; // 0-100
  details: string;
  screenshot?: string;
}

export interface BrowserParityReport {
  url: string;
  totalScore: number;
  checks: BrowserCheck[];
  passesThreshold: boolean;
  recommendations: string[];
}

const PARITY_THRESHOLD = 90;

export class BrowserVerifier {
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Verify a deployed app against the target SaaS spec
   */
  async verify(
    deployedUrl: string,
    analysis: SaaSAnalysis
  ): Promise<BrowserParityReport> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    const checks: BrowserCheck[] = [];

    try {
      logger.info(`Browser verifying: ${deployedUrl}`);

      // 1. Basic page load
      checks.push(await this.checkPageLoad(page, deployedUrl));

      // 2. Landing page elements
      checks.push(await this.checkLandingPage(page, analysis));

      // 3. Navigation
      checks.push(await this.checkNavigation(page, analysis));

      // 4. List views for each entity
      for (const entity of analysis.entities.slice(0, 3)) {
        checks.push(await this.checkListView(page, deployedUrl, entity.name));
      }

      // 5. Forms/CRUD
      checks.push(await this.checkForms(page));

      // 6. Search functionality
      checks.push(await this.checkSearch(page));

      // 7. Responsive design
      checks.push(await this.checkResponsive(page, deployedUrl));

      // 8. Mock data present
      checks.push(await this.checkMockData(page));

      // Calculate total score
      const totalScore = this.calculateScore(checks);
      const recommendations = this.getRecommendations(checks);

      return {
        url: deployedUrl,
        totalScore,
        checks,
        passesThreshold: totalScore >= PARITY_THRESHOLD,
        recommendations,
      };

    } finally {
      await page.close();
    }
  }

  private async checkPageLoad(page: Page, url: string): Promise<BrowserCheck> {
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const status = response?.status() || 0;
      
      if (status === 200) {
        const title = await page.title();
        return {
          name: 'Page Load',
          category: 'ui',
          passed: true,
          score: 100,
          details: `Page loaded successfully with title: "${title}"`,
        };
      } else {
        return {
          name: 'Page Load',
          category: 'ui',
          passed: false,
          score: 0,
          details: `Page returned status ${status}`,
        };
      }
    } catch (e: any) {
      return {
        name: 'Page Load',
        category: 'ui',
        passed: false,
        score: 0,
        details: `Failed to load: ${e.message}`,
      };
    }
  }

  private async checkLandingPage(page: Page, analysis: SaaSAnalysis): Promise<BrowserCheck> {
    try {
      // Check for hero section elements
      const hasHeading = await page.$('h1, h2') !== null;
      const hasButton = await page.$('button, a[href]') !== null;
      const hasDescription = await page.$('p') !== null;
      
      // Check for the app name or related text
      const pageText = await page.textContent('body') || '';
      const hasAppName = pageText.toLowerCase().includes(analysis.name.toLowerCase()) ||
                         pageText.includes('workspace') ||
                         pageText.includes('productivity');

      const score = [hasHeading, hasButton, hasDescription, hasAppName]
        .filter(Boolean).length * 25;

      return {
        name: 'Landing Page',
        category: 'ui',
        passed: score >= 75,
        score,
        details: `Hero: ${hasHeading ? '✓' : '✗'}, CTA: ${hasButton ? '✓' : '✗'}, Description: ${hasDescription ? '✓' : '✗'}, Branding: ${hasAppName ? '✓' : '✗'}`,
      };
    } catch (e: any) {
      return {
        name: 'Landing Page',
        category: 'ui',
        passed: false,
        score: 0,
        details: `Error checking landing page: ${e.message}`,
      };
    }
  }

  private async checkNavigation(page: Page, analysis: SaaSAnalysis): Promise<BrowserCheck> {
    try {
      // Check for navigation elements
      const hasNav = await page.$('nav, header, [role="navigation"]') !== null;
      const links = await page.$$('a[href]');
      const hasMultipleLinks = links.length >= 3;
      
      // Check for entity-related links
      const hrefs = await Promise.all(links.map(l => l.getAttribute('href')));
      const hasEntityLinks = analysis.entities.some(e => 
        hrefs.some(h => h?.toLowerCase().includes(e.name.toLowerCase()))
      );

      const score = [hasNav, hasMultipleLinks, hasEntityLinks]
        .filter(Boolean).length * 33;

      return {
        name: 'Navigation',
        category: 'navigation',
        passed: score >= 66,
        score: Math.min(100, score),
        details: `Nav element: ${hasNav ? '✓' : '✗'}, Links: ${links.length}, Entity links: ${hasEntityLinks ? '✓' : '✗'}`,
      };
    } catch (e: any) {
      return {
        name: 'Navigation',
        category: 'navigation',
        passed: false,
        score: 0,
        details: `Error checking navigation: ${e.message}`,
      };
    }
  }

  private async checkListView(page: Page, baseUrl: string, entityName: string): Promise<BrowserCheck> {
    const slug = entityName.toLowerCase() + 's';
    const url = `${baseUrl}/${slug}`;
    
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      
      // Check for list elements
      const hasList = await page.$('table, ul, [class*="grid"], [class*="list"]') !== null;
      const hasItems = await page.$$('tr, li, [class*="card"], [class*="item"]');
      const hasHeading = await page.$('h1, h2') !== null;
      
      const itemCount = hasItems.length;
      const score = hasList ? (itemCount > 0 ? 100 : 60) : (hasHeading ? 30 : 0);

      return {
        name: `List View: ${entityName}`,
        category: 'crud',
        passed: score >= 60,
        score,
        details: `Route /${slug}: List: ${hasList ? '✓' : '✗'}, Items: ${itemCount}`,
      };
    } catch (e: any) {
      // Route might not exist
      return {
        name: `List View: ${entityName}`,
        category: 'crud',
        passed: false,
        score: 0,
        details: `Route /${slug} not accessible`,
      };
    }
  }

  private async checkForms(page: Page): Promise<BrowserCheck> {
    try {
      // Look for forms on current page or navigate to a create page
      let hasForm = await page.$('form') !== null;
      
      if (!hasForm) {
        // Try to find a create/new button and click it
        const createBtn = await page.$('button:has-text("Create"), button:has-text("New"), a:has-text("Create"), a:has-text("New")');
        if (createBtn) {
          await createBtn.click();
          await page.waitForTimeout(1000);
          hasForm = await page.$('form') !== null;
        }
      }

      if (hasForm) {
        const inputs = await page.$$('input, textarea, select');
        const hasSubmit = await page.$('button[type="submit"], button:has-text("Save"), button:has-text("Create")') !== null;
        
        const score = inputs.length >= 2 && hasSubmit ? 100 : (inputs.length > 0 ? 60 : 30);
        
        return {
          name: 'Forms/CRUD',
          category: 'forms',
          passed: score >= 60,
          score,
          details: `Form: ✓, Inputs: ${inputs.length}, Submit: ${hasSubmit ? '✓' : '✗'}`,
        };
      }

      return {
        name: 'Forms/CRUD',
        category: 'forms',
        passed: false,
        score: 0,
        details: 'No forms found',
      };
    } catch (e: any) {
      return {
        name: 'Forms/CRUD',
        category: 'forms',
        passed: false,
        score: 0,
        details: `Error checking forms: ${e.message}`,
      };
    }
  }

  private async checkSearch(page: Page): Promise<BrowserCheck> {
    try {
      // Go back to home
      await page.goto(page.url().split('/').slice(0, 3).join('/'), { waitUntil: 'networkidle', timeout: 10000 });
      
      const searchInput = await page.$('input[type="search"], input[placeholder*="search" i], input[placeholder*="Search" i], [class*="search"] input');
      
      if (searchInput) {
        return {
          name: 'Search',
          category: 'search',
          passed: true,
          score: 100,
          details: 'Search input found',
        };
      }

      // Check for filter elements
      const hasFilter = await page.$('select, [class*="filter"], button:has-text("Filter")') !== null;
      
      return {
        name: 'Search',
        category: 'search',
        passed: hasFilter,
        score: hasFilter ? 70 : 0,
        details: hasFilter ? 'Filter controls found' : 'No search/filter found',
      };
    } catch (e: any) {
      return {
        name: 'Search',
        category: 'search',
        passed: false,
        score: 0,
        details: `Error checking search: ${e.message}`,
      };
    }
  }

  private async checkResponsive(page: Page, url: string): Promise<BrowserCheck> {
    try {
      // Test mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto(url, { waitUntil: 'networkidle', timeout: 10000 });
      
      // Check if content is still visible and not broken
      const hasContent = await page.$('h1, h2, p, button') !== null;
      const hasOverflow = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth + 20;
      });

      // Reset viewport
      await page.setViewportSize({ width: 1280, height: 720 });

      const score = hasContent && !hasOverflow ? 100 : (hasContent ? 60 : 0);

      return {
        name: 'Responsive Design',
        category: 'ui',
        passed: score >= 60,
        score,
        details: `Mobile view: ${hasContent ? '✓' : '✗'}, No overflow: ${!hasOverflow ? '✓' : '✗'}`,
      };
    } catch (e: any) {
      return {
        name: 'Responsive Design',
        category: 'ui',
        passed: false,
        score: 0,
        details: `Error checking responsive: ${e.message}`,
      };
    }
  }

  private async checkMockData(page: Page): Promise<BrowserCheck> {
    try {
      const pageText = await page.textContent('body') || '';
      
      // Check for signs of mock/sample data
      const hasMockIndicators = 
        pageText.includes('Sample') ||
        pageText.includes('Demo') ||
        pageText.includes('Example') ||
        pageText.includes('Test') ||
        /\d+ (items?|pages?|documents?|workspaces?)/i.test(pageText);
      
      // Check for actual content (not just empty states)
      const hasContent = pageText.length > 500;

      const score = hasMockIndicators && hasContent ? 100 : (hasContent ? 70 : 0);

      return {
        name: 'Mock Data',
        category: 'crud',
        passed: score >= 70,
        score,
        details: `Content length: ${pageText.length}, Mock indicators: ${hasMockIndicators ? '✓' : '✗'}`,
      };
    } catch (e: any) {
      return {
        name: 'Mock Data',
        category: 'crud',
        passed: false,
        score: 0,
        details: `Error checking mock data: ${e.message}`,
      };
    }
  }

  private calculateScore(checks: BrowserCheck[]): number {
    // Weighted scoring by category
    const weights: Record<string, number> = {
      ui: 20,
      navigation: 15,
      crud: 25,
      forms: 20,
      search: 10,
    };

    let totalWeight = 0;
    let weightedScore = 0;

    for (const check of checks) {
      const weight = weights[check.category] || 10;
      totalWeight += weight;
      weightedScore += (check.score / 100) * weight;
    }

    return Math.round((weightedScore / totalWeight) * 100);
  }

  private getRecommendations(checks: BrowserCheck[]): string[] {
    const recommendations: string[] = [];

    for (const check of checks) {
      if (!check.passed) {
        switch (check.category) {
          case 'ui':
            recommendations.push(`Improve ${check.name}: ${check.details}`);
            break;
          case 'navigation':
            recommendations.push('Add navigation header with links to all main sections');
            break;
          case 'crud':
            recommendations.push(`Add ${check.name} with data display and CRUD operations`);
            break;
          case 'forms':
            recommendations.push('Add create/edit forms with proper input fields and submit buttons');
            break;
          case 'search':
            recommendations.push('Add search or filter functionality');
            break;
        }
      }
    }

    return recommendations.slice(0, 5);
  }
}
