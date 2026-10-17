// Place search as you type: Photon (komoot), built on OpenStreetMap. Nominatim's public
// server doesn't allow autocomplete; Photon does.
export interface Place { name: string; detail: string; center: [number, number]; bbox: [number, number, number, number] | null }

export async function search(q: string, near?: [number, number], signal?: AbortSignal): Promise<Place[]> {
  const u = new URL("https://photon.komoot.io/api/");
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "6");
  if (near) { u.searchParams.set("lon", near[0].toFixed(3)); u.searchParams.set("lat", near[1].toFixed(3)); }
  const r = await fetch(u, { signal });
  if (!r.ok) throw new Error(`search failed (${r.status})`);
  const data = await r.json();
  return (data.features ?? []).map((f: any): Place => {
    const p = f.properties ?? {};
    const detail = [p.district, p.city, p.state, p.country].filter((x: string | undefined, i: number, a: string[]) => x && x !== p.name && a.indexOf(x) === i).join(", ");
    const e = p.extent as number[] | undefined; // [west, north, east, south]
    return { name: p.name ?? p.street ?? "unnamed", detail, center: f.geometry.coordinates,
      bbox: e ? [e[0], e[3], e[2], e[1]] : null };
  });
}
