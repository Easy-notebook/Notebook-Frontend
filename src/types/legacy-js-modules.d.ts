// Global declaration to treat all legacy .js modules as 'any'
declare module "*.js" {
  const value: any;
  export default value;
}
