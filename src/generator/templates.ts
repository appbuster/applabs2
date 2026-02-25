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

/**
 * Generate a complete list page with search, mock data, and CRUD actions
 */
export function generateListPage(entityName: string, fields: string[]): string {
  const pluralName = entityName.toLowerCase() + 's';
  
  return `'use client';

import { useState } from 'react';
import Link from 'next/link';

// Mock data for demonstration
const mockData = [
  { id: 1, name: 'Sample ${entityName} 1', description: 'Description 1', status: 'Active' },
  { id: 2, name: 'Sample ${entityName} 2', description: 'Description 2', status: 'Draft' },
  { id: 3, name: 'Sample ${entityName} 3', description: 'Description 3', status: 'Active' },
  { id: 4, name: 'Sample ${entityName} 4', description: 'Description 4', status: 'Archived' },
  { id: 5, name: 'Sample ${entityName} 5', description: 'Description 5', status: 'Active' },
];

export default function ${entityName}ListPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState(mockData);

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this item?')) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/" className="text-xl font-bold text-gray-900">← Home</Link>
          <h1 className="text-xl font-semibold">${entityName}s</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div className="relative">
            <input
              type="search"
              placeholder="Search ${pluralName}..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-80 px-4 py-2 pl-10 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <Link href="/${pluralName}/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Create New
          </Link>
        </div>

        {filteredItems.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border">
            <p className="text-gray-500">No ${pluralName} found. Create your first one!</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap font-medium">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">{item.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={\`px-2 py-1 rounded-full text-xs \${
                        item.status === 'Active' ? 'bg-green-100 text-green-800' :
                        item.status === 'Draft' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }\`}>{item.status}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <Link href={\`/${pluralName}/\${item.id}/edit\`} className="text-blue-600 hover:text-blue-800 mr-4">Edit</Link>
                      <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-800">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 text-sm text-gray-500">
          Showing {filteredItems.length} of {items.length} ${pluralName}
        </div>
      </main>
    </div>
  );
}
`;
}

/**
 * Generate a form page for creating/editing entities
 */
export function generateFormPage(entityName: string, fields: string[]): string {
  const pluralName = entityName.toLowerCase() + 's';
  const formFields = fields.slice(0, 5).map(f => `        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">${f}</label>
          <input
            type="text"
            name="${f.toLowerCase()}"
            placeholder="Enter ${f.toLowerCase()}"
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>`).join('\n');

  return `'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ${entityName}FormPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Saving ${entityName}:', data);
    router.push('/${pluralName}');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link href="/${pluralName}" className="text-gray-600 hover:text-gray-900">← Back to ${entityName}s</Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg border p-6">
          <h1 className="text-2xl font-bold mb-6">Create New ${entityName}</h1>
          
          <form onSubmit={handleSubmit} className="space-y-6">
${formFields}

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Create ${entityName}'}
              </button>
              <Link
                href="/${pluralName}"
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
`;
}

/**
 * Generate API routes for CRUD operations with mock data
 */
export function generateApiRoutes(entityName: string): string {
  const pluralName = entityName.toLowerCase() + 's';
  
  return `// ${entityName} API Routes
const mock${entityName}s = [
  { id: 1, name: 'Sample ${entityName} 1', description: 'Description 1', status: 'Active', createdAt: new Date().toISOString() },
  { id: 2, name: 'Sample ${entityName} 2', description: 'Description 2', status: 'Draft', createdAt: new Date().toISOString() },
  { id: 3, name: 'Sample ${entityName} 3', description: 'Description 3', status: 'Active', createdAt: new Date().toISOString() },
];

let ${pluralName} = [...mock${entityName}s];
let nextId = 4;

export default async function register(app) {
  // List all ${pluralName}
  app.get('/api/${pluralName}', async (req, reply) => {
    const { search, limit = 50 } = req.query;
    let result = ${pluralName};
    
    if (search) {
      result = result.filter(item => 
        item.name.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    return { data: result.slice(0, limit), total: result.length };
  });

  // Get single ${entityName}
  app.get('/api/${pluralName}/:id', async (req, reply) => {
    const item = ${pluralName}.find(p => p.id === parseInt(req.params.id));
    if (!item) {
      return reply.code(404).send({ error: '${entityName} not found' });
    }
    return item;
  });

  // Create ${entityName}
  app.post('/api/${pluralName}', async (req, reply) => {
    const newItem = {
      id: nextId++,
      ...req.body,
      createdAt: new Date().toISOString()
    };
    ${pluralName}.push(newItem);
    return reply.code(201).send(newItem);
  });

  // Update ${entityName}
  app.put('/api/${pluralName}/:id', async (req, reply) => {
    const index = ${pluralName}.findIndex(p => p.id === parseInt(req.params.id));
    if (index === -1) {
      return reply.code(404).send({ error: '${entityName} not found' });
    }
    ${pluralName}[index] = { ...${pluralName}[index], ...req.body, updatedAt: new Date().toISOString() };
    return ${pluralName}[index];
  });

  // Delete ${entityName}
  app.delete('/api/${pluralName}/:id', async (req, reply) => {
    const index = ${pluralName}.findIndex(p => p.id === parseInt(req.params.id));
    if (index === -1) {
      return reply.code(404).send({ error: '${entityName} not found' });
    }
    ${pluralName}.splice(index, 1);
    return { success: true };
  });
}
`;
}
