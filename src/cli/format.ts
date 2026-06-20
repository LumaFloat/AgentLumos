export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function formatWarning(message: string): string {
  return `${message}\n`;
}
