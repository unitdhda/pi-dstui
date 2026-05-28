export function isKillerInput(data: string): boolean {
  return data === "\u0003" || data === "\u0004" || data.toLowerCase() === "ctrl+c" || data.toLowerCase() === "ctrl+d";
}
