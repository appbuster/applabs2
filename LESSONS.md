# AppLabs2 Lessons Learned

## Build Failures & Fixes

### 1. Missing Dependencies (2026-02-25)
**Issue:** Generated pages used `sonner`, `clsx` that weren't in package.json
**Fix:** Generator must scan generated code for imports and auto-add dependencies
**Action:** Update generator to include all common UI dependencies by default

### 2. Missing Next.js Essential Files (2026-02-25)
**Issue:** Build failed due to missing layout.tsx, globals.css, next.config.js
**Fix:** Generator must create complete Next.js app structure
**Required files:**
- `src/app/layout.tsx` - Root layout with metadata
- `src/app/globals.css` - Tailwind imports
- `next.config.js` - Next.js configuration
- `tailwind.config.js` - Tailwind configuration
- `postcss.config.js` - PostCSS configuration
- `tsconfig.json` - TypeScript configuration
- `next-env.d.ts` - Next.js types

### 3. Page Routing Issues (2026-02-25)
**Issue:** Pages like /workspaces return 404 even though page.tsx exists
**Root cause:** Route groups like `(app)` require proper layout structure
**Fix:** Don't use route groups for simple apps. Use flat structure:
- `/src/app/page.tsx` - Home
- `/src/app/workspaces/page.tsx` - Workspaces
- `/src/app/pages/page.tsx` - Pages

### 4. API Build Issues (2026-02-25)
**Issue:** API service fails to build with TypeScript
**Fix:** Use plain JavaScript (.js) for API to avoid build complexity
**Or:** Include proper tsconfig and build step

## Best Practices for Generation

### Dependencies to Always Include (Frontend)
```json
{
  "next": "14.1.0",
  "react": "18.2.0",
  "react-dom": "18.2.0",
  "tailwindcss": "3.4.1",
  "autoprefixer": "10.4.17",
  "postcss": "8.4.33",
  "typescript": "5.3.3",
  "@types/react": "18.2.48",
  "@types/node": "20.11.0"
}
```

### File Structure Template
```
apps/web/
├── next.config.js
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── next-env.d.ts
├── package.json
└── src/
    └── app/
        ├── layout.tsx      # Required
        ├── globals.css     # Required
        ├── page.tsx        # Home page
        └── [entity]/       # Entity pages (flat, no route groups)
            └── page.tsx
```

### What Makes a Good Notion Clone
1. Block-based editor (the core differentiator)
2. Sidebar navigation
3. Nested pages/hierarchy
4. Real CRUD operations
5. Search functionality
6. Responsive design
7. Clean, minimal UI

## Research Improvements Needed

1. When analyzing "Notion", identify:
   - Core feature: Block-based document editing
   - Must have: Page hierarchy, search, workspaces
   - UI pattern: Sidebar + content area
   - Data model: Pages contain Blocks, Blocks have types

2. Generate more specific prompts for Claude when creating code
3. Test generated code before deployment
