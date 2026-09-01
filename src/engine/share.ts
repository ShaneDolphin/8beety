import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { decodeProjectFile, type DecodedProjectFile, type ProjectFile } from "./project-io";

// Share links carry the whole ProjectFile compressed into the URL fragment.
export function encodeShare(file: ProjectFile): string {
  return "p=" + compressToEncodedURIComponent(JSON.stringify(file));
}

export function decodeShare(fragment: string): DecodedProjectFile | null {
  if (!fragment.startsWith("p=")) return null;
  try {
    const json = decompressFromEncodedURIComponent(fragment.slice(2));
    if (!json) return null;
    return decodeProjectFile(JSON.parse(json));
  } catch {
    return null;
  }
}
