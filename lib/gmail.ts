/**
 * Gmail API — detecção de prospecções enviadas e respostas recebidas.
 *
 * Usa o access_token OAuth do membro logado (não service account).
 * O token já inclui escopo gmail.readonly solicitado no login.
 *
 * Dois casos de uso:
 *   1. syncSentEmails()  — varre caixa de enviados, detecta novos leads
 *   2. syncReplies()     — varre inbox, detecta respostas a prospecções
 */

import { google } from 'googleapis'
import type { ExtractedEmailLead } from '@/types'

function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.gmail({ version: 'v1', auth })
}

/**
 * Busca emails enviados nas últimas `hours` horas.
 * Filtra por assuntos/padrões típicos de prospecção (pode ser ajustado).
 */
export async function getSentEmails(
  accessToken: string,
  hours = 24
): Promise<ExtractedEmailLead[]> {
  const gmail = getGmailClient(accessToken)
  const after = Math.floor((Date.now() - hours * 60 * 60 * 1000) / 1000)

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: `in:sent after:${after}`,
    maxResults: 50,
  })

  const messages = listRes.data.messages ?? []
  const leads: ExtractedEmailLead[] = []

  for (const msg of messages) {
    if (!msg.id) continue
    try {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['To', 'Subject', 'Date'],
      })

      const headers = detail.data.payload?.headers ?? []
      const getHeader = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''

      const to = getHeader('To')
      const subject = getHeader('Subject')
      const date = getHeader('Date')

      // Extrai email e nome do campo To (formato: "Nome <email@>" ou "email@")
      const emailMatch = to.match(/<([^>]+)>/)
      const email = emailMatch ? emailMatch[1] : to.replace(/.*<|>.*/g, '').trim()
      const nomeRaw = to.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() ?? ''

      if (!email || email === 'me') continue

      leads.push({
        messageId: msg.id,
        email,
        nome: nomeRaw,
        assunto: subject,
        dataEnvio: date,
        threadId: detail.data.threadId ?? '',
      })
    } catch {
      // Ignora mensagens individuais com erro
    }
  }

  return leads
}

/**
 * Envia um email a partir da conta do membro logado usando Gmail API.
 * Retorna o threadId para rastreamento de respostas.
 */
export async function sendGmailMessage(
  accessToken: string,
  opts: { to: string; subject: string; body: string; fromName: string }
): Promise<{ messageId: string; threadId: string }> {
  const gmail = getGmailClient(accessToken)

  // Monta o email em formato RFC 2822
  const raw = [
    `From: ${opts.fromName} <me>`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    opts.body,
  ].join('\r\n')

  const encoded = Buffer.from(raw).toString('base64url')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })

  return {
    messageId: res.data.id ?? '',
    threadId: res.data.threadId ?? '',
  }
}

/**
 * Verifica se alguma das threads de prospecção recebeu resposta.
 * Retorna os threadIds que têm resposta não lida no inbox.
 */
export async function getRepliesToThreads(
  accessToken: string,
  threadIds: string[]
): Promise<string[]> {
  if (!threadIds.length) return []
  const gmail = getGmailClient(accessToken)
  const repliedThreads: string[] = []

  for (const threadId of threadIds) {
    try {
      const res = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'minimal',
      })
      const messages = res.data.messages ?? []
      // Se tem mais de 1 mensagem na thread, alguém respondeu
      if (messages.length > 1) {
        repliedThreads.push(threadId)
      }
    } catch {
      // Thread não encontrada — ignora
    }
  }

  return repliedThreads
}
