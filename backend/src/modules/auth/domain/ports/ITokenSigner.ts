export interface ITokenSigner {
  sign(payload: Record<string, unknown>): string
}
