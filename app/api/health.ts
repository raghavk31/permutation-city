// GET /api/health: shows the serverless functions are deployed. The brief compiler and
// retrieval (Phase 4) live next to it; API keys stay here, never in the client.
export function GET(): Response {
  return Response.json({ ok: true, service: "permutation-city", time: new Date().toISOString() });
}
