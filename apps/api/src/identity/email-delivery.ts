export type EmailMessage =
  | {
      type: "verify-email";
      to: string;
      token: string;
      expiresAt: Date;
    }
  | {
      type: "reset-password";
      to: string;
      token: string;
      expiresAt: Date;
    };

export interface EmailDelivery {
  send(message: EmailMessage): Promise<void>;
}

export const EMAIL_DELIVERY = Symbol("EMAIL_DELIVERY");

/** Local/test adapter. Messages stay in memory and are never written to logs. */
export class DevelopmentEmailDelivery implements EmailDelivery {
  readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    if (this.messages.length >= 100) this.messages.shift();
    this.messages.push(message);
  }

  readMessages(email: string): EmailMessage[] {
    return this.messages.filter(
      (message) => message.to.toLowerCase() === email.toLowerCase(),
    );
  }
}
