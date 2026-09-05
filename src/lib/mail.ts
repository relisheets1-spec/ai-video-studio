import {
  APP_NAME,
  APP_URL,
  MAIL_FROM,
  RESEND_API_KEY,
  SMTP_HOST,
  SMTP_PASSWORD,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
} from "./env";

/**
 * Почта: Resend (HTTP, без зависимостей) или SMTP хостера.
 * Если не настроено ничего, письмо уходит в журнал сервера — этого хватает
 * для разработки и для первого запуска, пока домен ещё не подключён.
 */

export type MailProvider = "resend" | "smtp" | "log";

export function mailProvider(): MailProvider {
  if (RESEND_API_KEY) return "resend";
  if (SMTP_HOST) return "smtp";
  return "log";
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export type MailResult = { ok: true; provider: MailProvider } | { ok: false; error: string };

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const provider = mailProvider();
  try {
    if (provider === "resend") return await sendViaResend(message);
    if (provider === "smtp") return await sendViaSmtp(message);
    console.info(`[mail:log] → ${message.to}\n${message.subject}\n${message.text}`);
    return { ok: true, provider: "log" };
  } catch (err: any) {
    console.error("[mail] отправка не удалась:", err?.message || err);
    return { ok: false, error: err?.message || "Не удалось отправить письмо" };
  }
}

async function sendViaResend(message: MailMessage): Promise<MailResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    return { ok: false, error: `Resend ${res.status}: ${body}` };
  }
  return { ok: true, provider: "resend" };
}

async function sendViaSmtp(message: MailMessage): Promise<MailResult> {
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE || SMTP_PORT === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({
    from: MAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
  return { ok: true, provider: "smtp" };
}

// ---------------------------------------------------------------------------
// Шаблоны. Простой текст: письма с кодом реже попадают в спам и читаются везде.
// ---------------------------------------------------------------------------

const signature = `\n\n— ${APP_NAME}\n${APP_URL}`;

export function loginCodeMail(to: string, code: string, minutes: number): MailMessage {
  return {
    to,
    subject: `${code} — код входа в ${APP_NAME}`,
    text:
      `Код для входа: ${code}\n\n` +
      `Действует ${minutes} минут и только для этого адреса.\n` +
      `Если вход запрашивали не вы — просто не вводите код.` +
      signature,
  };
}

export function adminCodeMail(to: string, code: string, minutes: number): MailMessage {
  return {
    to,
    subject: `${code} — код входа в панель ${APP_NAME}`,
    text:
      `Код для входа в панель администратора: ${code}\n\n` +
      `Действует ${minutes} минут.\n` +
      `Если вход запрашивали не вы — сообщите владельцу сайта.` +
      signature,
  };
}

export function requestReceivedMail(to: string): MailMessage {
  return {
    to,
    subject: `Заявка на доступ к ${APP_NAME} принята`,
    text:
      `Заявка принята и ждёт решения администратора.\n\n` +
      `Когда её одобрят, вы получите код приглашения — с ним и своей почтой ` +
      `можно будет завершить регистрацию на сайте.` +
      signature,
  };
}

export function inviteMail(to: string, code: string, days: number): MailMessage {
  return {
    to,
    subject: `Код приглашения в ${APP_NAME}`,
    text:
      `Заявка одобрена. Код приглашения: ${code}\n\n` +
      `Код одноразовый, привязан к этому адресу и действует ${days} дней.\n` +
      `Откройте ${APP_URL}, введите свою почту и этот код — дальше вход будет по коду с письма.` +
      signature,
  };
}

export function rejectedMail(to: string): MailMessage {
  return {
    to,
    subject: `Заявка на доступ к ${APP_NAME} отклонена`,
    text: `Администратор отклонил заявку на доступ.` + signature,
  };
}
