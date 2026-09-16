declare module '*.css';

declare module '*?artifact' {
  export const css: readonly string[];
  const classes: Readonly<Record<string, string>>;
  export default classes;
}
