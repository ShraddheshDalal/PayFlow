/**
 * PayFlow build step.
 *
 * 1. Checks that every required project file exists.
 * 2. Syntax-checks every JavaScript module with `node --check`.
 * 3. Verifies local files referenced by index.html (CSS, JS) exist.
 * 4. Verifies every element ID used by js/app.js exists in index.html.
 * 5. Verifies the ES module imports between the app files resolve.
 * 6. Copies the deployable static site into dist/ (used by GitHub Pages).
 *
 * Exits with a non-zero code if any check fails.
 */

import { spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const distDir = join(root, 'dist');

const REQUIRED_FILES = [
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/payment-service.js',
  'js/storage.js',
  'tests/payment-service.test.js',
  'eslint.config.js',
  'package.json',
  'README.md'
];

/** Files and folders published as the static site. */
const DEPLOY_ENTRIES = ['index.html', 'css', 'js'];

const errors = [];

function fail(message) {
  errors.push(message);
}

async function exists(relativePath) {
  return stat(join(root, relativePath)).then(() => true, () => false);
}

async function listJsFiles(dir) {
  const entries = await readdir(join(root, dir), { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.js')).map((entry) => `${dir}/${entry.name}`);
}

async function checkRequiredFiles() {
  for (const file of REQUIRED_FILES) {
    if (!(await exists(file))) {
      fail(`Missing required file: ${file}`);
    }
  }
}

async function checkSyntax() {
  const files = [
    ...(await listJsFiles('js')),
    ...(await listJsFiles('tests')),
    ...(await listJsFiles('scripts')),
    'eslint.config.js'
  ];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
    if (result.status !== 0) {
      fail(`Syntax error in ${file}:\n${result.stderr.trim()}`);
    }
  }
  return files.length;
}

async function checkHtmlReferences(html) {
  const references = [...html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)]
    .map((match) => match[1])
    .filter((ref) => !/^(?:[a-z]+:|\/\/)/i.test(ref));
  for (const ref of references) {
    if (!(await exists(ref))) {
      fail(`index.html references a missing file: ${ref}`);
    }
  }
  return references.length;
}

async function checkElementIds(html) {
  const appSource = await readFile(join(root, 'js/app.js'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  const usedIds = new Set([
    ...[...appSource.matchAll(/\$\('([^']+)'\)/g)].map((match) => match[1]),
    ...[...appSource.matchAll(/(?:input|error): '([^']+)'/g)].map((match) => match[1])
  ]);
  for (const id of usedIds) {
    if (!htmlIds.has(id)) {
      fail(`js/app.js uses #${id}, which does not exist in index.html`);
    }
  }
  return usedIds.size;
}

async function checkModuleImports() {
  for (const file of await listJsFiles('js')) {
    const source = await readFile(join(root, file), 'utf8');
    for (const match of source.matchAll(/from '(\.[^']+)'/g)) {
      const target = join(dirname(file), match[1]);
      if (!(await exists(target))) {
        fail(`${file} imports a missing module: ${match[1]}`);
      }
    }
  }
}

async function copyToDist() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  for (const entry of DEPLOY_ENTRIES) {
    await cp(join(root, entry), join(distDir, entry), { recursive: true });
  }
  // Disable Jekyll processing on GitHub Pages; serve files exactly as built.
  await writeFile(join(distDir, '.nojekyll'), '');
}

async function main() {
  console.log('PayFlow build: validating project…');
  await checkRequiredFiles();
  const html = await readFile(join(root, 'index.html'), 'utf8').catch(() => '');
  const jsCount = await checkSyntax();
  const refCount = await checkHtmlReferences(html);
  const idCount = await checkElementIds(html);
  await checkModuleImports();

  if (errors.length > 0) {
    console.error(`\nBuild failed with ${errors.length} problem(s):`);
    errors.forEach((message) => console.error(`  ✖ ${message}`));
    process.exitCode = 1;
    return;
  }

  await copyToDist();
  console.log(`  ✔ ${REQUIRED_FILES.length} required files present`);
  console.log(`  ✔ ${jsCount} JavaScript files passed syntax check`);
  console.log(`  ✔ ${refCount} HTML asset references resolved`);
  console.log(`  ✔ ${idCount} DOM element IDs used by app.js exist in index.html`);
  console.log('  ✔ Module imports resolved');
  console.log(`  ✔ Static site written to dist/ (${DEPLOY_ENTRIES.join(', ')})`);
}

main().catch((error) => {
  console.error('Build crashed:', error);
  process.exitCode = 1;
});
