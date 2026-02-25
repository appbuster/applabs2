/**
 * AppLabs2 Server - Enterprise SaaS Cloning Engine
 */
import express from 'express';
import cors from 'cors';
import { ResearchModule, SaaSAnalysis } from './research/index.js';
import { GeneratorModule, GenerationResult } from './generator/index.js';
import { TesterModule, TestResult, BugFix } from './tester/index.js';
import { DeployerModule, DeployResult } from './deployer/index.js';
import { VerifierModule, ParityReport, PARITY_THRESHOLD } from './verifier/index.js';
import { BrowserVerifier, BrowserParityReport } from './verifier/browser-verifier.js';
import { DifferentiationChecker, DifferentiationReport } from './verifier/differentiation-checker.js';
import { logger } from './utils/logger.js';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json());

// Store for active jobs
interface Job {
  id: string;
  status: 'pending' | 'researching' | 'generating' | 'testing' | 'fixing' | 'verifying' | 'iterating' | 'deploying' | 'complete' | 'failed' | 'paused';
  input: { saasName: string; description?: string; url?: string };
  analysis?: SaaSAnalysis;
  generation?: GenerationResult;
  tests?: TestResult;
  fixes?: BugFix[];
  parity?: ParityReport | BrowserParityReport;
  differentiation?: DifferentiationReport;
  iterationCount?: number;
  deployment?: DeployResult;
  error?: string;
  paused?: boolean;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const jobs = new Map<string, Job>();
const jobControls = new Map<string, { paused: boolean; accepted: boolean }>();

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

// Pause iteration
app.post('/api/jobs/:id/pause', (req, res) => {
  const jobId = req.params.id;
  const control = jobControls.get(jobId) || { paused: false, accepted: false };
  control.paused = true;
  jobControls.set(jobId, control);
  
  const job = jobs.get(jobId);
  if (job) {
    job.paused = true;
    job.updatedAt = new Date();
  }
  
  logger.info(`[${jobId}] Job paused by user`);
  res.json({ status: 'paused' });
});

// Continue iteration
app.post('/api/jobs/:id/continue', (req, res) => {
  const jobId = req.params.id;
  const control = jobControls.get(jobId) || { paused: false, accepted: false };
  control.paused = false;
  jobControls.set(jobId, control);
  
  const job = jobs.get(jobId);
  if (job) {
    job.paused = false;
    job.updatedAt = new Date();
  }
  
  logger.info(`[${jobId}] Job continued by user`);
  res.json({ status: 'continued' });
});

// Accept current state (skip remaining iterations)
app.post('/api/jobs/:id/accept', (req, res) => {
  const jobId = req.params.id;
  const control = jobControls.get(jobId) || { paused: false, accepted: false };
  control.accepted = true;
  jobControls.set(jobId, control);
  
  const job = jobs.get(jobId);
  if (job) {
    job.acceptedAt = new Date();
    job.updatedAt = new Date();
  }
  
  logger.info(`[${jobId}] Job accepted by user at current parity`);
  res.json({ status: 'accepted' });
});

// Maximum iterations to prevent infinite loops
const MAX_ITERATIONS = 5;

// Process a job through all stages with parity verification
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
      captureVisuals: !!job.input.url, // Capture visuals if URL provided
    });
    updateJob(jobId, { analysis });
    
    if (analysis.visualDesign) {
      logger.info(`[${jobId}] Visual design captured: ${analysis.visualDesign.layoutType} layout, primary ${analysis.visualDesign.primaryColor}`);
    }

    const projectSlug = analysis.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const generator = new GeneratorModule(apiKey);
    const tester = new TesterModule(apiKey);
    const verifier = new VerifierModule(apiKey);
    const browserVerifier = new BrowserVerifier();
    const diffChecker = new DifferentiationChecker(apiKey);
    
    // Initialize job controls
    jobControls.set(jobId, { paused: false, accepted: false });
    
    let iteration = 0;
    let parity: ParityReport | BrowserParityReport | null = null;

    // ITERATION LOOP: Keep improving until 90% parity or max iterations
    while (iteration < MAX_ITERATIONS) {
      // Check for pause/accept
      const control = jobControls.get(jobId);
      if (control?.accepted) {
        logger.info(`[${jobId}] User accepted current state, skipping remaining iterations`);
        break;
      }
      
      // Wait while paused
      while (control?.paused && !control?.accepted) {
        updateJob(jobId, { status: 'paused' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const newControl = jobControls.get(jobId);
        if (!newControl?.paused || newControl?.accepted) break;
      }
      
      iteration++;
      updateJob(jobId, { iterationCount: iteration });
      logger.info(`[${jobId}] === Iteration ${iteration}/${MAX_ITERATIONS} ===`);

      // Stage 2: Generate (or regenerate missing features)
      updateJob(jobId, { status: iteration === 1 ? 'generating' : 'iterating' });
      logger.info(`[${jobId}] Generating codebase...`);
      
      const generation = await generator.generateSaaS(analysis, projectSlug);
      updateJob(jobId, { generation });

      if (generation.errors.length > 0) {
        logger.warn(`[${jobId}] Generation had errors: ${generation.errors.join(', ')}`);
      }

      // Stage 3: Test
      updateJob(jobId, { status: 'testing' });
      logger.info(`[${jobId}] Running tests...`);
      
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

      // Stage 5: VERIFY PARITY
      updateJob(jobId, { status: 'verifying' });
      logger.info(`[${jobId}] Verifying feature parity...`);
      
      parity = await verifier.checkParity(analysis, generation.outputDir);
      updateJob(jobId, { parity });

      logger.info(`[${jobId}] Parity score: ${parity.overallScore}% (threshold: ${PARITY_THRESHOLD}%)`);

      // Check if we've reached the threshold
      if (parity.passesThreshold) {
        logger.info(`[${jobId}] ✅ Parity threshold reached! (${parity.overallScore}%)`);
        break;
      }

      // Log what's missing for next iteration
      if (parity.missingFeatures.length > 0) {
        logger.info(`[${jobId}] Missing features: ${parity.missingFeatures.join(', ')}`);
        logger.info(`[${jobId}] Recommendations: ${parity.recommendations.slice(0, 3).join('; ')}`);
      }

      // If we haven't reached threshold and have more iterations, continue
      if (iteration < MAX_ITERATIONS) {
        logger.info(`[${jobId}] Iterating to improve parity...`);
        // Update analysis with recommendations for next iteration
        // This helps the generator focus on missing features
      }
    }

    // Final parity check result
    if (!parity?.passesThreshold) {
      logger.warn(`[${jobId}] ⚠️ Could not reach ${PARITY_THRESHOLD}% parity after ${iteration} iterations. Final score: ${parity?.overallScore || 0}%`);
    }

    // Stage 6: Deploy
    updateJob(jobId, { status: 'deploying' });
    logger.info(`[${jobId}] Deploying...`);
    
    const deployer = new DeployerModule(githubOwner, renderApiKey);
    const job_current = jobs.get(jobId);
    const deployment = await deployer.deploy(job_current!.generation!.outputDir, projectSlug);
    updateJob(jobId, { deployment });

    // Stage 7: Browser verification (after deployment)
    if (deployment.renderUrls?.web) {
      logger.info(`[${jobId}] Running browser verification on deployed app...`);
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait for Render to spin up
      
      try {
        await browserVerifier.initialize();
        const browserParity = await browserVerifier.verify(deployment.renderUrls.web, analysis);
        updateJob(jobId, { parity: browserParity });
        parity = browserParity;
        
        logger.info(`[${jobId}] Browser parity score: ${browserParity.totalScore}%`);
        
        // Log detailed checks
        for (const check of browserParity.checks) {
          logger.info(`[${jobId}]   ${check.passed ? '✓' : '✗'} ${check.name}: ${check.score}%`);
        }
        
        await browserVerifier.close();
      } catch (e: any) {
        logger.warn(`[${jobId}] Browser verification failed: ${e.message}`);
      }
      
      // Stage 8: Differentiation check (ensure we're DIFFERENT from target)
      if (analysis.targetUrl) {
        logger.info(`[${jobId}] Checking differentiation from target (avoiding lawsuit risk)...`);
        try {
          await diffChecker.initialize();
          const diffReport = await diffChecker.checkDifferentiation(
            analysis.targetUrl,
            deployment.renderUrls.web,
            job_current!.generation!.outputDir
          );
          updateJob(jobId, { differentiation: diffReport });
          
          logger.info(`[${jobId}] Differentiation score: ${diffReport.score.overall}% (higher = more different = safer)`);
          logger.info(`[${jobId}]   Layout different: ${diffReport.score.layoutDifferent ? '✓' : '✗'}`);
          logger.info(`[${jobId}]   Colors different: ${diffReport.score.colorsDifferent ? '✓' : '✗'}`);
          logger.info(`[${jobId}]   Components different: ${diffReport.score.componentsDifferent ? '✓' : '✗'}`);
          logger.info(`[${jobId}]   Legal risk: ${diffReport.legalRisk.toUpperCase()}`);
          
          if (diffReport.score.details.similarities.length > 0) {
            logger.warn(`[${jobId}]   ⚠️ Similarities: ${diffReport.score.details.similarities.slice(0, 3).join(', ')}`);
          }
          
          await diffChecker.close();
        } catch (e: any) {
          logger.warn(`[${jobId}] Differentiation check failed: ${e.message}`);
        }
      }
    }

    // Complete
    const finalScore = (parity as any)?.totalScore ?? (parity as any)?.overallScore ?? 0;
    if (finalScore >= PARITY_THRESHOLD || jobControls.get(jobId)?.accepted) {
      updateJob(jobId, { status: 'complete' });
      logger.info(`[${jobId}] ✅ Job complete! Final parity: ${finalScore}%`);
    } else {
      updateJob(jobId, { status: 'complete' }); // Still complete, but with lower parity
      logger.warn(`[${jobId}] Job complete but below parity threshold: ${finalScore}%`);
    }
    
    // Cleanup
    jobControls.delete(jobId);

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
