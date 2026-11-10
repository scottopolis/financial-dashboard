import type { State } from './model.ts'

// The web app goes through the same tools as the agent, so every change shows up in both.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? res.statusText)
  return body
}

export const fetchState = () => request<State>('/api/state')

export const callTool = (name: string, args: object) =>
  request<{ result: string; state: State }>(`/api/tools/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  })

export const fetchTools = () => request<{ name: string; description: string }[]>('/api/tools')

export const fetchOverview = () => fetch('/api/overview').then((r) => r.text())

export const fetchConnector = () => request<Connector>('/api/connector')

export type Connector = { path: string; node: string; stdioScript: string }

/** Runs a tool from the app. Resolves to false and shows the error if it failed. */
export type Act = (tool: string, args: object) => Promise<boolean>
