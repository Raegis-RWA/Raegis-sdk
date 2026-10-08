export interface CompliantTransferIntent {
  readonly sender: string;
  readonly recipient: string;
  readonly amount: number;
  readonly contractId: string;
  readonly networkPassphrase: string;
  readonly compliance: {
    readonly sender: true;
    readonly recipient: true;
  };
}
