import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/admin-guard'
import { PlinthWordmark } from '@/components/PlinthLogo'
import { CatalogueClient } from './catalogue-client'

export const dynamic = 'force-dynamic'

/** Catalogue management — SPEC §4 admin catalogue CRUD. */
export default async function AdminCataloguePage() {
  const sa = await requireSuperAdmin()
  if (!sa) redirect('/launcher')
  const supabase = createClient()

  const { data: apps } = await supabase
    .from('apps')
    .select('id, slug, name, category, one_liner, description, status, app_url, redirect_urls, sort_order')
    .order('sort_order')

  return (
    <>
      <header className="titleblock">
        <Link href="/admin" style={{ textDecoration: 'none' }}>
          <PlinthWordmark />
        </Link>
        <span className="meta">
          <strong>Admin</strong> · Catalogue · <Link href="/admin">Back</Link>
        </span>
      </header>
      <main className="container">
        <div className="page-head">
          <h1>Catalogue</h1>
        </div>
        <CatalogueClient apps={apps ?? []} />
      </main>
    </>
  )
}
