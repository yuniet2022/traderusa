export interface BrokerAvailability {
  available: boolean | null;
  checkedAt: number;
  source: "Robinhood";
}
