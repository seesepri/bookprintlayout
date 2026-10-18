declare module "*.mjs?url" {
  const src: string;
  export default src;
}

declare module "pdfjs-dist/build/pdf.worker.mjs?url" {
  const src: string;
  export default src;
}

declare module "pdfjs-dist/build/pdf.worker.mjs?raw" {
  const src: string;
  export default src;
}

declare module "*?raw" {
  const src: string;
  export default src;
}
// TypeScript 7 reports TS2882 for a side-effect import whose target has no type
// declaration. `src/index.css` resolves on disk but has no types: Vite ships that
// declaration inside `vite/client`, which this project never references (tsconfig
// `types` is ["node"], and adding the reference would re-declare the same `*?raw`
// / `*?url` modules already in this file). Declaring it locally keeps the shim
// file the single place Vite-specific module shapes live.
declare module "*.css" {}
