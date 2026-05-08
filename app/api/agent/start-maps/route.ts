import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { analyzeCompanyForMaps } from '@/lib/agent/source-ai-analysis-maps'
import { saveMapLead } from '@/lib/sheets'
import {
  logApiCall, canMakeCall,
  TEXT_SEARCH_COST, PLACE_DETAILS_COST,
} from '@/lib/agent/maps-usage-tracker'

export const dynamic = 'force-dynamic'

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY
const PLACES_BASE    = 'https://places.googleapis.com/v1'

function sseEvent(type: string, data: object): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`
}

async function textSearch(query: string, limite: number): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'X-Goog-Api-Key':  PLACES_API_KEY!,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.businessStatus',
    },
    body: JSON.stringify({
      textQuery:      query,
      languageCode:   'pt-BR',
      regionCode:     'BR',
      maxResultCount: Math.min(limite, 20),
    }),
  })
  if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return ((data.places ?? []) as any[])
    .filter((p: any) => !p.businessStatus || p.businessStatus === 'OPERATIONAL')
    .map((p: any) => ({ id: p.id as string, name: (p.displayName?.text ?? '') as string }))
}

async function placeDetails(placeId: string): Promise<any> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key':  PLACES_API_KEY!,
      'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,businessStatus,types,regularOpeningHours',
    },
  })
  if (!res.ok) return null
  return res.json()
}

function formatPhone(intl: string | undefined): string {
  return intl ? intl.replace(/[+\s\-()]/g, '') : ''
}

function formatHours(opening: any): string | null {
  const desc: string[] = opening?.weekdayDescriptions ?? []
  return desc.length ? desc.join(' | ') : null
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.memberTab) {
    return Response.json({ error: 'Não autenticado' }, { status: 401 })
  }
  const memberTab = session.user.memberTab

  if (!PLACES_API_KEY) {
    return Response.json({ error: 'GOOGLE_PLACES_API_KEY não configurada' }, { status: 400 })
  }

  const { setor, cidades, limite = 20, useAI = true } = await req.json() as {
    setor:   string
    cidades: string[]
    limite:  number
    useAI:   boolean
  }

  if (!setor || !cidades?.length) {
    return Response.json({ error: 'setor e cidades são obrigatórios' }, { status: 400 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc  = new TextEncoder()
      const emit = (type: string, data: object) => {
        try { controller.enqueue(enc.encode(sseEvent(type, data))) } catch {}
      }

      let totalFound  = 0
      let totalSaved  = 0
      let totalErrors = 0

      try {
        for (const cidade of cidades) {
          // Guard: check usage before each city search
          const check = await canMakeCall(TEXT_SEARCH_COST)
          if (!check.allowed) {
            emit('error', {
              blocked: true,
              reason:  check.reason,
              current_usage_usd: check.currentUsage,
              limit_usd:         check.limit,
              message: `Limite mensal de segurança atingido ($${check.currentUsage.toFixed(2)}/$${check.limit}). Aguarde renovação no início do próximo mês.`,
            })
            break
          }

          const query = `${setor} em ${cidade}, Brasil`
          console.log(`[MAPS_AGENT] Buscando: "${query}"`)

          let places: { id: string; name: string }[] = []
          try {
            places = await textSearch(query, limite)
            await logApiCall('text_search', query, memberTab)
          } catch (err) {
            console.error('[MAPS_AGENT] Erro no text search:', err)
            emit('error', { message: `Erro na busca para ${cidade}: ${String(err)}` })
            totalErrors++
            continue
          }

          console.log(`[MAPS_AGENT] ${cidade}: ${places.length} resultados`)

          for (const place of places) {
            const detailCheck = await canMakeCall(PLACE_DETAILS_COST)
            if (!detailCheck.allowed) {
              emit('error', {
                blocked: true,
                reason:  detailCheck.reason,
                current_usage_usd: detailCheck.currentUsage,
                limit_usd:         detailCheck.limit,
                message: `Limite atingido durante processamento de ${cidade}.`,
              })
              break
            }

            await new Promise(r => setTimeout(r, 200))

            let details: any = null
            try {
              details = await placeDetails(place.id)
              await logApiCall('place_details', place.name, memberTab)
            } catch (err) {
              console.error('[MAPS_AGENT] Erro no place details:', err)
              totalErrors++
              continue
            }
            if (!details) continue

            const nome         = (details.displayName?.text   ?? place.name) as string
            const endereco     = (details.formattedAddress     ?? '')         as string
            const telefone_br  = (details.nationalPhoneNumber  ?? null)       as string | null
            const telefone_intl = formatPhone(details.internationalPhoneNumber) || null
            const site         = (details.websiteUri           ?? null)       as string | null
            const tipos        = (details.types                ?? [])         as string[]
            const horario      = formatHours(details.regularOpeningHours)

            totalFound++
            emit('company_found', { name: nome, city: cidade, phone: telefone_br, website: site })
            console.log(`[MAPS_AGENT] Encontrada: ${nome} | tel: ${telefone_br ?? '-'} | site: ${site ?? '-'}`)

            let analysis: Awaited<ReturnType<typeof analyzeCompanyForMaps>> = null
            if (useAI) {
              try {
                analysis = await analyzeCompanyForMaps({ nome, tipos, cidade, endereco, site, horario })
                if (analysis) {
                  emit('analysis_done', { name: nome, potencial: analysis.potencial, argumento: analysis.argumento_abertura })
                  console.log(`[MAPS_AGENT] IA: ${nome} → potencial=${analysis.potencial}`)
                }
              } catch (aiErr) {
                const errMsg = (aiErr as Error).message ?? String(aiErr)
                console.error(`[MAPS_AGENT] Erro IA para ${nome}:`, errMsg)
                emit('ai_warning', { name: nome, error: errMsg })
                // analysis permanece null — lead salvo sem dados de IA
              }
            }

            try {
              const rowNum = await saveMapLead({
                empresa:            nome,
                setor:              tipos[0] ?? setor,
                cidade,
                endereco,
                telefone_br,
                telefone_intl,
                site,
                horario,
                potencial:          analysis?.potencial          ?? null,
                justificativa:      analysis?.justificativa       ?? null,
                dores_tipicas:      analysis?.dores_tipicas       ?? [],
                servicos_sugeridos: analysis?.servicos_sugeridos  ?? [],
                melhor_canal:       analysis?.melhor_canal        ?? null,
                melhor_horario:     analysis?.melhor_horario      ?? null,
                argumento_abertura: analysis?.argumento_abertura  ?? null,
                memberTab,
              })
              totalSaved++
              emit('lead_saved', {
                name:       nome,
                row_number: rowNum,
                lead: {
                  nome,
                  setor:              tipos[0] ?? setor,
                  cidade,
                  endereco,
                  telefone_br,
                  telefone_intl,
                  site,
                  horario,
                  potencial:          analysis?.potencial          ?? null,
                  justificativa:      analysis?.justificativa       ?? null,
                  dores_tipicas:      analysis?.dores_tipicas       ?? [],
                  servicos_sugeridos: analysis?.servicos_sugeridos  ?? [],
                  melhor_canal:       analysis?.melhor_canal        ?? null,
                  melhor_horario:     analysis?.melhor_horario      ?? null,
                  argumento_abertura: analysis?.argumento_abertura  ?? null,
                  ok: true,
                },
              })
              console.log(`[MAPS_AGENT] Salvo: ${nome} (linha ${rowNum})`)
            } catch (err) {
              console.error('[MAPS_AGENT] Erro ao salvar lead:', err)
              totalErrors++
            }
          }

          if (cidades.indexOf(cidade) < cidades.length - 1) {
            await new Promise(r => setTimeout(r, 1000))
          }
        }
      } catch (err) {
        console.error('[MAPS_AGENT] Erro geral:', err)
        emit('error', { message: String(err) })
      }

      emit('done', { total_found: totalFound, total_saved: totalSaved, total_errors: totalErrors })
      console.log(`[MAPS_AGENT] Concluído: ${totalSaved}/${totalFound} salvos, ${totalErrors} erros`)
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
