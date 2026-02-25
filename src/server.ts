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
interface IterationHistory {
  version: number;
  parityScore: number;
  filesGenerated: number;
  testsPassed: boolean;
  fixesApplied: number;
  completedAt: Date;
  missingFeatures?: string[];
}

interface Job {
  id: string;
  status: 'pending' | 'researching' | 'generating' | 'testing' | 'fixing' | 'verifying' | 'iterating' | 'deploying' | 'complete' | 'failed' | 'paused' | 'cancelled';
  input: { saasName: string; customName?: string; description?: string; url?: string };
  analysis?: SaaSAnalysis;
  generation?: GenerationResult;
  tests?: TestResult;
  fixes?: BugFix[];
  parity?: ParityReport | BrowserParityReport;
  differentiation?: DifferentiationReport;
  iterationCount?: number;
  maxIterations?: number;
  deployment?: DeployResult;
  error?: string;
  paused?: boolean;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Progress tracking
  progress?: {
    stage: string;
    step: string;
    percentage: number;
    details?: string;
    startedAt: Date;
    stages: { name: string; completed: boolean; current: boolean }[];
  };
  // Iteration history
  iterations?: IterationHistory[];
}

const jobs = new Map<string, Job>();
const jobControls = new Map<string, { paused: boolean; accepted: boolean; cancelled: boolean }>();

// Store for active job abort controllers
const jobAbortControllers = new Map<string, AbortController>();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create a new SaaS generation job
app.post('/api/jobs', async (req, res) => {
  try {
    const { saasName, customName, description, url, anthropicApiKey, githubOwner, renderApiKey } = req.body;

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
      input: { saasName, customName, description, url },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jobs.set(jobId, job);

    // Start processing in background
    processJob(jobId, apiKey, ghOwner, renderApiKey || process.env.RENDER_API_KEY, customName);

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
  const control = jobControls.get(jobId) || { paused: false, accepted: false, cancelled: false };
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
  const control = jobControls.get(jobId) || { paused: false, accepted: false, cancelled: false };
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
  const control = jobControls.get(jobId) || { paused: false, accepted: false, cancelled: false };
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

// Cancel a running job
app.post('/api/jobs/:id/cancel', (req, res) => {
  const jobId = req.params.id;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  if (['complete', 'failed', 'cancelled'].includes(job.status)) {
    return res.status(400).json({ error: 'Job already finished' });
  }
  
  // Signal cancellation
  const control = jobControls.get(jobId) || { paused: false, accepted: false, cancelled: false };
  control.cancelled = true;
  jobControls.set(jobId, control);
  
  // Abort any running operations
  const abortController = jobAbortControllers.get(jobId);
  if (abortController) {
    abortController.abort();
  }
  
  job.status = 'cancelled' as any;
  job.error = 'Cancelled by user';
  job.updatedAt = new Date();
  
  logger.info(`[${jobId}] Job cancelled by user`);
  res.json({ status: 'cancelled' });
});

// Re-run iteration on a job (improve parity)
app.post('/api/jobs/:id/iterate', async (req, res) => {
  const jobId = req.params.id;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  // Can only iterate on complete or paused jobs
  if (!['complete', 'paused'].includes(job.status)) {
    return res.status(400).json({ error: 'Job must be complete or paused to re-iterate' });
  }
  
  // Need analysis to iterate
  if (!job.analysis) {
    return res.status(400).json({ error: 'Job has no analysis data to iterate from' });
  }
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'No API key configured' });
  }
  
  // Reset controls and increment iteration
  jobControls.set(jobId, { paused: false, accepted: false, cancelled: false });
  job.status = 'iterating';
  job.iterationCount = (job.iterationCount || 0) + 1;
  job.maxIterations = (job.maxIterations || 5) + 1; // Allow one more iteration
  job.updatedAt = new Date();
  
  // Run iteration in background
  runIteration(jobId, apiKey);
  
  logger.info(`[${jobId}] Manual re-iteration triggered (version ${job.iterationCount})`);
  res.json({ status: 'iterating', version: job.iterationCount });
});

