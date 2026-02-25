/**
 * Research Module - Analyzes SaaS products to understand features and structure
 */
import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

export interface SaaSAnalysis {
  name: string;
  category: string;
  description: string;
  coreFeatures: Feature[];
  entities: Entity[];
  userFlows: UserFlow[];
  uiPatterns: string[];
  techStack: TechRecommendation;
  pricing: PricingTier[];
}

export interface Feature {
  name: string;
  description: string;
  priority: 'core' | 'secondary' | 'nice-to-have';
  complexity: 'simple' | 'medium' | 'complex';
}

export interface Entity {
  name: string;
  fields: { name: string; type: string; required: boolean }[];
  relations: { target: string; type: string }[];
}

export interface UserFlow {
  name: string;
  steps: string[];
}

export interface TechRecommendation {
  frontend: string;
  backend: string;
  database: string;
  auth: string;
}

export interface PricingTier {
  name: string;
  features: string[];
}

export class ResearchModule {
  private anthropic: Anthropic;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({ apiKey });
  }

  async analyzeSaaS(input: {
    name: string;
    url?: string;
    description?: string;
  }): Promise<SaaSAnalysis> {
    logger.info(`Researching SaaS: ${input.name}`);

    // Gather information about the SaaS
    let context = `SaaS Product: ${input.name}\n`;
    if (input.description) {
      context += `Description: ${input.description}\n`;
    }

    // Use Claude to analyze and generate a comprehensive spec
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: `You are a senior product analyst. Analyze this SaaS product and create a detailed specification for building a similar application.

${context}

IMPORTANT: Do NOT copy proprietary elements. Create an ORIGINAL interpretation based on the CATEGORY and general functionality. This is for building a legitimate competitor, not a clone.

Provide your analysis as JSON with this exact structure:
{
  "name": "string - original name for our version",
  "category": "string - product category",
  "description": "string - what this type of product does",
  "coreFeatures": [
    {
      "name": "string",
      "description": "string",
      "priority": "core|secondary|nice-to-have",
      "complexity": "simple|medium|complex"
    }
  ],
  "entities": [
    {
      "name": "string - PascalCase",
      "fields": [
        {"name": "string", "type": "string|number|boolean|date|text|email|enum", "required": true}
      ],
      "relations": [
        {"target": "EntityName", "type": "one-to-many|many-to-one|many-to-many"}
      ]
    }
  ],
  "userFlows": [
    {
      "name": "string",
      "steps": ["step1", "step2"]
    }
  ],
  "uiPatterns": ["pattern1", "pattern2"],
  "techStack": {
    "frontend": "Next.js 14 + Tailwind + shadcn/ui",
    "backend": "Fastify + TypeScript",
    "database": "PostgreSQL + Prisma",
    "auth": "NextAuth.js"
  },
  "pricing": [
    {
      "name": "tier name",
      "features": ["feature1", "feature2"]
    }
  ]
}

Include at least:
- 8-12 core features
- 4-8 entities with realistic fields
- 3-5 user flows
- All features should be FULLY FUNCTIONAL (no paywalls, no "coming soon")

Return ONLY valid JSON, no markdown.`,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    try {
      // Strip markdown code blocks if present
      let jsonText = content.text.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      
      const analysis = JSON.parse(jsonText) as SaaSAnalysis;
      logger.info(`Analysis complete: ${analysis.coreFeatures.length} features, ${analysis.entities.length} entities`);
      return analysis;
    } catch (e) {
      logger.error('Failed to parse analysis response: ' + (e instanceof Error ? e.message : String(e)));
      logger.error('Response was: ' + content.text.slice(0, 500));
      throw new Error('Failed to parse SaaS analysis');
    }
  }

  async scrapePublicInfo(url: string): Promise<string> {
    // Basic scraping for public marketing pages
    try {
      const response = await fetch(url);
      const html = await response.text();
      const $ = cheerio.load(html);
      
      // Extract useful text
      const title = $('title').text();
      const description = $('meta[name="description"]').attr('content') || '';
      const headings = $('h1, h2, h3').map((_, el) => $(el).text()).get().slice(0, 20);
      const features = $('[class*="feature"], [class*="benefit"]').map((_, el) => $(el).text()).get().slice(0, 30);

      return `
Title: ${title}
Description: ${description}
Headings: ${headings.join(', ')}
Features mentioned: ${features.join(', ')}
      `.trim();
    } catch (e) {
      logger.warn(`Could not scrape ${url}`);
      return '';
    }
  }
}
