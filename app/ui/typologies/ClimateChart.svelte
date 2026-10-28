<script lang="ts">
  // A precedent's climate against a site's, month by month (engine/typology/climate.ts): daily
  // temperature range as a band, and rain as paired bars, in two panels on their own scales
  // (never one chart with two axes). Site in blue, precedent in orange (both validated for
  // colour-blind separation and contrast, light and dark). Hover a month for its values; the
  // same numbers are in a table below.
  import type { Normals } from "../../engine/typology/climate";

  let { site, place, siteName, placeName }: { site: Normals; place: Normals; siteName: string; placeName: string } = $props();

  const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const W = 480, L = 34, R = 8, TOP = 10, TH = 120, GAP = 30, RH = 90, B = 18;
  const colW = (W - L - R) / 12, x = (m: number) => L + colW * (m + 0.5);

  const tLo = $derived(Math.floor(Math.min(...site.tmin, ...place.tmin) / 5) * 5);
  const tHi = $derived(Math.ceil(Math.max(...site.tmax, ...place.tmax) / 5) * 5);
  const ty = (t: number) => TOP + TH * (1 - (t - tLo) / Math.max(1, tHi - tLo));
  const rMax = $derived(Math.max(50, Math.ceil(Math.max(...site.rain, ...place.rain) / 50) * 50));
  const r0 = TOP + TH + GAP, ry = (v: number) => r0 + RH * (1 - v / rMax);
  const tTicks = $derived(Array.from({ length: (tHi - tLo) / 5 + 1 }, (_, i) => tLo + i * 5).filter((_, i, a) => a.length <= 6 || i % 2 === 0));

  const band = (n: Normals) =>
    [...n.tmax.map((t, m) => `${x(m).toFixed(1)},${ty(t).toFixed(1)}`), ...n.tmin.map((t, m) => `${x(m).toFixed(1)},${ty(t).toFixed(1)}`).reverse()].join(" ");
  const line = (v: number[]) => v.map((t, m) => `${m ? "L" : "M"}${x(m).toFixed(1)} ${ty(t).toFixed(1)}`).join("");
  // a bar with a 2 px rounded top, anchored square to the baseline
  const bar = (cx: number, w: number, v: number) => {
    const y = ry(v), b = r0 + RH, rr = Math.min(2, (b - y) / 2);
    return `M${cx - w / 2} ${b}V${y + rr}Q${cx - w / 2} ${y} ${cx - w / 2 + rr} ${y}H${cx + w / 2 - rr}Q${cx + w / 2} ${y} ${cx + w / 2} ${y + rr}V${b}Z`;
  };

  let hover = $state<number | null>(null);
  const fmt = (v: number | null | undefined, d = 0) => (v == null ? "-" : v.toFixed(d));
</script>

