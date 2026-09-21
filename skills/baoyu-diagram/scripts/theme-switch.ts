#!/usr/bin/env bun
/**
 * theme-switch.ts — Switch SVG theme between dark and light by replacing CSS custom property definitions.
 *
 * This script reads an SVG file, finds the `:root { ... }` block containing CSS custom property
 * definitions, and replaces them with the target theme's color values. All `var(--variable)`
 * references in the SVG markup remain unchanged — only the definitions are swapped.
 *
 * Usage:
 *   bun theme-switch.ts <svg-path> --theme=dark|light [--output=<path>]
 *
 * Example:
 *   bun theme-switch.ts diagram.svg --theme=light
 *   bun theme-switch.ts diagram.svg --theme=light --output=diagram-light.svg
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// ─── Theme Color Maps ────────────────────────────────────────────────────────
// Dark theme (default) — matches the original skill.md color palette
// Light theme — adjusted for light backgrounds (lower opacity fills, deeper strokes)

const themes: Record<'dark' | 'light', Record<string, string>> = {
  dark: {
    '--bg': '#0f172a',
    '--bg-grid': '#1e293b',
    '--mask': '#0f172a',
    '--text': 'white',
    '--text-muted': '#94a3b8',
    '--arrow': '#64748b',
    '--color-primary-fill': 'rgba(8,51,68,0.4)',
    '--color-primary-stroke': '#22d3ee',
    '--color-secondary-fill': 'rgba(6,78,59,0.4)',
    '--color-secondary-stroke': '#34d399',
    '--color-tertiary-fill': 'rgba(76,29,149,0.4)',
    '--color-tertiary-stroke': '#a78bfa',
    '--color-accent-fill': 'rgba(120,53,15,0.3)',
    '--color-accent-stroke': '#fbbf24',
    '--color-alert-fill': 'rgba(136,19,55,0.4)',
    '--color-alert-stroke': '#fb7185',
    '--color-connector-fill': 'rgba(251,146,60,0.3)',
    '--color-connector-stroke': '#fb923c',
    '--color-neutral-fill': 'rgba(30,41,59,0.5)',
    '--color-neutral-stroke': '#94a3b8',
    '--color-highlight-fill': 'rgba(59,130,246,0.3)',
    '--color-highlight-stroke': '#60a5fa',
  },
  light: {
    '--bg': '#f8fafc',
    '--bg-grid': '#e2e8f0',
    '--mask': '#f8fafc',
    '--text': '#0f172a',
    '--text-muted': '#475569',
    '--arrow': '#64748b',
    '--color-primary-fill': 'rgba(6,182,212,0.12)',
    '--color-primary-stroke': '#0891b2',
    '--color-secondary-fill': 'rgba(5,150,105,0.12)',
    '--color-secondary-stroke': '#059669',
    '--color-tertiary-fill': 'rgba(124,58,237,0.12)',
    '--color-tertiary-stroke': '#7c3aed',
    '--color-accent-fill': 'rgba(217,119,6,0.12)',
    '--color-accent-stroke': '#d97706',
    '--color-alert-fill': 'rgba(225,29,72,0.12)',
    '--color-alert-stroke': '#e11d48',
    '--color-connector-fill': 'rgba(234,88,12,0.12)',
    '--color-connector-stroke': '#ea580c',
    '--color-neutral-fill': 'rgba(100,116,139,0.12)',
    '--color-neutral-stroke': '#64748b',
    '--color-highlight-fill': 'rgba(59,130,246,0.12)',
    '--color-highlight-stroke': '#3b82f6',
  },
};

// ─── Core Logic ──────────────────────────────────────────────────────────────

/**
 * Apply a theme to SVG content by replacing CSS custom property definitions
 * inside the `:root { ... }` block within a `<style>` element.
 */
