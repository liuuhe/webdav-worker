export type SessionState = {
  authenticated: boolean
  adminConfigured: boolean
  csrfToken: string
}

export type PublicApp = {
  id: string
  name: string
  slug: string
  accessUrl: string
  rootPrefix: string
  notes: string
  authEnabled: boolean
  authUsername: string
  createdAt: string
  updatedAt: string
}

export type AppFormValues = {
  name: string
  slug: string
  rootPrefix: string
  notes: string
  authEnabled: boolean
  authUsername: string
  authPassword: string
}

export type DeleteAppOptions = {
  purgeData: boolean
}

export type ApiErrorPayload = {
  error?: string
  errorCode?: string
}
