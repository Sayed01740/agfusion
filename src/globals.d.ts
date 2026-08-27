// TypeScript 6+ checks side-effect imports more strictly. Next.js loads CSS
// through the bundler, so declare CSS assets as valid modules for tsc.
declare module "*.css";