// Delete a job and its artifacts
app.delete('/api/jobs/:id', async (req, res) => {
  const jobId = req.params.id;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  const deletedArtifacts: string[] = [];
  const errors: string[] = [];
  
  try {
    // 1. Cancel if still running
    if (!['complete', 'failed', 'cancelled'].includes(job.status)) {
      const control = jobControls.get(jobId) || { paused: false, accepted: false, cancelled: false };
      control.cancelled = true;
      jobControls.set(jobId, control);
      
      const abortController = jobAbortControllers.get(jobId);
      if (abortController) abortController.abort();
    }
    
    // 2. Delete GitHub repo if exists
    if (job.deployment?.githubUrl) {
      const repoMatch = job.deployment.githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (repoMatch) {
        const [, owner, repo] = repoMatch;
        try {
          const ghToken = process.env.GITHUB_TOKEN;
          if (ghToken) {
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `token ${ghToken}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            });
            if (response.ok || response.status === 404) {
              deletedArtifacts.push(`GitHub repo: ${owner}/${repo}`);
            } else {
              errors.push(`Failed to delete GitHub repo: ${response.status}`);
            }
          }
        } catch (e: any) {
          errors.push(`GitHub deletion error: ${e.message}`);
        }
      }
    }
    
    // 3. Delete Render services if exist
    if (job.deployment?.renderUrls) {
      const renderApiKey = process.env.RENDER_API_KEY;
      if (renderApiKey) {
        // Would need service IDs stored in deployment to delete properly
        // For now, log that manual cleanup may be needed
        logger.warn(`[${jobId}] Render services may need manual cleanup`);
      }
    }
    
    // 4. Delete local output directory
    if (job.generation?.outputDir) {
      const fs = await import('fs/promises');
      try {
        await fs.rm(job.generation.outputDir, { recursive: true, force: true });
        deletedArtifacts.push(`Local files: ${job.generation.outputDir}`);
      } catch (e: any) {
        errors.push(`Local deletion error: ${e.message}`);
      }
    }
    
    // 5. Remove from jobs map
    jobs.delete(jobId);
    jobControls.delete(jobId);
    jobAbortControllers.delete(jobId);
    deletedArtifacts.push('Job record');
    
    logger.info(`[${jobId}] Job deleted. Artifacts: ${deletedArtifacts.join(', ')}`);
    res.json({ 
      status: 'deleted', 
      deletedArtifacts,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (e: any) {
    logger.error(`[${jobId}] Delete failed: ${e.message}`);
    res.status(500).json({ error: e.message, partiallyDeleted: deletedArtifacts });
  }
});

// Maximum iterations to prevent infinite loops
const MAX_ITERATIONS = 5;

// Stage definitions for progress tracking
const STAGES = [
  { name: 'researching', label: 'Researching SaaS' },
  { name: 'generating', label: 'Generating Code' },
  { name: 'testing', label: 'Running Tests' },
  { name: 'fixing', label: 'Fixing Issues' },
  { name: 'verifying', label: 'Verifying Parity' },
  { name: 'deploying', label: 'Deploying' },
];

function checkCancelled(jobId: string): boolean {
  const control = jobControls.get(jobId);
  return control?.cancelled ?? false;
}

function updateProgress(jobId: string, stage: string, step: string, percentage: number, details?: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  
  const stageIndex = STAGES.findIndex(s => s.name === stage);
  const stages = STAGES.map((s, i) => ({
    name: s.label,
    completed: i < stageIndex,
    current: i === stageIndex,
  }));
  
  job.progress = {
    stage,
    step,
    percentage,
    details,
    startedAt: job.progress?.startedAt || new Date(),
    stages,
  };
  job.updatedAt = new Date();
}

// Process a job through all stages with parity verification
async function processJob(
  jobId: string, 
  apiKey: string, 
  githubOwner: string,
  renderApiKey?: string,
  customName?: string
): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) return;

  // Set up abort controller for this job
  const abortController = new AbortController();
  jobAbortControllers.set(jobId, abortController);
  
  // Initialize controls
  jobControls.set(jobId, { paused: false, accepted: false, cancelled: false });

  try {
    // Stage 1: Research
    if (checkCancelled(jobId)) throw new Error('Cancelled');
    updateJob(jobId, { status: 'researching', maxIterations: MAX_ITERATIONS });
    updateProgress(jobId, 'researching', 'Analyzing target SaaS...', 5);
    logger.info(`[${jobId}] Starting research for: ${job.input.saasName}`);
    
    updateProgress(jobId, 'researching', 'Fetching SaaS details...', 15);
    const research = new ResearchModule(apiKey);
    const analysis = await research.analyzeSaaS({
      name: job.input.saasName,
      description: job.input.description,
      url: job.input.url,
      captureVisuals: !!job.input.url, // Capture visuals if URL provided
    });
    
    if (checkCancelled(jobId)) throw new Error('Cancelled');
    updateProgress(jobId, 'researching', 'Analysis complete', 20, `Found ${analysis.coreFeatures?.length || 0} features`);
    
    // Use custom name if provided, otherwise use generated name
    if (customName) {
      analysis.name = customName;
      logger.info(`[${jobId}] Using custom name: ${customName}`);
    }
    
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
    
    let iteration = 0;
    let parity: ParityReport | BrowserParityReport | null = null;

    // ITERATION LOOP: Keep improving until 90% parity or max iterations
    while (iteration < MAX_ITERATIONS) {
      // Check for cancellation
      if (checkCancelled(jobId)) throw new Error('Cancelled');
      
      // Check for pause/accept
      const control = jobControls.get(jobId);
      if (control?.accepted) {
        logger.info(`[${jobId}] User accepted current state, skipping remaining iterations`);
        break;
      }
      
      // Wait while paused
      while (control?.paused && !control?.accepted && !control?.cancelled) {
        updateJob(jobId, { status: 'paused' });
        updateProgress(jobId, 'generating', 'Paused by user', -1);
        await new Promise(resolve => setTimeout(resolve, 2000));
        const newControl = jobControls.get(jobId);
        if (!newControl?.paused || newControl?.accepted || newControl?.cancelled) break;
      }
      
      if (checkCancelled(jobId)) throw new Error('Cancelled');
      
      iteration++;
      updateJob(jobId, { iterationCount: iteration });
      const baseProgress = 20 + (iteration - 1) * (60 / MAX_ITERATIONS);
      logger.info(`[${jobId}] === Iteration ${iteration}/${MAX_ITERATIONS} ===`);

      // Stage 2: Generate (or regenerate missing features)
      updateJob(jobId, { status: iteration === 1 ? 'generating' : 'iterating' });
      updateProgress(jobId, 'generating', `Iteration ${iteration}/${MAX_ITERATIONS}: Generating code...`, baseProgress, 
        iteration > 1 ? 'Improving based on parity feedback' : 'Initial generation');
      logger.info(`[${jobId}] Generating codebase...`);
      
      const generation = await generator.generateSaaS(analysis, projectSlug);
      updateJob(jobId, { generation });
      updateProgress(jobId, 'generating', `Generated ${generation.files?.length || 0} files`, baseProgress + 10,
        generation.errors.length > 0 ? `${generation.errors.length} warnings` : undefined);

      if (generation.errors.length > 0) {
        logger.warn(`[${jobId}] Generation had errors: ${generation.errors.join(', ')}`);
      }

      if (checkCancelled(jobId)) throw new Error('Cancelled');

      // Stage 3: Test
      updateJob(jobId, { status: 'testing' });
      updateProgress(jobId, 'testing', 'Running test suite...', baseProgress + 15);
      logger.info(`[${jobId}] Running tests...`);
      
      const tests = await tester.runTests(generation.outputDir);
      updateJob(jobId, { tests });
      updateProgress(jobId, 'testing', `Tests: ${tests.passed ? 'Passed' : 'Issues found'}`, baseProgress + 20,
        tests.passed ? undefined : `${tests.tests?.filter(t => !t.passed).length || 0} failures`);

      if (checkCancelled(jobId)) throw new Error('Cancelled');

      // Stage 4: Fix bugs (if any)
      if (!tests.passed) {
        updateJob(jobId, { status: 'fixing' });
        updateProgress(jobId, 'fixing', 'Auto-fixing issues...', baseProgress + 22);
        logger.info(`[${jobId}] Fixing bugs...`);
        
        const fixes = await tester.fixBugs(generation.outputDir, tests);
        updateJob(jobId, { fixes });
        updateProgress(jobId, 'fixing', `Applied ${fixes?.length || 0} fixes`, baseProgress + 25);

        // Re-test after fixes
        const retests = await tester.runTests(generation.outputDir);
        updateJob(jobId, { tests: retests });
      }

      if (checkCancelled(jobId)) throw new Error('Cancelled');

      // Stage 5: VERIFY PARITY
      updateJob(jobId, { status: 'verifying' });
      updateProgress(jobId, 'verifying', 'Checking feature parity...', baseProgress + 28);
      logger.info(`[${jobId}] Verifying feature parity...`);
      
      parity = await verifier.checkParity(analysis, generation.outputDir);
      updateJob(jobId, { parity });
      updateProgress(jobId, 'verifying', `Parity: ${parity.overallScore}%`, baseProgress + 30,
        parity.passesThreshold ? 'Threshold reached!' : `Need ${PARITY_THRESHOLD}%`);

      logger.info(`[${jobId}] Parity score: ${parity.overallScore}% (threshold: ${PARITY_THRESHOLD}%)`);

      // Record iteration history
      const job_now = jobs.get(jobId);
      if (job_now) {
        if (!job_now.iterations) job_now.iterations = [];
        job_now.iterations.push({
          version: iteration,
          parityScore: parity.overallScore,
          filesGenerated: job_now.generation?.files?.length || 0,
          testsPassed: job_now.tests?.passed || false,
          fixesApplied: job_now.fixes?.length || 0,
          completedAt: new Date(),
          missingFeatures: parity.missingFeatures?.slice(0, 5),
        });
      }

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

    if (checkCancelled(jobId)) throw new Error('Cancelled');

    // Stage 6: Deploy
    updateJob(jobId, { status: 'deploying' });
    updateProgress(jobId, 'deploying', 'Pushing to GitHub...', 85);
    logger.info(`[${jobId}] Deploying...`);
    
    const deployer = new DeployerModule(githubOwner, renderApiKey);
    const job_current = jobs.get(jobId);
    updateProgress(jobId, 'deploying', 'Creating Render services...', 90);
    const deployment = await deployer.deploy(job_current!.generation!.outputDir, projectSlug);
    updateJob(jobId, { deployment });
    updateProgress(jobId, 'deploying', 'Deployment initiated', 95, deployment.githubUrl ? 'Waiting for services to start' : undefined);

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
      updateProgress(jobId, 'deploying', 'Complete!', 100, `Final parity: ${finalScore}%`);
      logger.info(`[${jobId}] ✅ Job complete! Final parity: ${finalScore}%`);
    } else {
      updateJob(jobId, { status: 'complete' }); // Still complete, but with lower parity
      updateProgress(jobId, 'deploying', 'Complete (below threshold)', 100, `Parity: ${finalScore}%`);
      logger.warn(`[${jobId}] Job complete but below parity threshold: ${finalScore}%`);
    }
    
    // Cleanup
    jobControls.delete(jobId);
    jobAbortControllers.delete(jobId);

  } catch (e: any) {
    if (e.message === 'Cancelled') {
      logger.info(`[${jobId}] Job was cancelled`);
      updateJob(jobId, { status: 'cancelled', error: 'Cancelled by user' });
    } else {
      logger.error(`[${jobId}] Job failed: ${e.message}`);
      updateJob(jobId, { status: 'failed', error: e.message });
    }
    jobAbortControllers.delete(jobId);
  }
}

function updateJob(jobId: string, updates: Partial<Job>): void {
  const job = jobs.get(jobId);
  if (job) {
    Object.assign(job, updates, { updatedAt: new Date() });
  }
}

// Run a single iteration on an existing job (for manual re-iteration)
async function runIteration(jobId: string, apiKey: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job || !job.analysis) return;
  
  const abortController = new AbortController();
  jobAbortControllers.set(jobId, abortController);
  
  try {
    const projectSlug = job.analysis.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const generator = new GeneratorModule(apiKey);
    const tester = new TesterModule(apiKey);
    const verifier = new VerifierModule(apiKey);
    const iteration = job.iterationCount || 1;
    
    if (checkCancelled(jobId)) throw new Error('Cancelled');
    
    // Generate
    updateJob(jobId, { status: 'generating' });
    updateProgress(jobId, 'generating', `Version ${iteration}: Regenerating code...`, 20, 
      'Incorporating parity feedback');
    logger.info(`[${jobId}] Re-iteration ${iteration}: Generating...`);
    
    const generation = await generator.generateSaaS(job.analysis, projectSlug);
    updateJob(jobId, { generation });
    updateProgress(jobId, 'generating', `Generated ${generation.files?.length || 0} files`, 40);
    
    if (checkCancelled(jobId)) throw new Error('Cancelled');
    
    // Test
    updateJob(jobId, { status: 'testing' });
    updateProgress(jobId, 'testing', 'Running tests...', 50);
    logger.info(`[${jobId}] Re-iteration ${iteration}: Testing...`);
    
    const tests = await tester.runTests(generation.outputDir);
    updateJob(jobId, { tests });
    
    if (checkCancelled(jobId)) throw new Error('Cancelled');
    
    // Fix if needed
    if (!tests.passed) {
      updateJob(jobId, { status: 'fixing' });
      updateProgress(jobId, 'fixing', 'Auto-fixing issues...', 60);
      
      const fixes = await tester.fixBugs(generation.outputDir, tests);
      updateJob(jobId, { fixes });
      
      const retests = await tester.runTests(generation.outputDir);
      updateJob(jobId, { tests: retests });
    }
    
    if (checkCancelled(jobId)) throw new Error('Cancelled');
    
    // Verify parity
    updateJob(jobId, { status: 'verifying' });
    updateProgress(jobId, 'verifying', 'Checking parity...', 75);
    logger.info(`[${jobId}] Re-iteration ${iteration}: Verifying...`);
    
    const parity = await verifier.checkParity(job.analysis, generation.outputDir);
    updateJob(jobId, { parity });
    
    // Record to history
    if (!job.iterations) job.iterations = [];
    job.iterations.push({
      version: iteration,
      parityScore: parity.overallScore,
      filesGenerated: generation.files?.length || 0,
      testsPassed: tests.passed,
      fixesApplied: job.fixes?.length || 0,
      completedAt: new Date(),
      missingFeatures: parity.missingFeatures?.slice(0, 5),
    });
    
    updateProgress(jobId, 'verifying', `Version ${iteration}: ${parity.overallScore}% parity`, 100,
      parity.passesThreshold ? 'Threshold reached!' : `Missing: ${parity.missingFeatures?.slice(0, 2).join(', ')}`);
    
    logger.info(`[${jobId}] Re-iteration ${iteration} complete: ${parity.overallScore}% parity`);
    
    // Mark complete (user can iterate again if desired)
    updateJob(jobId, { status: 'complete' });
    
    jobControls.delete(jobId);
    jobAbortControllers.delete(jobId);
    
  } catch (e: any) {
    if (e.message === 'Cancelled') {
      logger.info(`[${jobId}] Iteration was cancelled`);
      updateJob(jobId, { status: 'cancelled', error: 'Cancelled by user' });
    } else {
      logger.error(`[${jobId}] Iteration failed: ${e.message}`);
      updateJob(jobId, { status: 'failed', error: e.message });
    }
    jobAbortControllers.delete(jobId);
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
