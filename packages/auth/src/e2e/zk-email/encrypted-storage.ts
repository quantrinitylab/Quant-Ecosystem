// ============================================================================
// ZK Email - Encrypted Storage
// Server stores ciphertext only, decryption happens client-side
// ============================================================================

import * as openpgp from 'openpgp';

export interface EncryptedEmail {
  encryptedContent: string;
  encryptedSubject: string;
  encryptedSender: string;
  timestamp: number;
}

export interface EmailContent {
  subject: string;
  sender: string;
  body: string;
}

export class EncryptedEmailStorage {
  /**
   * Encrypt an email's content using the recipient's OpenPGP public key.
   * The server only stores the encrypted ciphertext.
   */
  async encryptEmail(email: EmailContent, publicKey: openpgp.Key): Promise<EncryptedEmail> {
    const encryptedContent = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: email.body }),
      encryptionKeys: publicKey,
      format: 'armored',
    });

    const encryptedSubject = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: email.subject }),
      encryptionKeys: publicKey,
      format: 'armored',
    });

    const encryptedSender = await openpgp.encrypt({
      message: await openpgp.createMessage({ text: email.sender }),
      encryptionKeys: publicKey,
      format: 'armored',
    });

    return {
      encryptedContent: encryptedContent as string,
      encryptedSubject: encryptedSubject as string,
      encryptedSender: encryptedSender as string,
      timestamp: Date.now(),
    };
  }

  /**
   * Decrypt an encrypted email using the recipient's private key.
   */
  async decryptEmail(
    encryptedEmail: EncryptedEmail,
    privateKey: openpgp.PrivateKey,
  ): Promise<EmailContent> {
    const bodyMessage = await openpgp.readMessage({
      armoredMessage: encryptedEmail.encryptedContent,
    });
    const { data: body } = await openpgp.decrypt({
      message: bodyMessage,
      decryptionKeys: privateKey,
    });

    const subjectMessage = await openpgp.readMessage({
      armoredMessage: encryptedEmail.encryptedSubject,
    });
    const { data: subject } = await openpgp.decrypt({
      message: subjectMessage,
      decryptionKeys: privateKey,
    });

    const senderMessage = await openpgp.readMessage({
      armoredMessage: encryptedEmail.encryptedSender,
    });
    const { data: sender } = await openpgp.decrypt({
      message: senderMessage,
      decryptionKeys: privateKey,
    });

    return {
      subject: subject as string,
      sender: sender as string,
      body: body as string,
    };
  }

  /**
   * Encrypt an attachment (binary data) using the recipient's public key.
   */
  async encryptAttachment(data: Uint8Array, publicKey: openpgp.Key): Promise<string> {
    const encrypted = await openpgp.encrypt({
      message: await openpgp.createMessage({ binary: data }),
      encryptionKeys: publicKey,
      format: 'armored',
    });

    return encrypted as string;
  }

  /**
   * Decrypt an encrypted attachment using the recipient's private key.
   */
  async decryptAttachment(encrypted: string, privateKey: openpgp.PrivateKey): Promise<Uint8Array> {
    const message = await openpgp.readMessage({ armoredMessage: encrypted });
    const { data } = await openpgp.decrypt({
      message,
      decryptionKeys: privateKey,
      format: 'binary',
    });

    return data as Uint8Array;
  }
}