function applyTheme(svgContent: string, themeName: 'dark' | 'light'): string {
  const vars = themes[themeName];

  // Build the replacement :root block
  const rootLines = Object.entries(vars)
    .map(([key, value]) => `    ${key}: ${value};`)
    .join('\n');
  const newRootBlock = `:root {\n${rootLines}\n}`;

  // Replace the :root { ... } block in the <style> element
  // Pattern matches :root { ... } including multiline content
  const rootBlockRegex = /:root\s*\{[^}]*\}/s;

  if (rootBlockRegex.test(svgContent)) {
    return svgContent.replace(rootBlockRegex, newRootBlock);
  }

  // Fallback: if no :root block found, check if there's a <style> tag and inject one
  if (svgContent.includes('<style>')) {
    const injectedRoot = `:root {\n${Object.entries(vars)
      .map(([key, value]) => `    ${key}: ${value};`)
      .join('\n')}\n}`;
    return svgContent.replace('<style>', `<style>${injectedRoot}`);
  }

  // Last fallback: warn the user that the SVG doesn't follow the expected format
  console.warn(
    'Warning: No :root block or <style> element found in SVG. ' +
    'The SVG may not have CSS custom properties defined. ' +
    'Please ensure the SVG includes a <style>:root { ... } block.'
  );
  return svgContent;
}

/**
 * Validate that all CSS variable references in the SVG match defined variables.
 * Helps catch typos or missing variable definitions.
 */
function validateVariables(svgContent: string, themeName: 'dark' | 'light'): string[] {
  const definedVars = new Set(Object.keys(themes[themeName]));
  const referencedVars = new Set<string>();

  // Find all var(--xxx) references
  const varRefRegex = /var\(--([^)]+)\)/g;
  let match;
  while ((match = varRefRegex.exec(svgContent)) !== null) {
    referencedVars.add(`--${match[1]}`);
  }

  const missing = [...referencedVars].filter(v => !definedVars.has(v));
  return missing;
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  svgPath?: string;
  theme?: 'dark' | 'light';
  output?: string;
  validate?: boolean;
} {
  const args = argv.slice(2); // skip node and script path
  const result: any = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Positional argument (svg path)
    if (!arg.startsWith('--') && !result.svgPath) {
      result.svgPath = arg;
      continue;
    }

    // --theme=dark or --theme light
    if (arg.startsWith('--theme=')) {
      result.theme = arg.split('=')[1] as 'dark' | 'light';
    } else if (arg === '--theme' && args[i + 1]) {
      result.theme = args[++i] as 'dark' | 'light';
    }

    // --output=path
    if (arg.startsWith('--output=')) {
      result.output = arg.split('=')[1];
    } else if (arg === '--output' && args[i + 1]) {
      result.output = args[++i];
    }

    // --validate
    if (arg === '--validate') {
      result.validate = true;
    }
  }

  return result;
}

function main(): void {
  const args = parseArgs(process.argv);

  // Validate inputs
  if (!args.svgPath) {
    console.error('Usage: theme-switch.ts <svg-path> [--theme=dark|light] [--output=<path>] [--validate]');
    console.error('');
    console.error('Arguments:');
    console.error('  <svg-path>          Path to the input SVG file');
    console.error('  --theme=dark|light  Target theme (default: dark)');
    console.error('  --output=<path>     Custom output path');
    console.error('  --validate          Check for undefined CSS variable references');
    process.exit(1);
  }

  const theme: 'dark' | 'light' = args.theme || 'dark';
  const svgPath = resolve(args.svgPath);

  if (!existsSync(svgPath)) {
    console.error(`Error: File not found: ${svgPath}`);
    process.exit(1);
  }

  if (!svgPath.endsWith('.svg')) {
    console.error('Error: Input file must be a .svg file');
    process.exit(1);
  }

  // Read SVG
  const svgContent = readFileSync(svgPath, 'utf-8');

  // Optional validation
  if (args.validate) {
    const missing = validateVariables(svgContent, theme);
    if (missing.length > 0) {
      console.error('Warning: The following CSS variables are referenced but not defined:');
      missing.forEach(v => console.error(`  - ${v}`));
      console.error('');
      console.error('Defined variables:');
      Object.keys(themes[theme]).forEach(v => console.error(`  - ${v}`));
      process.exit(1);
    }
    console.log('Validation passed: all CSS variable references are defined.');
  }

  // Apply theme
  const result = applyTheme(svgContent, theme);

  // Determine output path
  const outputDir = args.output ? dirname(args.output) : dirname(svgPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = args.output || svgPath.replace('.svg', `.${theme}.svg`);
  writeFileSync(outputPath, result, 'utf-8');

  console.log(`Theme "${theme}" applied successfully: ${outputPath}`);
  console.log(`  Source: ${svgPath}`);
  console.log(`  Variables replaced: ${Object.keys(themes[theme]).length}`);
}

main();
