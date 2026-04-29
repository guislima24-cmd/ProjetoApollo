export const metadata = { title: 'Instalar Extensão — ProspectAI' }

export default function InstalarPage() {
  const steps = [
    {
      num: '1',
      title: 'Baixe o arquivo da extensão',
      desc: 'Clique no botão abaixo para baixar o arquivo ZIP da extensão ProspectAI.',
      action: (
        <a
          href="/prospectai-extension.zip"
          download
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: 'var(--green-primary)', color: 'var(--cream)',
            padding: '12px 24px', borderRadius: '8px',
            fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.95rem',
            textDecoration: 'none', transition: 'opacity 0.15s',
          }}
        >
          ↓ Baixar ProspectAI Extension.zip
        </a>
      ),
    },
    {
      num: '2',
      title: 'Extraia o ZIP',
      desc: 'Clique com o botão direito no arquivo baixado → "Extrair tudo" → escolha uma pasta fácil de encontrar (ex: Documentos). Anote onde salvou.',
      tip: 'Não mova nem apague essa pasta depois — o Chrome vai precisar dela.',
    },
    {
      num: '3',
      title: 'Abra a página de extensões do Chrome',
      desc: (
        <>
          Na barra de endereço do Chrome, cole exatamente isso e pressione Enter:
          <code style={{
            display: 'block', margin: '10px 0',
            background: '#0a0a0a', border: '1px solid var(--border)',
            borderRadius: '6px', padding: '8px 12px',
            fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--gold)',
          }}>
            chrome://extensions
          </code>
        </>
      ),
    },
    {
      num: '4',
      title: 'Ative o Modo Desenvolvedor',
      desc: 'No canto superior direito da página de extensões, você vai ver um botão chamado "Modo do desenvolvedor". Clique para ativar — vai aparecer uma chave/toggle azul.',
    },
    {
      num: '5',
      title: 'Carregue a extensão',
      desc: 'Clique no botão "Carregar sem compactação" que apareceu. Selecione a pasta que você extraiu no passo 2 (a pasta que contém o arquivo manifest.json). Clique em "Selecionar pasta".',
    },
    {
      num: '6',
      title: 'Pronto! Faça login',
      desc: 'A extensão ProspectAI vai aparecer na lista. Clique no ícone de quebra-cabeça no canto do Chrome → ProspectAI → faça login com seu email @ufabcjr.com.br.',
      tip: 'Fixe a extensão clicando no alfinete ao lado do nome — fica mais fácil de acessar.',
    },
  ]

  return (
    <main style={{ maxWidth: 680, margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: 36 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(49,112,57,0.12)', border: '1px solid var(--green-primary)',
          borderRadius: 100, padding: '4px 14px', marginBottom: 16,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-primary)', fontFamily: 'Syne, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Extensão Chrome
          </span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--cream)', fontFamily: 'Syne, sans-serif', marginBottom: 8 }}>
          Instale o ProspectAI no Chrome
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.6 }}>
          A extensão detecta automaticamente quando você faz uma conexão ou envia mensagem no LinkedIn e registra na planilha CRM — sem copiar e colar nada.
        </p>
      </div>

      {/* Requisitos */}
      <div style={{
        background: 'rgba(241,190,73,0.06)', border: '1px solid rgba(241,190,73,0.25)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 32,
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>⚠</span>
        <div style={{ fontSize: 13, color: '#c9a84c', lineHeight: 1.6 }}>
          <strong>Requisitos:</strong> Google Chrome (versão 88 ou superior) · Email @ufabcjr.com.br ·
          Conta cadastrada no ProspectAI
        </div>
      </div>

      {/* Passos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '20px 22px',
              display: 'flex', gap: 18, alignItems: 'flex-start',
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
              background: 'var(--green-primary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 15,
              color: 'var(--cream)',
            }}>
              {step.num}
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: 15, color: 'var(--cream)', marginBottom: 8 }}>
                {step.title}
              </h3>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                {step.desc}
              </div>
              {step.action && <div style={{ marginTop: 14 }}>{step.action}</div>}
              {step.tip && (
                <div style={{
                  marginTop: 10, fontSize: 12, color: 'var(--text-muted)',
                  borderLeft: '2px solid var(--green-primary)', paddingLeft: 10,
                }}>
                  💡 {step.tip}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Rodapé */}
      <div style={{
        marginTop: 32, padding: '20px 22px',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 12, textAlign: 'center',
      }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12 }}>
          Problemas na instalação? Fale com quem te mandou esse link.
        </p>
        <a
          href="/gerador"
          style={{
            color: 'var(--green-primary)', fontFamily: 'Syne, sans-serif',
            fontWeight: 700, fontSize: 14, textDecoration: 'none',
          }}
        >
          Acessar o ProspectAI →
        </a>
      </div>
    </main>
  )
}
