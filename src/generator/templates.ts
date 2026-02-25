/**
 * Template files for generated projects
 * Based on lessons learned from deployment failures
 */

export const NEXT_CONFIG = `/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3001',
  },
};
`;

export const TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
};
`;

export const POSTCSS_CONFIG = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

export const TSCONFIG_WEB = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
`;

export const NEXT_ENV_DTS = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`;

export const GLOBALS_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

/* Custom scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #f1f1f1;
}

::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #a1a1a1;
}
`;

export function generateRootLayout(projectName: string, description: string): string {
  return `import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '${projectName}',
  description: '${description}',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          {children}
        </div>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
`;
}

export function generateHomePage(projectName: string, features: string[], entities: string[]): string {
  const featureCards = features.slice(0, 6).map((f, i) => {
    const icons = ['📝', '🗂️', '🔗', '🏷️', '💬', '📊', '⚡', '🔒'];
    return `          <div className="p-6 rounded-xl border bg-white hover:shadow-md transition-shadow">
            <div className="text-3xl mb-4">${icons[i % icons.length]}</div>
            <h3 className="text-xl font-semibold mb-2">${f}</h3>
            <p className="text-gray-600">Powerful ${f.toLowerCase()} functionality for your workflow.</p>
          </div>`;
  }).join('\n');

  const navLinks = entities.slice(0, 4).map(e => 
    `            <a href="/${e.toLowerCase()}s" className="text-gray-600 hover:text-gray-900">${e}s</a>`
  ).join('\n');

  return `export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">${projectName}</h1>
          <nav className="hidden md:flex items-center gap-6">
${navLinks}
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Get Started
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-20 px-4 text-center bg-gradient-to-b from-white to-gray-50">
        <h2 className="text-5xl font-bold text-gray-900 mb-6">
          Welcome to ${projectName}
        </h2>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
          A powerful platform to manage your workflow. Built for teams who want to get things done.
        </p>
        <div className="flex gap-4 justify-center">
          <button className="px-8 py-4 bg-blue-600 text-white rounded-lg text-lg font-medium hover:bg-blue-700 transition-colors">
            Start Free Trial
          </button>
          <button className="px-8 py-4 bg-gray-100 text-gray-800 rounded-lg text-lg font-medium hover:bg-gray-200 transition-colors">
            Watch Demo
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <h3 className="text-3xl font-bold text-center mb-12">Everything you need</h3>
          <div className="grid md:grid-cols-3 gap-6">
${featureCards}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 bg-gray-900 text-gray-400 text-center">
        <p>© ${new Date().getFullYear()} ${projectName}. Built with AppLabs2.</p>
      </footer>
    </div>
  );
}
`;
}

export const WEB_PACKAGE_JSON = {
  dependencies: {
    "next": "14.1.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "lucide-react": "0.309.0",
    "sonner": "1.3.1",
    "clsx": "2.1.0",
    "tailwind-merge": "2.2.0",
    "react-hook-form": "7.49.3",
    "zod": "3.22.4",
    "@hookform/resolvers": "3.3.4"
  },
  devDependencies: {
    "typescript": "5.3.3",
    "@types/react": "18.2.48",
    "@types/node": "20.11.5",
    "tailwindcss": "3.4.1",
    "autoprefixer": "10.4.17",
    "postcss": "8.4.33"
  }
};

export const API_PACKAGE_JSON_JS = {
  type: "module",
  dependencies: {
    "fastify": "4.25.2",
    "@fastify/cors": "8.5.0"
  }
};
