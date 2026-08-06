/** esbuild loads .css imports as text (see esbuild.mjs `loader`). */
declare module "*.css" {
  const content: string;
  export default content;
}
