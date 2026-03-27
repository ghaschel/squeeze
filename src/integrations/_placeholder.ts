export interface PendingIntegrationModule {
  integration: string;
  implemented: false;
  message: string;
}

export function createPendingIntegrationModule(
  integration: string
): PendingIntegrationModule {
  return {
    integration,
    implemented: false,
    message: `${integration} integration is planned but not implemented yet. Use the root JS/TS API for now.`,
  };
}
