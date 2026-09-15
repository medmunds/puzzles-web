import { puzzles, versions } from "../assets/puzzles/catalog.json";

export { puzzleIds } from "../assets/puzzles/catalog.json";

export interface PuzzleDataMap {
  [id: string]: PuzzleData;
}

export interface PuzzleData {
  name: string;
  description: string;
  objective: string;
  collection: string;
  unfinished?: boolean;
}

export const puzzleDataMap: Readonly<PuzzleDataMap> = puzzles;

interface UpstreamId {
  date: string;
  sha: string;
}

export interface PuzzleVersions {
  puzzles: UpstreamId;
  "puzzles-unreleased": UpstreamId;
}

export const puzzleVersions: Readonly<PuzzleVersions> = versions;

export function versionString(version: UpstreamId): string {
  // YYYYMMDD.shortSha (ensuring date is UTC)
  const dateStr = new Date(version.date).toISOString().slice(0, 10).replace(/-/g, "");
  const shortSha = version.sha.slice(0, 7);
  return `${dateStr}.${shortSha}`;
}
