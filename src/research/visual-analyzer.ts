/**
 * Visual Analyzer - Captures and analyzes target SaaS UI
 * Uses screenshots + Claude Vision to understand visual design
 */
import Anthropic from '@anthropic-ai/sdk';
import { chromium, Browser, Page } from 'playwright';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface VisualAnalysis {
  // Colors
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  
  // Layout
  layoutType: 'sidebar-left' | 'sidebar-right' | 'top-nav' | 'dashboard';
  hasFixedHeader: boolean;
  hasSidebar: boolean;
  sidebarWidth: string;
  contentMaxWidth: string;
  
  // Typography
  fontFamily: string;
  headingStyle: string;
  
  // Components detected
  components: VisualComponent[];
  
  // Screenshots (base64)
  screenshots: {
    landing: string;
    dashboard?: string;
    listView?: string;
    detailView?: string;
  };
  
  // Raw design tokens
  designTokens: Record<string, string>;
}

export interface VisualComponent {
  name: string;
  type: 'navbar' | 'sidebar' | 'card' | 'table' | 'form' | 'modal' | 'button' | 'input' | 'dropdown' | 'tabs' | 'breadcrumb' | 'search' | 'avatar' | 'badge' | 'chart';
  description: string;
  styling: string; // Tailwind classes suggestion
}

export class VisualAnalyzer {
  private anthropic: Anthropic;
  private browser: Browser | null = null;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

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
   * Capture screenshots of target SaaS
   */
  async captureScreenshots(url: string, outputDir: string): Promise<string[]> {
    if (!this.browser) await this.initialize();
    
    const page = await this.browser!.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    
    const screenshots: string[] = [];
    const screenshotDir = path.join(outputDir, 'screenshots');
    await fs.ensureDir(screenshotDir);

    try {
      logger.info(`Capturing screenshots of: ${url}`);
      
      // Landing/Home page
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000); // Let animations settle
      
      const landingPath = path.join(screenshotDir, 'landing.png');
      await page.screenshot({ path: landingPath, fullPage: false });
      screenshots.push(landingPath);
      logger.info('Captured landing page');

      // Try to find and capture dashboard/app view
      const dashboardLinks = await page.$$('a[href*="dashboard"], a[href*="app"], a[href*="console"], button:has-text("Try"), button:has-text("Demo")');
      if (dashboardLinks.length > 0) {
        try {
          await dashboardLinks[0].click();
          await page.waitForTimeout(3000);
          const dashPath = path.join(screenshotDir, 'dashboard.png');
          await page.screenshot({ path: dashPath, fullPage: false });
          screenshots.push(dashPath);
          logger.info('Captured dashboard view');
        } catch (e) {
          // Ignore navigation errors
        }
      }

      // Full page scroll capture for more context
      const fullPath = path.join(screenshotDir, 'full-page.png');
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.screenshot({ path: fullPath, fullPage: true });
      screenshots.push(fullPath);

    } catch (e: any) {
      logger.warn(`Screenshot capture error: ${e.message}`);
    } finally {
      await page.close();
    }

