// Test-only resolver: Next.js-style "@/..." aliases and extensionless TypeScript imports.
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) specifier = pathToFileURL(path.join(root, specifier.slice(2))).href;
  try { return await next(specifier, context); }
  catch (error) {
    if (/^(\.|\/|file:)/.test(specifier) || /^next\//.test(specifier)) {
      for (const suffix of [".ts", ".tsx", "/index.ts", ".js"]) {
        try { return await next(specifier + suffix, context); } catch { /* try next */ }
      }
    }
    throw error;
  }
}
