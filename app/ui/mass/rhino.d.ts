// rhino3dm's ES module build (its own types describe only the CommonJS entry).
declare module "rhino3dm/rhino3dm.module.js" {
  const rhino3dm: (options?: { locateFile?: (path: string) => string }) => Promise<any>;
  export default rhino3dm;
}
