import { promises as fs } from 'fs';
import path from 'path';

/**
 * Configuration for spec discovery.
 */
export interface SpecDiscoveryConfig {
  /** File names to look for in spec directories (default: ['spec.md']) */
  requiredFiles?: string[];
}

export async function getActiveChangeIds(root: string = process.cwd()): Promise<string[]> {
  const changesPath = path.join(root, 'openspec', 'changes');
  try {
    const entries = await fs.readdir(changesPath, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'archive') continue;
      const proposalPath = path.join(changesPath, entry.name, 'proposal.md');
      try {
        await fs.access(proposalPath);
        result.push(entry.name);
      } catch {
        // skip directories without proposal.md
      }
    }
    return result.sort();
  } catch {
    return [];
  }
}

export async function getSpecIds(
  root: string = process.cwd(),
  config?: SpecDiscoveryConfig
): Promise<string[]> {
  const specsPath = path.join(root, 'openspec', 'specs');
  const requiredFiles = config?.requiredFiles ?? ['spec.md'];
  const result: string[] = [];
  try {
    const entries = await fs.readdir(specsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      // Check that all required files exist
      let hasAllFiles = true;
      for (const fileName of requiredFiles) {
        const filePath = path.join(specsPath, entry.name, fileName);
        try {
          await fs.access(filePath);
        } catch {
          hasAllFiles = false;
          break;
        }
      }

      if (hasAllFiles) {
        result.push(entry.name);
      }
    }
  } catch {
    // ignore
  }
  return result.sort();
}

export async function getArchivedChangeIds(root: string = process.cwd()): Promise<string[]> {
  const archivePath = path.join(root, 'openspec', 'changes', 'archive');
  try {
    const entries = await fs.readdir(archivePath, { withFileTypes: true });
    const result: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const proposalPath = path.join(archivePath, entry.name, 'proposal.md');
      try {
        await fs.access(proposalPath);
        result.push(entry.name);
      } catch {
        // skip directories without proposal.md
      }
    }
    return result.sort();
  } catch {
    return [];
  }
}

