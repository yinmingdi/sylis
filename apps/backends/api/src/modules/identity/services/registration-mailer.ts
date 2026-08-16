import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";

import { ApiConfig } from "../../../config/api.config";

@Injectable()
export class RegistrationMailer {
  constructor(private readonly config: ApiConfig) {}

  async sendRegistrationLink(email: string, token: string): Promise<void> {
    await this.sendVerificationLink({
      email,
      token,
      path: "/register",
      subject: "Complete your Sylis registration",
      message: "Complete registration",
    });
  }

  async sendPasswordRecoveryLink(email: string, token: string): Promise<void> {
    await this.sendVerificationLink({
      email,
      token,
      path: "/recover",
      subject: "Reset your Sylis password",
      message: "Reset password",
    });
  }

  private async sendVerificationLink(input: {
    email: string;
    token: string;
    path: string;
    subject: string;
    message: string;
  }): Promise<void> {
    const smtp = this.config.smtp;
    if (
      !smtp.host ||
      !smtp.port ||
      !smtp.user ||
      !smtp.password ||
      !smtp.from
    ) {
      throw new ServiceUnavailableException(
        "Registration email is unavailable",
      );
    }
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.password },
    });
    const url = new URL(input.path, this.config.publicOrigin);
    url.searchParams.set("token", input.token);
    await transport.sendMail({
      from: smtp.from,
      to: input.email,
      subject: input.subject,
      text: `${input.message}: ${url.href}`,
    });
  }
}
