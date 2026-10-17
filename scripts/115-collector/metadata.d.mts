export const maximumMetadataBytes: number;
export function inspectMetadata(magnet: string, bytes: Buffer): Promise<{ hash: string; name: string; size: string; resolution: string; qualityLabel: string }>;
