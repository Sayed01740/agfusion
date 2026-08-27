
    const publicClient = viem.createPublicClient({
      chain: arcViem,
      transport: viem.http(),
    });

    // This route only prepares/estimates a transaction. The connected wallet
    // remains the signer in the browser. Model the minimal EIP-1193 provider
    // contract required by the installed Circle/Viem adapter version.
    let provider: EIP1193Provider;
    provider = {
      request: (async ({ method, params }) => {
        if (method === "eth_accounts") return [address];
        if (method === "eth_chainId") return "0x4cef52";
        return publicClient.request({ method: method as never, params: params as never });
      }) as EIP1193Provider["request"],
      on: () => provider,
      removeListener: () => provider,
    };

    // Keep the adapter configuration compatible with Circle's provider factory.