/** Test pages are loaded as text through Vite's ?raw imports. */
declare module '*.html?raw' {
  const html: string;
  export default html;
}

declare module '*.txt?raw' {
  const text: string;
  export default text;
}
