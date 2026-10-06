import { xdr, scValToNative } from '@stellar/stellar-sdk';

/**
* Utility function to decode Soroban RPC results into standard JavaScript/TypeScript types.
*
* The current Stellar SDK returns parsed `xdr.ScVal` objects from successful
* simulations, while older call sites may still provide base64-encoded XDR.
*
* @param result - A parsed ScVal or base64-encoded ScVal.
* @returns The parsed JavaScript primitive or object.
*/
export function parseSorobanResult(result: string | xdr.ScVal): any {
  if (!result) {
    return null;
  }

  try {
    const parsedXdr =
      typeof result === 'string'
        ? xdr.ScVal.fromXDR(result, 'base64')
        : result;
    return scValToNative(parsedXdr);
  } catch (error) {
    // TODO: Create comprehensive XDR error mapping (translate raw Soroban error codes into readable string messages)
    console.error("Failed to parse Soroban XDR result:", error);
    throw new Error("XDR Parsing failed.");
  }
}