    return screenshots;
  }

  /**
   * Analyze screenshots with Claude Vision
   */
  async analyzeVisuals(screenshotPaths: string[]): Promise<VisualAnalysis> {
    // Read screenshots as base64
    const images = await Promise.all(
      screenshotPaths.slice(0, 3).map(async (p) => {
        const buffer = await fs.readFile(p);
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: buffer.toString('base64'),
          },
        };
      })
    );

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            ...images,
            {
              type: 'text',
              text: `Analyze these screenshots of a SaaS application and extract the visual design system.

Return a JSON object with this exact structure:
{
  "primaryColor": "#hex color used for primary actions/branding",
  "secondaryColor": "#hex secondary color",
  "backgroundColor": "#hex main background",
  "textColor": "#hex main text color",
  "accentColor": "#hex accent/highlight color",
  
  "layoutType": "sidebar-left" | "sidebar-right" | "top-nav" | "dashboard",
  "hasFixedHeader": true/false,
  "hasSidebar": true/false,
  "sidebarWidth": "width in px or rem",
  "contentMaxWidth": "max-width of main content",
  
  "fontFamily": "font family name or type (sans-serif, etc)",
  "headingStyle": "description of heading styles",
  
  "components": [
    {
      "name": "component name",
      "type": "navbar|sidebar|card|table|form|modal|button|input|dropdown|tabs|breadcrumb|search|avatar|badge|chart",
      "description": "what it looks like and does",
      "styling": "suggested Tailwind CSS classes to recreate it"
    }
  ],
  
  "designTokens": {
    "borderRadius": "rounded-X",
    "shadowStyle": "shadow-X",
    "spacing": "description of spacing patterns",
    "buttonStyle": "Tailwind classes for buttons",
    "cardStyle": "Tailwind classes for cards",
    "inputStyle": "Tailwind classes for inputs"
  }
}

Be specific with the Tailwind classes. Look at:
- Color palette (exact hex codes if visible)
- Border radius patterns
- Shadow usage
- Spacing/padding patterns
- Component styles

Return ONLY valid JSON, no markdown.`,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    // Parse JSON response
    let analysis: VisualAnalysis;
    try {
      const jsonStr = content.text.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(jsonStr);
    } catch (e) {
      logger.warn('Failed to parse visual analysis, using defaults');
      analysis = this.getDefaultAnalysis();
    }

    // Add screenshots as base64
    analysis.screenshots = {
      landing: await this.imageToBase64(screenshotPaths[0]),
    };
    if (screenshotPaths[1]) {
      analysis.screenshots.dashboard = await this.imageToBase64(screenshotPaths[1]);
    }

    return analysis;
  }

  /**
   * Generate Tailwind config based on visual analysis
   */
  generateTailwindConfig(analysis: VisualAnalysis): string {
    return `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '${analysis.primaryColor}',
          50: '${this.lighten(analysis.primaryColor, 0.9)}',
          100: '${this.lighten(analysis.primaryColor, 0.8)}',
          500: '${analysis.primaryColor}',
          600: '${this.darken(analysis.primaryColor, 0.1)}',
          700: '${this.darken(analysis.primaryColor, 0.2)}',
        },
        secondary: '${analysis.secondaryColor}',
        accent: '${analysis.accentColor}',
        background: '${analysis.backgroundColor}',
      },
      fontFamily: {
        sans: ['${analysis.fontFamily}', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
`;
  }

  /**
   * Generate CSS variables
   */
  generateCSSVariables(analysis: VisualAnalysis): string {
    return `:root {
  --color-primary: ${analysis.primaryColor};
  --color-secondary: ${analysis.secondaryColor};
  --color-accent: ${analysis.accentColor};
  --color-background: ${analysis.backgroundColor};
  --color-text: ${analysis.textColor};
  
  --font-family: ${analysis.fontFamily}, system-ui, sans-serif;
  
  --sidebar-width: ${analysis.sidebarWidth || '256px'};
  --content-max-width: ${analysis.contentMaxWidth || '1280px'};
  
  --border-radius: ${analysis.designTokens?.borderRadius || '0.5rem'};
  --shadow: ${analysis.designTokens?.shadowStyle || '0 1px 3px rgba(0,0,0,0.1)'};
}
`;
  }

  private async imageToBase64(filePath: string): Promise<string> {
    try {
      const buffer = await fs.readFile(filePath);
      return buffer.toString('base64');
    } catch {
      return '';
    }
  }

  private lighten(hex: string, amount: number): string {
    // Simple lightening - in production use a proper color library
    return hex; // Placeholder
  }

  private darken(hex: string, amount: number): string {
    return hex; // Placeholder
  }

  private getDefaultAnalysis(): VisualAnalysis {
    return {
      primaryColor: '#3b82f6',
      secondaryColor: '#64748b',
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      accentColor: '#8b5cf6',
      layoutType: 'sidebar-left',
      hasFixedHeader: true,
      hasSidebar: true,
      sidebarWidth: '256px',
      contentMaxWidth: '1280px',
      fontFamily: 'Inter',
      headingStyle: 'font-bold tracking-tight',
      components: [],
      screenshots: { landing: '' },
      designTokens: {
        borderRadius: 'rounded-lg',
        shadowStyle: 'shadow-sm',
        spacing: 'p-4 space-y-4',
        buttonStyle: 'px-4 py-2 rounded-lg font-medium',
        cardStyle: 'bg-white rounded-xl border shadow-sm p-6',
        inputStyle: 'px-4 py-2 border rounded-lg focus:ring-2',
      },
    };
  }
}
