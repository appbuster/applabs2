/**
 * AppLabs2 Server - Enterprise SaaS Cloning Engine
 */
import express from 'express';
import cors from 'cors';
import { ResearchModule, SaaSAnalysis } from './research/index.js';
import { GeneratorModule, GenerationResult } from './generator/index.js';
import { TesterModule, TestResult, BugFix } from './tester/index.js';
import { DeployerModule, DeployResult } from './deployer/index.js';
import { logger } from './utils/logger.js';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

// Store for active jobs
interface Job {
  id: string;
  status: 'pending' | 'researching' | 'generating' | 'testing' | 'fixing' | 'deploying' | 'complete' | 'failed';
  input: { saasName: string; description?: string; url?: string };
  analysis?: SaaSAnalysis;
  generation?: GenerationResult;
  tests?: TestResult;
  fixes?: BugFix[];
  deployment?: DeployResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const jobs = new Map<string, Job>();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create a new SaaS generation job
app.post('/api/jobs', async (req, res) => {
  try {
    const { saasName, description, url, anthropicApiKey, githubOwner, renderApiKey } = req.body;

    if (!saasName) {
      return res.status(400).json({ error: 'saasName is required' });
    }

    const apiKey = anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: 'Anthropic API key is required' });
    }

    const ghOwner = githubOwner || 'appbuster';

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job: Job = {
      id: jobId,
      status: 'pending',
      input: { saasName, description, url },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jobs.set(jobId, job);

    // Start processing in background
    processJob(jobId, apiKey, ghOwner, renderApiKey || process.env.RENDER_API_KEY);

    res.json({ jobId, status: 'pending' });
  } catch (e: any) {
    logger.error(e);
    res.status(500).json({ error: e.message });
  }
});

// Get job status
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// List all jobs
app.get('/api/jobs', (req, res) => {
  const allJobs = Array.from(jobs.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);
  res.json(allJobs);
});

// Process a job through all stages
async function processJob(
  jobId: string, 
  apiKey: string, 
  githubOwner: string,
  renderApiKey?: string
): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    // Stage 1: Research
    updateJob(jobId, { status: 'researching' });
    logger.info(`[${jobId}] Starting research for: ${job.input.saasName}`);
    
    const research = new ResearchModule(apiKey);
    const analysis = await research.analyzeSaaS({
      name: job.input.saasName,
      description: job.input.description,
      url: job.input.url,
    });
    updateJob(jobId, { analysis });

    // Stage 2: Generate
    updateJob(jobId, { status: 'generating' });
    logger.info(`[${jobId}] Generating codebase...`);
    
    const projectSlug = analysis.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const generator = new GeneratorModule(apiKey);
    const generation = await generator.generateSaaS(analysis, projectSlug);
    updateJob(jobId, { generation });

    if (generation.errors.length > 0) {
      logger.warn(`[${jobId}] Generation had errors: ${generation.errors.join(', ')}`);
    }

    // Stage 3: Test
    updateJob(jobId, { status: 'testing' });
    logger.info(`[${jobId}] Running tests...`);
    
    const tester = new TesterModule(apiKey);
    const tests = await tester.runTests(generation.outputDir);
    updateJob(jobId, { tests });

    // Stage 4: Fix bugs (if any)
    if (!tests.passed) {
      updateJob(jobId, { status: 'fixing' });
      logger.info(`[${jobId}] Fixing bugs...`);
      
      const fixes = await tester.fixBugs(generation.outputDir, tests);
      updateJob(jobId, { fixes });

      // Re-test after fixes
      const retests = await tester.runTests(generation.outputDir);
      updateJob(jobId, { tests: retests });
    }

    // Stage 5: Deploy
    updateJob(jobId, { status: 'deploying' });
    logger.info(`[${jobId}] Deploying...`);
    
    const deployer = new DeployerModule(githubOwner, renderApiKey);
    const deployment = await deployer.deploy(generation.outputDir, projectSlug);
    updateJob(jobId, { deployment });

    // Complete
    updateJob(jobId, { status: 'complete' });
    logger.info(`[${jobId}] Job complete!`);

  } catch (e: any) {
    logger.error(`[${jobId}] Job failed: ${e.message}`);
    updateJob(jobId, { status: 'failed', error: e.message });
  }
}

function updateJob(jobId: string, updates: Partial<Job>): void {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, updates, { updatedAt: new Date() });
  }
}

const PORT = parseInt(process.env.PORT || '3002');

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`AppLabs2 server running on port ${PORT}`);
  logger.info('Endpoints:');
  logger.info('  POST /api/jobs - Create a new SaaS generation job');
  logger.info('  GET  /api/jobs - List all jobs');
  logger.info('  GET  /api/jobs/:id - Get job status');
});
