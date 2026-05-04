/**
 * POST /api/descoberta — pipeline de descoberta de leads com SSE streaming.
 *
 * Fluxo:
 *   1. Busca empresas no Brasil.io com os filtros recebidos
 *   2. Para cada empresa (em lotes de 5 paralelos):
 *      a. Enriquecimento via Phantombuster (LinkedIn)
 *      b. Análise de mercado via Claude
 *   3. Salva cada lead na aba "🔍 Descobertos" do Google Sheets
 *   4. Emite eventos SSE conforme avança
 *
 * Eventos SSE emitidos:
 *   status   { message: string }
 *   total    { count: number }
 *   lead     { ...DiscoveredLeadRecord, potencial, dores_tipicas, ... }
 *   error    { message: string }
 *   done     { count: number }
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { searchCompanies }    from '@/lib/sources/brasil-io'
import { enrichWithLinkedIn } from '@/lib/sources/phantombuster'
import { analyzeMarket }      from '@/lib/sources/market-analysis'
import { saveDiscoveredLead, logUsage } from '@/lib/sheets'

export const dynamic = 'force-dynamic'

const BATCH_SIZE = 5

type SseEmit = (event: string, data: unknown) => void

async function processCompany(
  company: Awaited<ReturnType<typeof searchCompanies>>[number],
  emit: SseEmit,
  memberTab: string
) {
  const nome = company.nome_fantasia || company.razao_social

  emit('status', { message: `Enriquecendo: ${nome}…` })

  // Phantombuster + Claude em paralelo
  const [linkedinResult, analysisResult] = await Promise.allSettled([
    enrichWithLinkedIn(nome, company.municipio),
    analyzeMarket({
      nome,
      setor:  company.cnae_fiscal_descricao ?? company.cnae_fiscal,
      porte:  company.porte_empresa ?? '',
      cidade: company.municipio,
    }),
  ])

  const linkedin = linkedinResult.status  === 'fulfilled' ? linkedinResult.value  : null
  const analysis = analysisResult.status === 'fulfilled' ? analysisResult.value : null

  const lead = {
    empresa:             nome,
    cnpj:                company.cnpj,
    setor:               company.cnae_fiscal_descricao ?? company.cnae_fiscal,
    porte:               company.porte_empresa ?? '',
    cidade:              company.municipio,
    email:               company.email,
    telefone:            company.telefone,
    linkedin_url:        linkedin?.linkedin_url  ?? null,
    funcionarios:        linkedin?.funcionarios   ?? null,
    decisores:           (linkedin?.decisores ?? []).map(d => `${d.nome} (${d.cargo})`),
    potencial:           analysis?.potencial         ?? null,
    justificativa:       analysis?.justificativa      ?? null,
    dores_tipicas:       analysis?.dores_tipicas      ?? [],
    servicos_sugeridos:  analysis?.servicos_sugeridos ?? [],
    argumento_abertura:  analysis?.argumento_abertura ?? null,
    status:              'Descoberto',
  }

  // Salva no Sheets sem bloquear o stream
  saveDiscoveredLead(lead).catch(err =>
    console.error('[descoberta] Sheets save error:', err)
  )

  // Log de uso (custo zero pois o token count não vem dessa rota)
  logUsage({ memberTab, acao: 'descoberta_lead' })

  emit('lead', lead)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const memberTab = session.user.memberTab

  const body = await req.json() as {
    setor:    string
    regioes:  string[]
    portes:   string[]
    limite:   number
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit: SseEmit = (event, data) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          )
        } catch {
          // Stream pode já ter sido fechado pelo cliente
        }
      }

      try {
        emit('status', { message: 'Conectando ao Brasil.io…' })

        let companies: Awaited<ReturnType<typeof searchCompanies>>
        try {
          companies = await searchCompanies({
            setor:   body.setor   ?? '',
            regioes: body.regioes ?? [],
            portes:  body.portes  ?? [],
            limite:  Math.min(body.limite ?? 30, 100),
          })
        } catch (err) {
          emit('error', { message: err instanceof Error ? err.message : 'Erro ao buscar empresas' })
          controller.close()
          return
        }

        if (companies.length === 0) {
          emit('error', { message: 'Nenhuma empresa encontrada com esses filtros. Tente ajustar o setor ou as regiões.' })
          controller.close()
          return
        }

        emit('total', { count: companies.length })
        emit('status', { message: `${companies.length} empresas encontradas. Iniciando enriquecimento…` })

        // Processa em lotes de BATCH_SIZE em paralelo
        for (let i = 0; i < companies.length; i += BATCH_SIZE) {
          const batch = companies.slice(i, i + BATCH_SIZE)
          await Promise.allSettled(
            batch.map(company =>
              processCompany(company, emit, memberTab).catch(err =>
                console.error('[descoberta] Erro em processCompany:', err)
              )
            )
          )
        }

        emit('done', { count: companies.length })
      } catch (err) {
        console.error('[descoberta] Pipeline error:', err)
        emit('error', { message: 'Erro interno no pipeline. Verifique os logs.' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream; charset=utf-8',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
