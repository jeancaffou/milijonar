import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "..", "_site");

const removeOptions = {
  recursive: true,
  force: true,
  maxRetries: 20,
  retryDelay: 500,
};

async function entries(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function mapLimit(items, limit, callback) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await callback(items[index]);
    }
  });
  await Promise.all(workers);
}

async function removePath(target) {
  await rm(target, removeOptions);
}

// Shard the generated tree two levels down. The catalogue has tens of
// thousands of independent page/evidence directories; bounded parallel
// removal avoids a very slow single recursive walk on mounted workspaces.
// Every target is resolved from the exact generated output directory.
const firstLevel = await entries(outputDir);
const firstLevelDirectories = [];
const secondLevelDirectories = [];
const removalTargets = [];

for (const firstEntry of firstLevel) {
  const firstTarget = path.join(outputDir, firstEntry.name);
  if (!firstEntry.isDirectory()) {
    removalTargets.push(firstTarget);
    continue;
  }

  firstLevelDirectories.push(firstTarget);
  for (const secondEntry of await entries(firstTarget)) {
    const secondTarget = path.join(firstTarget, secondEntry.name);
    if (!secondEntry.isDirectory()) {
      removalTargets.push(secondTarget);
      continue;
    }

    secondLevelDirectories.push(secondTarget);
    for (const thirdEntry of await entries(secondTarget)) {
      removalTargets.push(path.join(secondTarget, thirdEntry.name));
    }
  }
}

await mapLimit(removalTargets, 48, removePath);
await mapLimit(secondLevelDirectories, 24, removePath);
await mapLimit(firstLevelDirectories, 12, removePath);
await removePath(outputDir);
