'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function RestoreButton({ documentId }: { documentId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  return (
    <button
      className="btn small secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const res = await fetch(`/api/documents/${documentId}/restore`, { method: 'POST' })
        setBusy(false)
        if (res.ok) router.refresh()
      }}
    >
      {busy ? 'Restoring…' : 'Restore'}
    </button>
  )
}
