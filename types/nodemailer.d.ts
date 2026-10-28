declare module 'nodemailer' {
  interface MailOptions { from: string; to: string; subject: string; text: string }
  interface SmtpOptions { host: string; port: number; secure: boolean; auth: { user: string; pass: string } }
  interface Transport { sendMail(options: MailOptions): Promise<unknown> }
  const nodemailer: { createTransport(options: SmtpOptions): Transport };
  export default nodemailer;
}
