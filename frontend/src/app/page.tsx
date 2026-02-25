'use client';

import { useState, useEffect } from 'react';
import { Rocket, Loader2, CheckCircle, XCircle, GitBranch, Globe, Database, Code } from 'lucide-react';

// NEXT_PUBLIC_ prefix required for client-side env vars in Next.js
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://applabs2-api-v2.onrender.com';

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
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const [saasName, setSaasName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentJob, setCurrentJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  // Poll for job updates
  useEffect(() => {
    if (currentJob && !['complete', 'failed'].includes(currentJob.status)) {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API_URL}/api/jobs/${currentJob.id}`);
          const job = await res.json();
          setCurrentJob(job);
          if (['complete', 'failed'].includes(job.status)) {
            loadJobs();
          }
        } catch (e) {
          console.error('Failed to poll job');
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
      const data = await res.json();
      setJobs(data);
    } catch (e) {
      console.error('Failed to load jobs');
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
          description: description.trim() || undefined,
          githubOwner: 'appbuster',
        }),
      });
      const data = await res.json();
      setCurrentJob({ ...data, input: { saasName, description }, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setSaasName('');
      setDescription('');
    } catch (e) {
      alert('Failed to create job');
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
    deploying: 'text-indigo-400',
    complete: 'text-green-400',
    failed: 'text-red-400',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    pending: <Loader2 className="w-5 h-5 animate-spin" />,
    researching: <Database className="w-5 h-5 animate-pulse" />,
    generating: <Code className="w-5 h-5 animate-pulse" />,
    testing: <CheckCircle className="w-5 h-5 animate-pulse" />,
    fixing: <Loader2 className="w-5 h-5 animate-spin" />,
    deploying: <Rocket className="w-5 h-5 animate-bounce" />,
    complete: <CheckCircle className="w-5 h-5" />,
    failed: <XCircle className="w-5 h-5" />,
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
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                SaaS Name / Inspiration
              </label>
              <input
                type="text"
                value={saasName}
                onChange={(e) => setSaasName(e.target.value)}
                placeholder="e.g., Notion, Trello, Slack, Figma..."
                className="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSubmitting}
              />
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
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-white">Current Job</h2>
              <div className={`flex items-center gap-2 ${statusColors[currentJob.status]}`}>
                {statusIcons[currentJob.status]}
                <span className="capitalize font-medium">{currentJob.status}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-4 text-gray-300">
                <span className="font-medium">Input:</span>
                <span>{currentJob.input.saasName}</span>
              </div>

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
                  onClick={() => setCurrentJob(job)}
                  className="bg-gray-900/50 rounded-lg p-4 cursor-pointer hover:bg-gray-900/70 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-white font-medium">{job.input.saasName}</span>
                      {job.analysis?.name && (
                        <span className="text-gray-500 ml-2">→ {job.analysis.name}</span>
                      )}
                    </div>
                    <div className={`flex items-center gap-2 ${statusColors[job.status]}`}>
                      {statusIcons[job.status]}
                      <span className="capitalize text-sm">{job.status}</span>
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
