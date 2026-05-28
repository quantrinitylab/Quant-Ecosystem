const MANIP = /\b(best ever|amazing|incredible|must|urgent|act now|hurry|limited)\b/i;
export class AIIntegrity {
  // prettier-ignore
  assessOutput(text: string, confidence: number) { return { text, confidence, warningFlag: confidence < 0.7 }; }
  checkManipulation(text: string) {
    const m = MANIP.exec(text);
    const reasons = m ? [`Contains manipulative language: "${m[0]}"`] : [];
    return { safe: reasons.length === 0, reasons };
  }
  // prettier-ignore
  addDisclaimer(text: string, confidence: number) { return confidence < 0.5 ? `[Quant might be wrong] ${text}` : text; }
}
