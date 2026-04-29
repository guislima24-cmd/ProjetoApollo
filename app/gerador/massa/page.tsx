import { redirect } from 'next/navigation'

// /gerador/massa redireciona para /gerador com tab=bulk
// (o gerador já tem a tab "⚡ Bulk CSV" por padrão)
export default function MassaPage() {
  redirect('/gerador?tab=bulk')
}
