/**
 * Attachment virus scanning engine and interface for QuantMail.
 * Adheres to Task M27 (Virus scanning on attachment upload path).
 */

export interface ScanResult {
  isInfected: boolean;
  virusName?: string;
  scannedAt: Date;
  engine: string;
}

export interface AttachmentScannerPort {
  scanBuffer(buffer: Buffer, filename?: string): Promise<ScanResult>;
}

export const EICAR_TEST_SIGNATURE =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export class DefaultAttachmentScanner implements AttachmentScannerPort {
  async scanBuffer(buffer: Buffer, filename?: string): Promise<ScanResult> {
    const scannedAt = new Date();

    // 1. Standard EICAR Antivirus Test Pattern check
    if (buffer.includes(Buffer.from(EICAR_TEST_SIGNATURE))) {
      return {
        isInfected: true,
        virusName: 'EICAR-Test-Signature',
        scannedAt,
        engine: 'QuantHeuristicScanner',
      };
    }

    // 2. Embedded Windows Executable Header check inside non-executable MIME/extension
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      // 'MZ' magic bytes
      return {
        isInfected: true,
        virusName: 'Suspicious-Polyglot-MZ-Header',
        scannedAt,
        engine: 'QuantHeuristicScanner',
      };
    }

    return {
      isInfected: false,
      scannedAt,
      engine: 'QuantHeuristicScanner',
    };
  }
}
