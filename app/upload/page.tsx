import { redirect } from 'next/navigation'
import { UploadForm } from '@/components/upload-form'
import { loginUrl } from '@/lib/auth-redirect'
import { getCurrentYapinUser } from '@/lib/yapin-session'

export const dynamic = 'force-dynamic'

export default async function UploadPage() {
  const user = await getCurrentYapinUser()
  if (!user) redirect(loginUrl('/upload'))

  return <UploadForm />
}