const fs = require('node:fs');
const path = require('node:path');

const routeExportAllowedNames = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'config',
  'generateStaticParams',
]);

const routeExportNamePattern = /^[A-Za-z_$][\w$]*$/;

function collectRouteFiles(dir, root = process.cwd()) {
  const absDir = path.join(root, dir);
  if (!fs.existsSync(absDir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const absEntry = path.join(absDir, entry.name);
    const relEntry = path.relative(root, absEntry).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(relEntry, root));
    } else if (entry.isFile() && entry.name === 'route.ts') {
      files.push(relEntry);
    }
  }
  return files;
}

function readIfExists(file, root = process.cwd()) {
  try {
    return fs.readFileSync(path.join(root, file), 'utf8');
  } catch {
    return '';
  }
}

function findNextRouteExportHygieneLeaks(root = process.cwd()) {
  const routeFiles = collectRouteFiles('src/app', root);
  const leaks = [];

  for (const file of routeFiles) {
    const content = readIfExists(file, root);
    for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
      const line = rawLine.trim();
      if (!line.startsWith('export ')) continue;

      const functionExport = line.match(/^export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\b/);
      const constExport = line.match(/^export\s+const\s+([A-Za-z_$][\w$]*)\b/);
      const namedExport = line.match(/^export\s*\{([^}]+)\}/);
      const exportedNames = [];

      if (functionExport?.[1]) {
        exportedNames.push(functionExport[1]);
      } else if (constExport?.[1]) {
        exportedNames.push(constExport[1]);
      } else if (namedExport?.[1]) {
        for (const part of namedExport[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/i).pop()?.trim();
          if (name) exportedNames.push(name);
        }
      } else {
        leaks.push({
          file,
          line: index + 1,
          name: 'non-route export',
          message: `${file}:${index + 1} exports a non-route symbol; move helpers/types into src/lib because Next route files may only export handlers and route config.`,
        });
        continue;
      }

      for (const name of exportedNames) {
        if (!routeExportNamePattern.test(name) || !routeExportAllowedNames.has(name)) {
          leaks.push({
            file,
            line: index + 1,
            name,
            message: `${file}:${index + 1} exports "${name}"; move helpers/types into src/lib because Next route files may only export handlers and route config.`,
          });
        }
      }
    }
  }

  return {
    routeFiles,
    leaks,
    allowedNames: [...routeExportAllowedNames],
  };
}

module.exports = {
  collectRouteFiles,
  findNextRouteExportHygieneLeaks,
  routeExportAllowedNames,
};
