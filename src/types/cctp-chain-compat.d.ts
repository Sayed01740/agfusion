import "@/lib/cctp-chains";

declare module "@/lib/cctp-chains" {
  interface CctpChainConfig {
    /** Legacy explorer template consumed by the compatibility bridge path. */
    explorer?: string;
  }
}
