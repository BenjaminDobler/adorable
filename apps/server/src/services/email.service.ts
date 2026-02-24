import nodemailer from 'nodemailer';
import { serverConfigService } from './server-config.service';

class EmailService {
  private getTransporter() {
    const host = serverConfigService.get('smtp.host');
    const port = parseInt(serverConfigService.get('smtp.port') || '587', 10);
    const user = serverConfigService.get('smtp.user');
    const pass = serverConfigService.get('smtp.pass');

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  isConfigured(): boolean {
    const host = serverConfigService.get('smtp.host');
    const user = serverConfigService.get('smtp.user');
    return !!(host && user);
  }

  async sendVerificationEmail(email: string, token: string, baseUrl: string) {
    if (!this.isConfigured()) {
      console.warn('[Email] SMTP not configured, skipping verification email');
      return;
    }

    const from = serverConfigService.get('smtp.from');
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

    const transporter = this.getTransporter();
    await transporter.sendMail({
      from,
      to: email,
      subject: 'Verify your Adorable account',
      html: `
        <h2>Welcome to Adorable!</h2>
        <p>Please verify your email address by clicking the link below:</p>
        <p><a href="${verifyUrl}">Verify Email Address</a></p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      `,
    });
  }
}

export const emailService = new EmailService();
