import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";

import { ApiConfig } from "../../../config/api.config";

@Injectable()
export class RegistrationMailer {
  constructor(private readonly config: ApiConfig) {}

  async sendRegistrationLink(email: string, token: string): Promise<void> {
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
    const url = new URL("/verify", this.config.publicOrigin);
    url.searchParams.set("token", token);
    await transport.sendMail({
      from: smtp.from,
      to: email,
      subject: "Complete your Sylis registration",
      text: `Complete registration: ${url.href}`,
    });
  }
}
