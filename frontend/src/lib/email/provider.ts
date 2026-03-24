export type EmailSendInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; contentType: string; content: Buffer }[];
};

export type EmailSendOutput = { messageId: string };

export interface EmailProvider {
  send(input: EmailSendInput): Promise<EmailSendOutput>;
}

class DisabledEmailProvider implements EmailProvider {
  async send(): Promise<EmailSendOutput> {
    throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
  }
}

export function getEmailProvider(): EmailProvider {
  return new DisabledEmailProvider();
}