<figure class="cc">
  <div class="cc-legend" aria-hidden="true">
    <span><i class="cc-sw is-site"></i>{siteName}</span>
    <span><i class="cc-sw is-place"></i>{placeName}</span>
  </div>
  <div class="cc-plot">
    <svg viewBox="0 0 {W} {r0 + RH + B}" role="img" aria-label="Monthly temperature range and rain: {siteName} against {placeName}">
      <text class="cc-title" x={L} y={TOP - 2}>Daily temperature, lowest to highest (°C)</text>
      {#each tTicks as t (t)}
        <line class="cc-grid" x1={L} x2={W - R} y1={ty(t)} y2={ty(t)} />
        <text class="cc-tick" x={L - 6} y={ty(t) + 3.5} text-anchor="end">{t}</text>
      {/each}
      <polygon class="cc-band is-site" points={band(site)} />
      <polygon class="cc-band is-place" points={band(place)} />
      <path class="cc-line is-site" d={line(site.tmax)} /><path class="cc-line is-site" d={line(site.tmin)} />
      <path class="cc-line is-place" d={line(place.tmax)} /><path class="cc-line is-place" d={line(place.tmin)} />

      <text class="cc-title" x={L} y={r0 - 8}>Rain (mm a month)</text>
      {#each [0, rMax / 2, rMax] as v (v)}
        <line class="cc-grid" x1={L} x2={W - R} y1={ry(v)} y2={ry(v)} />
        <text class="cc-tick" x={L - 6} y={ry(v) + 3.5} text-anchor="end">{v}</text>
      {/each}
      {#each MONTHS as _, m (m)}
        {@const w = Math.min(10, colW / 2 - 3)}
        <path class="cc-bar is-site" d={bar(x(m) - w / 2 - 1, w, site.rain[m])} />
        <path class="cc-bar is-place" d={bar(x(m) + w / 2 + 1, w, place.rain[m])} />
        <text class="cc-tick" x={x(m)} y={r0 + RH + 13} text-anchor="middle">{MONTHS[m]}</text>
      {/each}

      {#if hover != null}<line class="cc-cross" x1={x(hover)} x2={x(hover)} y1={TOP} y2={r0 + RH} />{/if}
      {#each MONTHS as _, m (m)}
        <rect class="cc-hit" x={L + colW * m} y={TOP} width={colW} height={r0 + RH - TOP}
          role="presentation" onpointerenter={() => (hover = m)} onpointerleave={() => (hover = null)} />
      {/each}
    </svg>
    {#if hover != null}
      {@const m = hover}
      <div class="cc-tip" style="left: {(x(m) / W) * 100}%">
        <strong>{MONTH_NAMES[m]}</strong>
        <span><i class="cc-sw is-site"></i>{fmt(site.tmin[m])}-{fmt(site.tmax[m])} °C · {fmt(site.rain[m])} mm · {fmt(site.rh[m])}%</span>
        <span><i class="cc-sw is-place"></i>{fmt(place.tmin[m])}-{fmt(place.tmax[m])} °C · {fmt(place.rain[m])} mm · {fmt(place.rh[m])}%</span>
      </div>
    {/if}
  </div>
  <details class="cc-table">
    <summary>Show as a table</summary>
    <table>
      <thead><tr><th scope="col">Month</th><th scope="col">{siteName}</th><th scope="col">{placeName}</th></tr></thead>
      <tbody>
        {#each MONTH_NAMES as name, m (m)}
          <tr><th scope="row">{name}</th>
            <td>{fmt(site.tmin[m])}-{fmt(site.tmax[m])} °C, {fmt(site.rain[m])} mm, {fmt(site.rh[m])}%</td>
            <td>{fmt(place.tmin[m])}-{fmt(place.tmax[m])} °C, {fmt(place.rain[m])} mm, {fmt(place.rh[m])}%</td></tr>
        {/each}
      </tbody>
    </table>
  </details>
</figure>

<style>
  .cc { margin: 0; display: grid; gap: var(--wb-s2); --cc-site: #2a78d6; --cc-place: #eb6834; }
  :global(:root[data-theme="dark"]) .cc { --cc-site: #3987e5; --cc-place: #d95926; }
  @media (prefers-color-scheme: dark) { :global(:root:not([data-theme="light"])) .cc { --cc-site: #3987e5; --cc-place: #d95926; } }
  .cc-legend { display: flex; flex-wrap: wrap; gap: var(--wb-s4); font-size: var(--pc-size-small); color: var(--pc-ink-2); }
  .cc-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .cc-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
  .cc-sw.is-site { background: var(--cc-site); }
  .cc-sw.is-place { background: var(--cc-place); }
  .cc-plot { position: relative; max-width: 560px; }
  svg { width: 100%; max-width: 560px; height: auto; display: block; }
  .cc-title { font: 500 10.5px var(--pc-font); fill: var(--pc-ink-2); }
  .cc-tick { font: 10px var(--pc-mono); fill: var(--pc-muted); }
  .cc-grid { stroke: var(--pc-line); stroke-width: 1; }
  .cc-band { stroke: none; opacity: 0.16; }
  .cc-band.is-site { fill: var(--cc-site); }
  .cc-band.is-place { fill: var(--cc-place); }
  .cc-line { fill: none; stroke-width: 2; stroke-linejoin: round; }
  .cc-line.is-site { stroke: var(--cc-site); }
  .cc-line.is-place { stroke: var(--cc-place); }
  .cc-bar.is-site { fill: var(--cc-site); }
  .cc-bar.is-place { fill: var(--cc-place); }
  .cc-cross { stroke: var(--pc-ink-2); stroke-width: 1; stroke-dasharray: 2 2; }
  .cc-hit { fill: transparent; }
  .cc-tip {
    position: absolute; top: 0; transform: translateX(-50%); pointer-events: none; z-index: 1;
    display: grid; gap: 2px; padding: 6px 8px; min-width: 190px;
    background: var(--pc-surface); border: var(--wb-hair); border-radius: var(--pc-radius);
    font-size: var(--pc-size-small); color: var(--pc-ink); box-shadow: 0 2px 8px color-mix(in srgb, var(--pc-ink) 12%, transparent);
  }
  .cc-tip span { display: inline-flex; align-items: center; gap: 6px; color: var(--pc-ink-2); }
  .cc-table summary { cursor: pointer; font-size: var(--pc-size-small); color: var(--pc-ink-2); }
  .cc-table table { width: 100%; border-collapse: collapse; font-size: var(--pc-size-small); margin-top: var(--wb-s2); }
  .cc-table th, .cc-table td { text-align: left; padding: 3px 6px 3px 0; border-bottom: var(--wb-hair); font-weight: 400; }
  .cc-table thead th { font-weight: 500; }
</style>
