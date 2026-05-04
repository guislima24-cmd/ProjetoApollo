/**
 * Fonte 2: Phantombuster — enriquecimento de dados de empresas via LinkedIn.
 *
 * Requer (variáveis de ambiente):
 *   PHANTOMBUSTER_API_KEY            — chave da API (https://phantombuster.com → Settings → API Key)
 *   PHANTOMBUSTER_COMPANY_AGENT_ID   — ID do agente "LinkedIn Company Scraper" na sua conta
 *
 * Degradação graciosa: se qualquer variável estiver ausente, retorna null
 * e o lead segue no pipeline sem dados do LinkedIn — não trava os outros.
 *
 * Fluxo:
 *   1. POST /api/v2/agents/launch → obtém containerId
 *   2. Polling GET /api/v2/containers/fetch-output?id={containerId}
 *   3. Quando status === 'finished', parseia o JSON de saída
 */

export interface PhantombusterResult {
  linkedin_url:   string | null
  funcionarios:   number | null
  posts_recentes: string[]
  decisores:      Array<{ nome: string; cargo: string; linkedin_url: string }>
}

const BASE = 'https://api.phantombuster.com/api/v2'
const POLL_INTERVAL_MS = 3_000
const MAX_POLLS        = 15   // 45s de timeout total

export async function enrichWithLinkedIn(
  companyName: string,
  location: string
): Promise<PhantombusterResult | null> {
  const apiKey  = process.env.PHANTOMBUSTER_API_KEY
  const agentId = process.env.PHANTOMBUSTER_COMPANY_AGENT_ID

  if (!apiKey || !agentId) {
    // Sem chave → degradação graciosa
    return null
  }

  try {
    // ── 1. Lança o agente ──────────────────────────────────────────────────────
    const launchRes = await fetch(`${BASE}/agents/launch`, {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'X-Phantombuster-Key':  apiKey,
      },
      body: JSON.stringify({
        id:       agentId,
        argument: {
          companyName,
          location,
          numberOfResultsPerSearch: 1,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!launchRes.ok) {
      console.error(`[phantombuster] Launch ${launchRes.status} para "${companyName}"`)
      return null
    }

    const { containerId } = await launchRes.json() as { containerId?: string }
    if (!containerId) return null

    // ── 2. Polling ─────────────────────────────────────────────────────────────
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

      const outputRes = await fetch(
        `${BASE}/containers/fetch-output?id=${containerId}`,
        {
          headers: { 'X-Phantombuster-Key': apiKey },
          signal:  AbortSignal.timeout(8_000),
        }
      ).catch(() => null)

      if (!outputRes?.ok) continue

      const output = await outputRes.json() as {
        status?: string
        output?: string
      }

      if (output.status === 'error') {
        console.warn(`[phantombuster] Agente retornou erro para "${companyName}"`)
        return null
      }

      if (output.status === 'finished') {
        if (!output.output) return null

        // ── 3. Parseia a saída ────────────────────────────────────────────────
        const raw = JSON.parse(output.output) as Record<string, unknown>[] | Record<string, unknown>
        const company = Array.isArray(raw) ? raw[0] : raw
        if (!company) return null

        const employees = (
          (company.employees ?? company.keyPeople ?? []) as Record<string, unknown>[]
        )
          .filter(e => /diretor|gerente|ceo|cfo|cto|vp|head|presidente|sócio/i.test(
            String(e.jobTitle ?? e.cargo ?? '')
          ))
          .slice(0, 5)
          .map(e => ({
            nome:         String(e.name ?? e.nome ?? ''),
            cargo:        String(e.jobTitle ?? e.cargo ?? ''),
            linkedin_url: String(e.linkedInUrl ?? e.linkedin_url ?? ''),
          }))

        const posts = (
          (company.posts ?? company.recentPosts ?? []) as Record<string, unknown>[]
        )
          .slice(0, 3)
          .map(p => String(p.title ?? p.text ?? p.content ?? '').slice(0, 120))
          .filter(Boolean)

        return {
          linkedin_url: (company.linkedInUrl ?? company.linkedin_url ?? null) as string | null,
          funcionarios: (company.numberOfEmployees ?? company.employeeCount ?? null) as number | null,
          posts_recentes: posts,
          decisores:      employees,
        }
      }
    }

    console.warn(`[phantombuster] Timeout (${MAX_POLLS * POLL_INTERVAL_MS / 1000}s) para "${companyName}"`)
    return null
  } catch (err) {
    console.error(`[phantombuster] Erro para "${companyName}":`, err)
    return null
  }
}
