/**
 * Minimal sanitizer for agent markdown rendered via dangerouslySetInnerHTML.
 * Strips scripts, event handlers, and dangerous URLs.
 */

export function sanitizeAgentText(input: string): string {
  if (!input) return "";
  let s = input;
  // Remove script/style blocks
  s = s.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "");
  // Remove on* handlers
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Neutralize javascript: urls
  s = s.replace(/javascript:/gi, "");
  // Limit length
  if (s.length > 20_000) s = s.slice(0, 20_000) + "\n…";
  return s;
}
