# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Prefer pnpm over npm

### Development
- `pnpm run dev` - Start the development server with Turbopack at http://localhost:3000
- `pnpm run build` - Build the production application with Turbopack
- `pnpm run start` - Start the production server

### Code Quality
- `pnpm run lint` - Run Biome linter to check code quality
- `pnpm run format` - Format code using Biome formatter

## Architecture

This is a Next.js 15.5 application using the App Router architecture with TypeScript and Tailwind CSS v4.

### Key Technologies
- **Framework**: Next.js 15.5 with App Router and Turbopack
- **Language**: TypeScript with strict mode enabled
- **Styling**: Tailwind CSS v4 with PostCSS
- **Fonts**: Geist and Geist Mono fonts via next/font
- **Linting/Formatting**: Biome (replaces ESLint/Prettier)

### Project Structure
- `src/app/` - Next.js App Router pages and layouts
  - `layout.tsx` - Root layout with Geist fonts and global styles
  - `page.tsx` - Home page component
- `public/` - Static assets (SVG icons)
- Path alias: `@/*` maps to `./src/*`

### Development Guidelines
- TypeScript strict mode is enabled - ensure all code is properly typed
- Use Biome for linting and formatting (configured with Next.js and React recommended rules)
- Tailwind CSS v4 is configured - use utility classes for styling
- Components should be placed in the `src/app/` directory following App Router conventions
