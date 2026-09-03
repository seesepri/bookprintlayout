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
