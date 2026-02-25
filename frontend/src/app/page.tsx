'use client';

import { useState, useEffect } from 'react';
import { Rocket, Loader2, CheckCircle, XCircle, GitBranch, Globe, Database, Code, Trash2, StopCircle, Clock, RefreshCw, TrendingUp } from 'lucide-react';

// NEXT_PUBLIC_ prefix required for client-side env vars in Next.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://applabs2-api-v2.onrender.com';

interface IterationHistory {
  version: number;
  parityScore: number;
  filesGenerated: number;
  testsPassed: boolean;
  fixesApplied: number;
  completedAt: string;
  missingFeatures?: string[];
}

interface Job {
  id: string;
  status: string;
  input: { saasName: string; description?: string };
  analysis?: {
    name: string;
    category: string;
    coreFeatures: { name: string }[];
    entities: { name: string }[];
  };
  generation?: {
    outputDir: string;
    files: string[];
    errors: string[];
  };
  deployment?: {
    githubUrl?: string;
    renderUrls?: {
      web?: string;
      api?: string;
    };
  };
  parity?: {
    overallScore?: number;
    totalScore?: number;
    missingFeatures?: string[];
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
  iterationCount?: number;
  maxIterations?: number;
  progress?: {
    stage: string;
    step: string;
    percentage: number;
    details?: string;
    startedAt: string;
    stages: { name: string; completed: boolean; current: boolean }[];
  };
  iterations?: IterationHistory[];
}

export default function Home() {
  const [saasName, setSaasName] = useState('');
  const [customName, setCustomName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Poll for job updates
  useEffect(() => {
    if (currentJob && !['complete', 'failed'].includes(currentJob.status)) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/jobs/${currentJob.id}`);
          if (!res.ok) {
            console.error('Poll failed:', res.status);
            return;
          }
          const job = await res.json();
          if (job && job.id) {
            setCurrentJob(job);
            if (['complete', 'failed'].includes(job.status)) {
              loadJobs();
            }
          }
        } catch (e) {
          console.error('Failed to poll job:', e);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [currentJob]);

  // Load jobs on mount
  useEffect(() => {
    loadJobs();
  }, []);

  async function loadJobs() {
    try {
      const res = await fetch(`${API_URL}/api/jobs`);
      if (!res.ok) {
        console.error('API returned error:', res.status);
        return;
      }
      const data = await res.json();
      // Ensure data is an array
      setJobs(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load jobs:', e);
      setJobs([]); // Reset to empty array on error
    }
  }

  async function cancelJob(jobId: string) {
    if (!confirm('Cancel this job? It will stop processing.')) return;
    setActionLoading(jobId);
    try {
      const res = await fetch(`${API_URL}/api/jobs/${jobId}/cancel`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to cancel');
      }
      // Refresh job status
      const jobRes = await fetch(`${API_URL}/api/jobs/${jobId}`);
      if (jobRes.ok) {
        const job = await jobRes.json();
        setCurrentJob(job);
      }
      loadJobs();
    } catch (e: any) {
      alert(e.message || 'Failed to cancel job');
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteJob(jobId: string) {
    if (!confirm('Delete this job? This will also delete the GitHub repo and any deployed services.')) return;
    setActionLoading(jobId);
    try {
      const res = await fetch(`${API_URL}/api/jobs/${jobId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete');
      }
      const result = await res.json();
      if (result.errors?.length > 0) {
        alert(`Deleted with warnings: ${result.errors.join(', ')}`);
      }
      // Clear current job if it was deleted
      if (currentJob?.id === jobId) {
        setCurrentJob(null);
      }
      loadJobs();
    } catch (e: any) {
      alert(e.message || 'Failed to delete job');
    } finally {
      setActionLoading(null);
    }
  }

  function formatElapsedTime(startTime: string): string {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    const elapsed = Math.floor((now - start) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  function getStatusDescription(status: string): string {
    const descriptions: Record<string, string> = {
      pending: 'Starting job, preparing to analyze...',
      researching: 'Analyzing target SaaS features and design...',
      generating: 'Generating application code...',
      testing: 'Running automated tests...',
      fixing: 'Auto-fixing detected issues...',
      verifying: 'Verifying feature parity...',
      iterating: 'Improving code based on feedback...',
      deploying: 'Deploying to GitHub and Render...',
      paused: 'Job paused',
      complete: 'Complete',
      failed: 'Failed',
      cancelled: 'Cancelled',
    };
    return descriptions[status] || status;
  }

  async function runIteration(jobId: string) {
    setActionLoading(jobId);
    try {
      const res = await fetch(`${API_URL}/api/jobs/${jobId}/iterate`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start iteration');
      }
      // Refresh job status
      const jobRes = await fetch(`${API_URL}/api/jobs/${jobId}`);
      if (jobRes.ok) {
        const job = await jobRes.json();
        setCurrentJob(job);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to run iteration');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!saasName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saasName: saasName.trim(),
          customName: customName.trim() || undefined,
          url: targetUrl.trim() || undefined,
          description: description.trim() || undefined,
          githubOwner: 'appbuster',
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create job');
      }
      const data = await res.json();
      setCurrentJob({ id: data.jobId, ...data, input: { saasName, description }, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setSaasName('');
      setCustomName('');
      setTargetUrl('');
      setDescription('');
    } catch (e: any) {
      alert(e.message || 'Failed to create job');
    } finally {
      setIsSubmitting(false);
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'text-yellow-400',
    researching: 'text-blue-400',
    generating: 'text-purple-400',
    testing: 'text-cyan-400',
    fixing: 'text-orange-400',
    verifying: 'text-teal-400',
    iterating: 'text-violet-400',
    deploying: 'text-indigo-400',
    paused: 'text-gray-400',
    complete: 'text-green-400',
    failed: 'text-red-400',
    cancelled: 'text-orange-400',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    pending: <Loader2 className="w-5 h-5 animate-spin" />,
    researching: <Database className="w-5 h-5 animate-pulse" />,
    generating: <Code className="w-5 h-5 animate-pulse" />,
    testing: <CheckCircle className="w-5 h-5 animate-pulse" />,
    fixing: <Loader2 className="w-5 h-5 animate-spin" />,
    verifying: <CheckCircle className="w-5 h-5 animate-pulse" />,
    iterating: <Loader2 className="w-5 h-5 animate-spin" />,
    deploying: <Rocket className="w-5 h-5 animate-bounce" />,
    paused: <StopCircle className="w-5 h-5" />,
    complete: <CheckCircle className="w-5 h-5" />,
    failed: <XCircle className="w-5 h-5" />,
    cancelled: <StopCircle className="w-5 h-5" />,
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-white mb-4">
            <span className="bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              AppLabs2
            </span>
          </h1>
          <p className="text-xl text-gray-400">
            Enterprise SaaS Cloning Engine — Powered by Claude AI
          </p>
        </div>

        {/* Create Job Form */}
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-8 mb-8 border border-gray-700">
          <h2 className="text-2xl font-semibold text-white mb-6">Create New SaaS</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Inspiration SaaS *
                </label>
                <input
                  type="text"
                  value={saasName}
                  onChange={(e) => setSaasName(e.target.value)}
                  placeholder="e.g., Notion, SEMrush, Figma..."
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your Clone Name (optional)
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g., MyAnalytics, TaskFlow..."
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Target URL (optional - for design differentiation)
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="e.g., https://semrush.com"
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSubmitting}
              />
              <p className="text-xs text-gray-500 mt-1">We&apos;ll analyze the design and create a DIFFERENT look to avoid legal issues</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description (optional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the key features or your unique spin on it..."
                rows={3}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSubmitting}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !saasName.trim()}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Rocket className="w-5 h-5" />
                  Generate SaaS
                </>
              )}
            </button>
          </form>
        </div>

        {/* Current Job Status */}
        {currentJob && (
          <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-8 mb-8 border border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-white">Current Job</h2>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-2 ${statusColors[currentJob.status]}`}>
                  {statusIcons[currentJob.status]}
                  <span className="capitalize font-medium">{currentJob.status}</span>
                </div>
                {/* Action buttons */}
                {!['complete', 'failed', 'cancelled'].includes(currentJob.status) && (
                  <button
                    onClick={() => cancelJob(currentJob.id)}
                    disabled={actionLoading === currentJob.id}
                    className="p-2 bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 rounded-lg transition-colors disabled:opacity-50"
                    title="Cancel job"
                  >
                    <StopCircle className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => deleteJob(currentJob.id)}
                  disabled={actionLoading === currentJob.id}
                  className="p-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete job and artifacts"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Progress Section - always show for active jobs */}
            {!['complete', 'failed', 'cancelled'].includes(currentJob.status) && (
              <div className="mb-6 space-y-3">
                {/* Progress bar */}
                <div className="relative">
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                      style={{ width: `${Math.max(0, currentJob.progress?.percentage ?? 5)}%` }}
                    />
                  </div>
                  <div className="absolute right-0 -top-6 text-sm text-gray-400">
                    {currentJob.progress?.percentage != null 
                      ? (currentJob.progress.percentage >= 0 ? `${currentJob.progress.percentage}%` : 'Paused')
                      : 'Starting...'}
                  </div>
                </div>
                
                {/* Stage indicators */}
                <div className="flex justify-between text-xs">
                  {(currentJob.progress?.stages || [
                    { name: 'Research', completed: false, current: currentJob.status === 'researching' || currentJob.status === 'pending' },
                    { name: 'Generate', completed: false, current: currentJob.status === 'generating' },
                    { name: 'Test', completed: false, current: currentJob.status === 'testing' },
                    { name: 'Fix', completed: false, current: currentJob.status === 'fixing' },
                    { name: 'Verify', completed: false, current: currentJob.status === 'verifying' },
                    { name: 'Deploy', completed: false, current: currentJob.status === 'deploying' },
                  ]).map((stage, i) => (
                    <div 
                      key={i} 
                      className={`flex flex-col items-center ${
                        stage.completed ? 'text-green-400' : 
                        stage.current ? 'text-blue-400' : 'text-gray-600'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full mb-1 ${
                        stage.completed ? 'bg-green-400' : 
                        stage.current ? 'bg-blue-400 animate-pulse' : 'bg-gray-600'
                      }`} />
                      <span className="hidden sm:block">{stage.name}</span>
                    </div>
                  ))}
                </div>

                {/* Current step details */}
                <div className="flex items-center justify-between text-sm">
                  <div className="text-gray-300">
                    <span className="font-medium">
                      {currentJob.progress?.step || getStatusDescription(currentJob.status)}
                    </span>
                    {currentJob.progress?.details && (
                      <span className="text-gray-500 ml-2">• {currentJob.progress.details}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>{formatElapsedTime(currentJob.progress?.startedAt || currentJob.createdAt)}</span>
                  </div>
                </div>

                {/* Iteration counter */}
                {currentJob.iterationCount && currentJob.maxIterations && (
                  <div className="text-xs text-gray-500">
                    Iteration {currentJob.iterationCount} of {currentJob.maxIterations}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center gap-4 text-gray-300">
                <span className="font-medium">Input:</span>
                <span>{currentJob.input.saasName}</span>
              </div>

              {/* Iteration History */}
              {currentJob.iterations && currentJob.iterations.length > 0 && (
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-medium text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-400" />
                      Version History
                    </h3>
                    {['complete', 'paused'].includes(currentJob.status) && (
                      <button
                        onClick={() => runIteration(currentJob.id)}
                        disabled={actionLoading === currentJob.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${actionLoading === currentJob.id ? 'animate-spin' : ''}`} />
                        Run Another Iteration
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {currentJob.iterations.map((iter, idx) => {
                      const isLatest = idx === currentJob.iterations!.length - 1;
                      const prevScore = idx > 0 ? currentJob.iterations![idx - 1].parityScore : 0;
                      const improvement = iter.parityScore - prevScore;
                      
                      return (
                        <div 
                          key={iter.version}
                          className={`flex items-center justify-between p-2 rounded ${
                            isLatest ? 'bg-blue-900/30 border border-blue-700/50' : 'bg-gray-800/50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`font-mono text-sm ${isLatest ? 'text-blue-300' : 'text-gray-400'}`}>
                              v{iter.version}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className={`text-lg font-bold ${
                                iter.parityScore >= 90 ? 'text-green-400' :
                                iter.parityScore >= 70 ? 'text-yellow-400' :
                                iter.parityScore >= 50 ? 'text-orange-400' : 'text-red-400'
                              }`}>
                                {iter.parityScore}%
                              </div>
                              {idx > 0 && improvement !== 0 && (
                                <span className={`text-xs ${improvement > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {improvement > 0 ? '+' : ''}{improvement}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <span>{iter.filesGenerated} files</span>
                            <span className={iter.testsPassed ? 'text-green-400' : 'text-red-400'}>
                              {iter.testsPassed ? '✓ tests' : '✗ tests'}
                            </span>
                            {iter.fixesApplied > 0 && (
                              <span>{iter.fixesApplied} fixes</span>
                            )}
                            {isLatest && <span className="text-blue-400">← current</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Missing features from latest iteration */}
                  {currentJob.iterations && currentJob.iterations.length > 0 && 
                   currentJob.iterations[currentJob.iterations.length - 1]?.missingFeatures?.length && 
                   currentJob.iterations[currentJob.iterations.length - 1].missingFeatures!.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-700">
                      <p className="text-xs text-gray-500 mb-1">Missing features:</p>
                      <div className="flex flex-wrap gap-1">
                        {currentJob.iterations[currentJob.iterations.length - 1].missingFeatures!.map((f, i) => (
                          <span key={i} className="px-2 py-0.5 bg-orange-900/30 text-orange-400 text-xs rounded">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Run iteration button if no history yet but job is complete */}
              {(!currentJob.iterations || currentJob.iterations.length === 0) && 
               ['complete', 'paused'].includes(currentJob.status) && 
               currentJob.parity && (
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-gray-400">Current parity: </span>
                      <span className={`font-bold ${
                        (currentJob.parity.overallScore || currentJob.parity.totalScore || 0) >= 90 ? 'text-green-400' : 'text-yellow-400'
                      }`}>
                        {currentJob.parity.overallScore || currentJob.parity.totalScore || 0}%
                      </span>
                    </div>
                    <button
                      onClick={() => runIteration(currentJob.id)}
                      disabled={actionLoading === currentJob.id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${actionLoading === currentJob.id ? 'animate-spin' : ''}`} />
                      Improve Parity
                    </button>
                  </div>
                </div>
              )}

              {currentJob.analysis && (
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-white mb-2">
                    Generated: {currentJob.analysis.name}
                  </h3>
                  <p className="text-gray-400 text-sm mb-2">
                    Category: {currentJob.analysis.category}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {currentJob.analysis.coreFeatures?.length || 0} features, {currentJob.analysis.entities?.length || 0} entities
                  </p>
                </div>
              )}

              {currentJob.generation && currentJob.generation.files?.length > 0 && (
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-white mb-2">
                    Generated {currentJob.generation.files.length} files
                  </h3>
                </div>
              )}

              {currentJob.deployment && (
                <div className="bg-gray-900/50 rounded-lg p-4 space-y-2">
                  <h3 className="text-lg font-medium text-white mb-2">Deployment</h3>
                  {currentJob.deployment.githubUrl && (
                    <a
                      href={currentJob.deployment.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                    >
                      <GitBranch className="w-4 h-4" />
                      {currentJob.deployment.githubUrl}
                    </a>
                  )}
                  {currentJob.deployment.renderUrls?.web && (
                    <a
                      href={currentJob.deployment.renderUrls.web}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-green-400 hover:text-green-300"
                    >
                      <Globe className="w-4 h-4" />
                      {currentJob.deployment.renderUrls.web}
                    </a>
                  )}
                </div>
              )}

              {currentJob.error && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
                  <p className="text-red-400">{currentJob.error}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Job History */}
        <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-8 border border-gray-700">
          <h2 className="text-2xl font-semibold text-white mb-6">Recent Jobs</h2>
          {jobs.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No jobs yet. Create your first SaaS above!</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-gray-900/50 rounded-lg p-4 hover:bg-gray-900/70 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <div 
                      onClick={() => setCurrentJob(job)}
                      className="cursor-pointer flex-1"
                    >
                      <span className="text-white font-medium">{job.input.saasName}</span>
                      {job.analysis?.name && (
                        <span className="text-gray-500 ml-2">→ {job.analysis.name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center gap-2 ${statusColors[job.status]}`}>
                        {statusIcons[job.status]}
                        <span className="capitalize text-sm">{job.status}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteJob(job.id); }}
                        disabled={actionLoading === job.id}
                        className="p-1.5 bg-red-600/10 hover:bg-red-600/30 text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-gray-500 text-sm">
          AppLabs2 • Enterprise SaaS Cloning Engine • Powered by Claude AI
        </div>
      </div>
    </div>
  );
}
