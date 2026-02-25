'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface ParityCheck {
  name: string;
  category: string;
  passed: boolean;
  score: number;
  details: string;
}

interface ParityReport {
  totalScore?: number;
  overallScore?: number;
  passesThreshold: boolean;
  checks?: ParityCheck[];
  featureChecks?: ParityCheck[];
  recommendations: string[];
}

interface Job {
  id: string;
  status: string;
  input: { saasName: string; description?: string };
  iterationCount?: number;
  parity?: ParityReport;
  deployment?: {
    githubUrl?: string;
    renderUrls?: { web?: string; api?: string };
  };
  error?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003';

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  
  const [job, setJob] = useState<Job | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setJob(data);
      }
    } catch (e) {
      console.error('Failed to fetch job:', e);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
    
    // Poll every 3 seconds while job is running
    const interval = setInterval(() => {
      if (job?.status !== 'complete' && job?.status !== 'failed') {
        fetchJob();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchJob, job?.status]);

  const pauseIteration = async () => {
    try {
      await fetch(`${API_URL}/api/jobs/${jobId}/pause`, { method: 'POST' });
      setIsPaused(true);
    } catch (e) {
      console.error('Failed to pause:', e);
    }
  };

  const continueIteration = async () => {
    try {
      await fetch(`${API_URL}/api/jobs/${jobId}/continue`, { method: 'POST' });
      setIsPaused(false);
    } catch (e) {
      console.error('Failed to continue:', e);
    }
  };

  const acceptCurrent = async () => {
    try {
      await fetch(`${API_URL}/api/jobs/${jobId}/accept`, { method: 'POST' });
      fetchJob();
    } catch (e) {
      console.error('Failed to accept:', e);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Job Not Found</h1>
          <Link href="/jobs" className="text-blue-400 hover:underline">
            ← Back to Jobs
          </Link>
        </div>
      </div>
    );
  }

  const parityScore = job.parity?.totalScore ?? job.parity?.overallScore ?? 0;
  const checks = job.parity?.checks ?? job.parity?.featureChecks ?? [];
  const isRunning = !['complete', 'failed'].includes(job.status);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/jobs" className="text-gray-400 hover:text-white text-sm mb-2 inline-block">
              ← Back to Jobs
            </Link>
            <h1 className="text-3xl font-bold">{job.input.saasName} Clone</h1>
            <p className="text-gray-400">Job ID: {job.id}</p>
          </div>
          <div className="text-right">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              job.status === 'complete' ? 'bg-green-500/20 text-green-400' :
              job.status === 'failed' ? 'bg-red-500/20 text-red-400' :
              'bg-blue-500/20 text-blue-400'
            }`}>
              {job.status.toUpperCase()}
            </span>
            {job.iterationCount && (
              <p className="text-gray-400 text-sm mt-1">
                Iteration {job.iterationCount}/5
              </p>
            )}
          </div>
        </div>

        {/* Parity Score - Big Display */}
        <div className="bg-gray-800 rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg text-gray-400 mb-2">Feature Parity</h2>
              <div className="flex items-baseline gap-2">
                <span className={`text-6xl font-bold ${
                  parityScore >= 90 ? 'text-green-400' :
                  parityScore >= 70 ? 'text-yellow-400' :
                  'text-red-400'
                }`}>
                  {parityScore}%
                </span>
                <span className="text-2xl text-gray-500">/ 90% target</span>
              </div>
            </div>
            
            {/* Progress Ring */}
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64" cy="64" r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-gray-700"
                />
                <circle
                  cx="64" cy="64" r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${parityScore * 3.52} 352`}
                  className={
                    parityScore >= 90 ? 'text-green-400' :
                    parityScore >= 70 ? 'text-yellow-400' :
                    'text-red-400'
                  }
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold">{parityScore >= 90 ? '✓' : parityScore + '%'}</span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="w-full bg-gray-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  parityScore >= 90 ? 'bg-green-500' :
                  parityScore >= 70 ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, parityScore)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>0%</span>
              <span className="text-yellow-400">70%</span>
              <span className="text-green-400">90% Target</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        {isRunning && (
          <div className="flex gap-4 mb-8">
            {!isPaused ? (
              <button
                onClick={pauseIteration}
                className="flex-1 bg-yellow-600 hover:bg-yellow-700 px-6 py-3 rounded-lg font-medium transition"
              >
                ⏸ Pause Iteration
              </button>
            ) : (
              <button
                onClick={continueIteration}
                className="flex-1 bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-medium transition"
              >
                ▶ Continue Iterating
              </button>
            )}
            <button
              onClick={acceptCurrent}
              className="flex-1 bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg font-medium transition"
            >
              ✓ Accept Current ({parityScore}%)
            </button>
          </div>
        )}

        {/* Feature Checks */}
        {checks.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Feature Checks</h3>
            <div className="space-y-3">
              {checks.map((check, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className={`text-xl ${check.passed ? 'text-green-400' : 'text-red-400'}`}>
                      {check.passed ? '✓' : '✗'}
                    </span>
                    <div>
                      <p className="font-medium">{check.name || check.feature}</p>
                      <p className="text-sm text-gray-400">{check.details || check.notes}</p>
                    </div>
                  </div>
                  <span className={`font-bold ${
                    check.score >= 80 ? 'text-green-400' :
                    check.score >= 50 ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {check.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {job.parity?.recommendations && job.parity.recommendations.length > 0 && (
          <div className="bg-gray-800 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
            <ul className="space-y-2">
              {job.parity.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-gray-300">
                  <span className="text-blue-400">→</span>
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Deployment Links */}
        {job.deployment && (
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-4">Deployment</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {job.deployment.githubUrl && (
                <a
                  href={job.deployment.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition"
                >
                  <span>📦</span>
                  <span>GitHub Repo</span>
                </a>
              )}
              {job.deployment.renderUrls?.web && (
                <a
                  href={job.deployment.renderUrls.web}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition"
                >
                  <span>🌐</span>
                  <span>Live App</span>
                </a>
              )}
              {job.deployment.renderUrls?.api && (
                <a
                  href={job.deployment.renderUrls.api}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 p-4 bg-gray-700 rounded-lg hover:bg-gray-600 transition"
                >
                  <span>⚡</span>
                  <span>API</span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {job.error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6 mt-8">
            <h3 className="text-lg font-semibold text-red-400 mb-2">Error</h3>
            <p className="text-red-300">{job.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
