/**
 * Differentiation Checker
 * Ensures generated app is DIFFERENT enough from target to avoid lawsuits
 * Opposite of visual parity - we WANT differences
 */
import Anthropic from '@anthropic-ai/sdk';
import { chromium, Browser } from 'playwright';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface DifferentiationScore {
  overall: number; // 0-100 (higher = more different = better)
  layoutDifferent: boolean;
  colorsDifferent: boolean;
  componentsDifferent: boolean;
  
  details: {
    similarities: string[]; // Things that are too similar (bad)
    differences: string[]; // Things that are different (good)
    suggestions: string[]; // How to differentiate more if needed
  };
}

export interface DifferentiationReport {
  targetUrl: string;
  generatedUrl: string;
  score: DifferentiationScore;
  passesCheck: boolean; // >= 60% different is safe
  legalRisk: 'low' | 'medium' | 'high';
}

const DIFFERENTIATION_THRESHOLD = 60; // Need to be at least 60% different

export class DifferentiationChecker {
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
   * Check that generated app is sufficiently different from target
   */
  async checkDifferentiation(
    targetUrl: string,
    generatedUrl: string,
    outputDir: string
  ): Promise<DifferentiationReport> {
    if (!this.browser) await this.initialize();

    logger.info(`Checking differentiation: ${targetUrl} vs ${generatedUrl}`);

    // Capture screenshots
    const targetScreenshot = await this.captureScreenshot(targetUrl, path.join(outputDir, 'target-diff.png'));
    const generatedScreenshot = await this.captureScreenshot(generatedUrl, path.join(outputDir, 'generated-diff.png'));

    // Analyze differentiation with Claude Vision
    const score = await this.analyzeDifferentiation(targetScreenshot, generatedScreenshot);

    const legalRisk = score.overall >= 70 ? 'low' : score.overall >= 50 ? 'medium' : 'high';

    return {
      targetUrl,
      generatedUrl,
      score,
      passesCheck: score.overall >= DIFFERENTIATION_THRESHOLD,
      legalRisk,
    };
  }

  private async captureScreenshot(url: string, outputPath: string): Promise<string> {
    const page = await this.browser!.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: outputPath, fullPage: false });
      return outputPath;
    } finally {
      await page.close();
    }
  }

  private async analyzeDifferentiation(targetPath: string, generatedPath: string): Promise<DifferentiationScore> {
    const targetBuffer = await fs.readFile(targetPath);
    const generatedBuffer = await fs.readFile(generatedPath);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: targetBuffer.toString('base64'),
              },
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: generatedBuffer.toString('base64'),
              },
            },
            {
              type: 'text',
              text: `Compare these two app screenshots. The FIRST is an existing product, the SECOND is our new product.

We need to ensure our product is DIFFERENT ENOUGH to avoid copyright/trade dress claims.

Analyze how DIFFERENT they are (NOT how similar):

1. **Layout**: Is the layout structure different? (sidebar position, header style, content arrangement)
2. **Colors**: Is the color scheme different? (primary colors, accents, backgrounds)
3. **Components**: Do buttons, cards, and UI elements look distinctly different?
4. **Overall Feel**: Would a user recognize these as different products?

Return JSON:
{
  "overall": <0-100, higher = more different = better for us>,
  "layoutDifferent": true/false,
  "colorsDifferent": true/false, 
  "componentsDifferent": true/false,
  "details": {
    "similarities": ["list things that are TOO SIMILAR - potential risk"],
    "differences": ["list things that ARE DIFFERENT - good for us"],
    "suggestions": ["if similarity is high, how to differentiate more"]
  }
}

Scoring guide:
- 80-100: Very different, low legal risk
- 60-79: Sufficiently different, acceptable
- 40-59: Some similarities, medium risk - consider changes
- 0-39: Too similar, high risk - needs redesign

Be strict about identifying similarities that could cause legal issues.

Return ONLY valid JSON.`,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      const jsonStr = content.text.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      logger.warn('Failed to parse differentiation response');
      return {
        overall: 50,
        layoutDifferent: true,
        colorsDifferent: true,
        componentsDifferent: true,
        details: {
          similarities: ['Unable to analyze'],
          differences: ['Unable to analyze'],
          suggestions: ['Manual review needed'],
        },
      };
    }
  }
}
