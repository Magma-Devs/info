# Code Style

## TypeScript
- Strict mode, no `any` types without justification
- Prefer `interface` over `type` for object shapes
- Use `BigInt` for token amounts (ulava values are too large for Number)
- Prefer early returns over deep nesting

## React & Next.js
- React 19, Next.js 15 App Router with `"use client"` directive on interactive pages
- All hooks (`useMemo`, `useState`, `useApi`) must be called before any conditional early returns
- Use `@/` path alias for imports from `src/`
- Components: `@/components/ui/` (shadcn primitives), `@/components/data/` (domain components), `@/components/layout/` (shell)

## Styling
- Tailwind CSS v4 with dark theme
- Accent color: orange (#ac4c39), defined as `--color-accent` in globals.css
- Use semantic color tokens: `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`
- No inline styles — Tailwind classes only
- Responsive breakpoints: `md:` for tablet, `xl:` for desktop

## Tables
- Use TanStack React Table (`@tanstack/react-table`) for all data tables
- Every column must have `accessorFn` for sorting to work
- Use `getSortedRowModel()` for client-side sorting
- Use `getPaginationRowModel()` when rows > 20
