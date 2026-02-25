/**
 * Visual Parity Verifier
 * Compares generated app screenshots against target SaaS
 * Uses Claude Vision to score visual similarity
 */
import Anthropic from '@anthropic-ai/sdk';
import { chromium, Browser } from 'playwright';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

export interface VisualParityScore {
  overall: number; // 0-100
  layout: number;
  colors: number;
  typography: number;
  components: number;
  spacing: number;
  
  details: {
    matches: string[];
    mismatches: string[];
    suggestions: string[];
  };
}

export interface VisualParityReport {
  targetUrl: string;
  generatedUrl: string;
  scores: VisualParityScore;
  passesThreshold: boolean; // >= 90%
  screenshots: {
    target: string; // base64
    generated: string; // base64
  };
}

const VISUAL_PARITY_THRESHOLD = 90;

export class VisualParityVerifier {
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
   * Compare target SaaS with generated app visually
   */
  async compareVisuals(
    targetUrl: string,
    generatedUrl: string,
    outputDir: string
  ): Promise<VisualParityReport> {
    if (!this.browser) await this.initialize();

    logger.info(`Comparing visuals: ${targetUrl} vs ${generatedUrl}`);

    // Capture screenshots of both
    const targetScreenshot = await this.captureScreenshot(targetUrl, path.join(outputDir, 'target.png'));
    const generatedScreenshot = await this.captureScreenshot(generatedUrl, path.join(outputDir, 'generated.png'));

    // Compare with Claude Vision
    const scores = await this.analyzeVisualParity(targetScreenshot, generatedScreenshot);

    return {
      targetUrl,
      generatedUrl,
      scores,
      passesThreshold: scores.overall >= VISUAL_PARITY_THRESHOLD,
      screenshots: {
        target: await this.toBase64(targetScreenshot),
        generated: await this.toBase64(generatedScreenshot),
      },
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

  private async analyzeVisualParity(targetPath: string, generatedPath: string): Promise<VisualParityScore> {
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
              text: `Compare these two screenshots. The FIRST image is the TARGET design we want to match. The SECOND image is our GENERATED clone.

Score the visual similarity (0-100) in these categories:

1. **Layout** (0-100): Does the generated app have the same layout structure? (sidebar position, header, content areas)
2. **Colors** (0-100): Are the colors similar? (primary, secondary, background, accents)
3. **Typography** (0-100): Are fonts, sizes, and text styles similar?
4. **Components** (0-100): Do buttons, cards, inputs, tables look similar?
5. **Spacing** (0-100): Is the spacing/padding/margins similar?

Return JSON:
{
  "overall": <weighted average 0-100>,
  "layout": <score>,
  "colors": <score>,
  "typography": <score>,
  "components": <score>,
  "spacing": <score>,
  "details": {
    "matches": ["list of things that match well"],
    "mismatches": ["list of major differences"],
    "suggestions": ["specific changes to improve parity"]
  }
}

Be strict but fair. 90+ means very close match. 70-89 means good but noticeable differences. Below 70 means significant differences.

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
      logger.warn('Failed to parse visual parity response');
      return {
        overall: 50,
        layout: 50,
        colors: 50,
        typography: 50,
        components: 50,
        spacing: 50,
        details: {
          matches: [],
          mismatches: ['Unable to analyze'],
          suggestions: ['Manual review needed'],
        },
      };
    }
  }

  private async toBase64(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);
    return buffer.toString('base64');
  }
}

/**
 * Generate UI improvements based on visual parity analysis
 */
export function generateVisualFixes(scores: VisualParityScore): string[] {
  const fixes: string[] = [];

  if (scores.colors < 80) {
    fixes.push('Update color palette to match target - check primary, secondary, and accent colors');
  }
  
  if (scores.layout < 80) {
    fixes.push('Adjust layout structure - check sidebar width, header height, content positioning');
  }
  
  if (scores.typography < 80) {
    fixes.push('Match typography - font family, sizes, weights, and line heights');
  }
  
  if (scores.components < 80) {
    fixes.push('Restyle components - buttons, cards, inputs should match target design');
  }
  
  if (scores.spacing < 80) {
    fixes.push('Adjust spacing - padding, margins, and gaps between elements');
  }

  // Add specific suggestions from analysis
  fixes.push(...scores.details.suggestions);

  return fixes;
}
