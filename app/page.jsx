"use client";

import React, { useState, useRef, useMemo } from "react";

/* ============================================================
   Travel Market — AI Multi-Destination Itinerary Generator
   Light / purple SaaS landing (quso-style) + functional builder
   Calls /api/generate (key stays on the server)
   ============================================================ */

/* ---------- date helpers ---------- */
const parseD = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};
const daysInc = (a, b) => {
  const da = parseD(a), db = parseD(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000) + 1;
};
const addDays = (s, n) => {
  const d = parseD(s);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return d;
};
const fmtLong = (s) => {
  const d = typeof s === "string" ? parseD(s) : s;
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};
const fmtStamp = (d) =>
  d ? d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase() : "";

/* ---------- scaffold ---------- */
function buildScaffold(destinations) {
  const ordered = [...destinations].sort((a, b) => {
    const da = parseD(a.arrival), db = parseD(b.arrival);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  });
  let global = 0;
  return ordered.map((dest, di) => {
    const n = daysInc(dest.arrival, dest.departure);
    const days = [];
    for (let i = 0; i < n; i++) {
      global += 1;
      days.push({ globalDay: global, date: addDays(dest.arrival, i), isFirst: i === 0, isLast: i === n - 1 });
    }
    return { ...dest, di, days };
  });
}

/* ---------- fallback content ---------- */
function fallbackDay(sd, dest, isFirstDest, isFinalDest, nextCity) {
  const city = dest.city || "your destination";
  const stay = dest.hotelName ? dest.hotelName : "your accommodation";
  if (sd.isFirst) {
    if (isFirstDest)
      return { title: `Arrival in ${city}`, bullets: [`Arrive in ${city}`, `Transfer to ${stay}`, "Check in and settle", "Short walk near the accommodation"] };
    return { title: `Arrival in ${city}`, bullets: [`Travel to ${city}`, `Check in at ${stay}`, "Explore the surrounding area", "Evening at leisure"] };
  }
  if (sd.isLast) {
    if (isFinalDest)
      return { title: "Departure", bullets: ["Breakfast and check-out", "Transfer to the airport", "Final sightseeing if time allows", `Depart ${city}`] };
    return { title: `Departure to ${nextCity || "next destination"}`, bullets: ["Breakfast and check-out", "Transfer to station or airport", `Travel to ${nextCity || "the next city"}`, "Check in at the next accommodation"] };
  }
  return { title: `Exploring ${city}`, bullets: ["Visit the principal landmarks", "Discover the historic centre", "Lunch in a central district", "Evening at leisure"] };
}

/* ---------- AI call via our backend ---------- */
async function aiDaysForDestination(dest, ctx) {
  try {
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        city: dest.city, country: dest.country, hotelName: dest.hotelName,
        isFirstDest: ctx.isFirstDest, isFinalDest: ctx.isFinalDest, nextCity: ctx.nextCity, variation: ctx.variation,
        days: dest.days.map((d) => ({ dayNumber: d.globalDay, dateLong: fmtLong(d.date), isFirst: d.isFirst, isLast: d.isLast })),
      }),
    });
    const data = await resp.json();
    if (!data.ok || !Array.isArray(data.days)) return { ok: false, days: [] };
    return { ok: true, days: data.days };
  } catch (e) {
    return { ok: false, days: [] };
  }
}

/* ---------- plain text ---------- */
function toPlainText(it, meta) {
  const L = [];
  L.push("TRAVEL ITINERARY");
  if (meta.agency) L.push("Prepared by " + meta.agency);
  L.push("");
  L.push("Traveller(s): " + meta.travelers.join(", "));
  L.push(`Dates: ${fmtLong(meta.arrival)} – ${fmtLong(meta.departure)}`);
  L.push(`Total duration: ${meta.total} days`);
  L.push("");
  L.push("DESTINATIONS");
  it.forEach((d, i) => L.push(`${i + 1}. ${d.country} — ${d.city}  (${fmtLong(d.arrival)} – ${fmtLong(d.departure)}, ${daysInc(d.arrival, d.departure)} days)`));
  L.push("");
  it.forEach((dest) => {
    L.push("────────────────────────────");
    L.push(`${dest.country.toUpperCase()} — ${dest.city.toUpperCase()}`);
    if (dest.hotelName) L.push(`Accommodation: ${dest.hotelName}${dest.hotelPhone ? " · " + dest.hotelPhone : ""}`);
    if (dest.arrivalTransfer) L.push(`Arrival transfer: ${dest.arrivalTransfer}`);
    if (dest.departureTransfer) L.push(`Departure transfer: ${dest.departureTransfer}`);
    L.push("");
    dest.days.forEach((day) => {
      L.push(`Day ${day.globalDay} — ${day.title}`);
      day.bullets.forEach((b) => L.push("  • " + b));
      L.push("");
    });
  });
  return L.join("\n");
}

let _id = 0;
const uid = () => ++_id;

export default function Page() {
  const [arrival, setArrival] = useState("");
  const [departure, setDeparture] = useState("");
  const [agency, setAgency] = useState("");
  const [travelers, setTravelers] = useState([{ id: uid(), name: "" }]);
  const [destinations, setDestinations] = useState([
    { id: uid(), country: "", city: "", arrival: "", departure: "", hotelName: "", hotelPhone: "", arrivalTransfer: "", departureTransfer: "" },
  ]);

  const [itinerary, setItinerary] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [copied, setCopied] = useState(false);

  const errRef = useRef(null);
  const resultRef = useRef(null);
  const builderRef = useRef(null);
  const goBuild = () => builderRef.current && builderRef.current.scrollIntoView({ behavior: "smooth", block: "start" });

  const totalDays = useMemo(() => (arrival && departure ? daysInc(arrival, departure) : 0), [arrival, departure]);

  const addTraveler = () => setTravelers((t) => [...t, { id: uid(), name: "" }]);
  const removeTraveler = (id) => setTravelers((t) => (t.length > 1 ? t.filter((x) => x.id !== id) : t));
  const setTravelerName = (id, name) => setTravelers((t) => t.map((x) => (x.id === id ? { ...x, name } : x)));

  const addDestination = () => setDestinations((d) => [...d, { id: uid(), country: "", city: "", arrival: "", departure: "", hotelName: "", hotelPhone: "", arrivalTransfer: "", departureTransfer: "" }]);
  const removeDestination = (id) => setDestinations((d) => (d.length > 1 ? d.filter((x) => x.id !== id) : d));
  const setDest = (id, key, val) => setDestinations((d) => d.map((x) => (x.id === id ? { ...x, [key]: val } : x)));

  function validate() {
    const errs = [], warns = [];
    if (!arrival || !departure) errs.push("Add the overall arrival and departure dates.");
    if (arrival && departure && parseD(departure) < parseD(arrival)) errs.push("Overall departure must be on or after the arrival date.");
    const names = travelers.map((t) => t.name.trim()).filter(Boolean);
    if (names.length === 0) errs.push("Add at least one traveller name.");
    const ds = destinations;
    if (ds.length === 0) errs.push("Add at least one destination.");
    ds.forEach((d, i) => {
      const tag = `Destination ${i + 1}`;
      if (!d.country.trim() || !d.city.trim()) errs.push(`${tag}: add a country and city.`);
      if (!d.arrival || !d.departure) { errs.push(`${tag}: add arrival and departure dates.`); return; }
      if (parseD(d.departure) < parseD(d.arrival)) errs.push(`${tag}: departure must be on or after arrival.`);
      if (arrival && departure) {
        if (parseD(d.arrival) < parseD(arrival) || parseD(d.departure) > parseD(departure)) errs.push(`${tag}: dates must fall within the overall trip.`);
      }
    });
    const dated = ds.filter((d) => d.arrival && d.departure && parseD(d.departure) >= parseD(d.arrival));
    const sorted = [...dated].sort((a, b) => parseD(a.arrival) - parseD(b.arrival));
    for (let i = 1; i < sorted.length; i++) {
      if (parseD(sorted[i].arrival) <= parseD(sorted[i - 1].departure)) errs.push(`Dates overlap between ${sorted[i - 1].city || "a destination"} and ${sorted[i].city || "another"}.`);
    }
    if (arrival && departure && dated.length) {
      const sum = dated.reduce((s, d) => s + daysInc(d.arrival, d.departure), 0);
      if (sum !== totalDays) warns.push(`Destination days total ${sum}, but the trip spans ${totalDays} days — some days are unassigned.`);
      if (sorted.length && parseD(sorted[0].arrival) > parseD(arrival)) warns.push("The first destination starts after the trip's arrival date.");
      if (sorted.length && parseD(sorted[sorted.length - 1].departure) < parseD(departure)) warns.push("The last destination ends before the trip's departure date.");
    }
    return { errs, warns };
  }

  async function generate(variation = false) {
    const { errs, warns } = validate();
    setWarnings(warns);
    if (errs.length) {
      setErrors(errs); setItinerary(null); setNotice("");
      setTimeout(() => errRef.current && errRef.current.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
      return;
    }
    setErrors([]); setLoading(true); setNotice(""); setCopied(false);

    const scaffold = buildScaffold(destinations);
    const built = await Promise.all(
      scaffold.map(async (dest, idx) => {
        const isFirstDest = idx === 0;
        const isFinalDest = idx === scaffold.length - 1;
        const nextCity = isFinalDest ? "" : scaffold[idx + 1].city;
        const res = await aiDaysForDestination(dest, { isFirstDest, isFinalDest, nextCity, variation });
        const byNum = {};
        res.days.forEach((d) => { byNum[d.dayNumber] = d; });
        const days = dest.days.map((sd) => {
          const ai = byNum[sd.globalDay];
          const fb = fallbackDay(sd, dest, isFirstDest, isFinalDest, nextCity);
          const bullets = ai && Array.isArray(ai.bullets) && ai.bullets.length >= 2 ? ai.bullets.slice(0, 5) : fb.bullets;
          const title = ai && ai.title ? ai.title : fb.title;
          return { ...sd, title, bullets };
        });
        return { ...dest, days, aiOk: res.ok };
      })
    );

    setItinerary(built);
    setMeta({ travelers: travelers.map((t) => t.name.trim()).filter(Boolean), arrival, departure, total: totalDays, agency: agency.trim() });
    if (built.every((d) => !d.aiOk)) setNotice("The AI service could not be reached, so a standard itinerary was generated. Check your API key on the server, then regenerate.");
    else if (built.some((d) => !d.aiOk)) setNotice("AI styling was unavailable for part of the trip, so a standard itinerary was used there. You can regenerate to try again.");
    setLoading(false);
    setTimeout(() => resultRef.current && resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  async function copyItinerary() {
    if (!itinerary || !meta) return;
    const text = toPlainText(itinerary, meta);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="tg-root">
      <style>{CSS}</style>

      {/* ---------------- NAV ---------------- */}
      <nav className="nav no-print">
        <div className="nav-inner">
          <a className="brand" href="#top">
            <span className="brand-chip"><img src="/emblem.png" alt="Travel Market" /></span>
            <span className="brand-name">Travel Market</span>
          </a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#builder" onClick={(e) => { e.preventDefault(); goBuild(); }}>Build itinerary</a>
          </div>
          <button className="nav-cta" onClick={goBuild}>Get started</button>
        </div>
      </nav>

      {/* ---------------- HERO ---------------- */}
      <header className="hero no-print" id="top">
        <div className="hero-wrap">
          <div className="floats" aria-hidden="true">
            <div className="fcard" style={{ top: "26px", left: "1%", transform: "rotate(-6deg)" }}>📍 Rome · 3 days</div>
            <div className="fcard" style={{ top: "70px", right: "2%", transform: "rotate(5deg)" }}>✓ PDF ready</div>
            <div className="fcard" style={{ top: "45%", left: "-1%", transform: "rotate(4deg)" }}>Day 5 — Florence Highlights</div>
            <div className="fcard" style={{ top: "52%", right: "-1%", transform: "rotate(-5deg)" }}>14 days · 4 cities</div>
            <div className="fcard" style={{ bottom: "26px", left: "9%", transform: "rotate(3deg)" }}>✈ Barcelona → Madrid</div>
            <div className="fcard" style={{ bottom: "12px", right: "11%", transform: "rotate(-4deg)" }}>2 travellers</div>
          </div>

          <span className="hero-emblem"><img src="/emblem.png" alt="Travel Market" /></span>
          <div className="eyebrow">Making travel taste better</div>
          <h1 className="h1">Multi-city trips,<br /><span className="grad">planned in minutes</span></h1>
          <p className="lead">
            Enter your destinations and dates. Travel Market builds a concise, professional day-by-day
            itinerary — ready to download as a clean PDF for travellers, agencies and visa files.
          </p>

          <div className="proof">
            <div className="avatars">
              <span className="av" style={{ background: "linear-gradient(135deg,#8B5CF6,#6366F1)" }}>SA</span>
              <span className="av" style={{ background: "linear-gradient(135deg,#6366F1,#3B82F6)" }}>MK</span>
              <span className="av" style={{ background: "linear-gradient(135deg,#EC4899,#8B5CF6)" }}>RZ</span>
              <span className="av" style={{ background: "linear-gradient(135deg,#3B82F6,#06B6D4)" }}>AL</span>
            </div>
            <span>Loved by travellers &amp; agencies</span>
          </div>

          <div className="cta-row">
            <button className="btn-primary" onClick={goBuild}>Generate your itinerary →</button>
            <span className="cta-note">No sign-up required.</span>
          </div>
        </div>
      </header>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section className="hiw no-print" id="how">
        <div className="hiw-head">
          <h2>Three steps to a finished itinerary</h2>
          <p>No accounts, no clutter — just the trip and the document.</p>
        </div>
        <div className="steps">
          <div className="step">
            <span className="n">1</span>
            <h3>Enter the trip</h3>
            <p>Add travellers, then each city with its dates and hotel. Days are calculated automatically.</p>
          </div>
          <div className="step">
            <span className="n">2</span>
            <h3>AI builds the plan</h3>
            <p>A concise, formal day-by-day plan per destination — landmarks included, no fluff.</p>
          </div>
          <div className="step">
            <span className="n">3</span>
            <h3>Download the PDF</h3>
            <p>Preview, copy or save a clean PDF with a summary table and day-by-day sections.</p>
          </div>
        </div>
      </section>

      {/* ---------------- BUILDER ---------------- */}
      <main className="wrap no-print" id="builder" ref={builderRef}>
        <div className="build-head">
          <h2>Build your itinerary</h2>
          <p>Fill in the trip, travellers and stops — we’ll handle the day count.</p>
        </div>

        <section className="card">
          <div className="card-head"><span className="num">01</span><h2>Trip dates</h2>{totalDays > 0 && <span className="badge">{totalDays} days total</span>}</div>
          <div className="grid2">
            <Field label="Overall arrival"><input type="date" value={arrival} max={departure || undefined} onChange={(e) => setArrival(e.target.value)} /></Field>
            <Field label="Overall departure"><input type="date" value={departure} min={arrival || undefined} onChange={(e) => setDeparture(e.target.value)} /></Field>
          </div>
          <Field label="Prepared by / agency name" hint="Optional — appears on the document header">
            <input type="text" value={agency} placeholder="e.g. Travel Market" onChange={(e) => setAgency(e.target.value)} />
          </Field>
        </section>

        <section className="card">
          <div className="card-head"><span className="num">02</span><h2>Travellers</h2><span className="badge ghost">{travelers.filter((t) => t.name.trim()).length || 0}</span></div>
          <div className="stack">
            {travelers.map((t, i) => (
              <div className="traveler-row" key={t.id}>
                <Field label={`Full passport name ${i + 1}`}><input type="text" value={t.name} placeholder="As written in the passport" onChange={(e) => setTravelerName(t.id, e.target.value)} /></Field>
                <button className="icon-btn" disabled={travelers.length === 1} onClick={() => removeTraveler(t.id)} title="Remove traveller" aria-label="Remove traveller">✕</button>
              </div>
            ))}
          </div>
          <button className="add-btn" onClick={addTraveler}>+ Add traveller</button>
        </section>

        <section className="card">
          <div className="card-head"><span className="num">03</span><h2>Destinations</h2><span className="badge ghost">{destinations.length} stops</span></div>
          <div className="dest-rail">
            {destinations.map((d, i) => {
              const dur = d.arrival && d.departure && parseD(d.departure) >= parseD(d.arrival) ? daysInc(d.arrival, d.departure) : 0;
              return (
                <div className="dest-card pop" key={d.id}>
                  <div className="pin">{i + 1}</div>
                  <div className="dest-head">
                    <h3>{d.city ? `${d.city}${d.country ? ", " + d.country : ""}` : `Destination ${i + 1}`}</h3>
                    <div className="dest-head-right">
                      {dur > 0 && <span className="dur-chip">{dur} {dur === 1 ? "day" : "days"}</span>}
                      <button className="icon-btn sm" disabled={destinations.length === 1} onClick={() => removeDestination(d.id)} title="Remove destination" aria-label="Remove destination">✕</button>
                    </div>
                  </div>
                  <div className="grid2">
                    <Field label="Country"><input type="text" value={d.country} placeholder="Italy" onChange={(e) => setDest(d.id, "country", e.target.value)} /></Field>
                    <Field label="City"><input type="text" value={d.city} placeholder="Rome" onChange={(e) => setDest(d.id, "city", e.target.value)} /></Field>
                  </div>
                  <div className="grid2">
                    <Field label="Arrival in this city"><input type="date" value={d.arrival} min={arrival || undefined} max={departure || undefined} onChange={(e) => setDest(d.id, "arrival", e.target.value)} /></Field>
                    <Field label="Departure from this city"><input type="date" value={d.departure} min={d.arrival || arrival || undefined} max={departure || undefined} onChange={(e) => setDest(d.id, "departure", e.target.value)} /></Field>
                  </div>
                  <div className="grid2">
                    <Field label="Hotel / accommodation"><input type="text" value={d.hotelName} placeholder="Hotel name" onChange={(e) => setDest(d.id, "hotelName", e.target.value)} /></Field>
                    <Field label="Hotel phone"><input type="tel" value={d.hotelPhone} placeholder="+39 ..." onChange={(e) => setDest(d.id, "hotelPhone", e.target.value)} /></Field>
                  </div>
                  <div className="grid2">
                    <Field label="Arrival flight / train / transfer" hint="Optional"><input type="text" value={d.arrivalTransfer} placeholder="e.g. AZ 204" onChange={(e) => setDest(d.id, "arrivalTransfer", e.target.value)} /></Field>
                    <Field label="Departure flight / train / transfer" hint="Optional"><input type="text" value={d.departureTransfer} placeholder="e.g. FR 9012" onChange={(e) => setDest(d.id, "departureTransfer", e.target.value)} /></Field>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="add-btn" onClick={addDestination}>+ Add destination</button>
        </section>

        {errors.length > 0 && (
          <div className="banner err" ref={errRef}><strong>Please fix the following:</strong><ul>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
        )}
        {warnings.length > 0 && errors.length === 0 && (
          <div className="banner warn"><strong>Heads up</strong><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
        )}

        <button className="generate" onClick={() => generate(false)} disabled={loading}>
          {loading ? <><span className="spin" /> Building your itinerary…</> : "Generate itinerary"}
        </button>
        {notice && <p className="soft-note">{notice}</p>}
      </main>

      {/* ---------------- RESULT ---------------- */}
      {itinerary && meta && (
        <>
          <div className="action-bar no-print" ref={resultRef}>
            <button className="act primary" onClick={() => window.print()}>Save as PDF</button>
            <button className="act" onClick={() => window.print()}>Print</button>
            <button className="act" onClick={copyItinerary}>{copied ? "Copied ✓" : "Copy text"}</button>
            <button className="act" onClick={() => generate(true)} disabled={loading}>Regenerate</button>
          </div>

          <article className="doc">
            <div className="doc-pad">
              <div className="doc-head">
                <div className="doc-brand">
                  <span className="doc-chip"><img src="/emblem.png" alt="Travel Market" /></span>
                  <div>
                    <div className="doc-kicker">TRAVEL ITINERARY</div>
                    <h2 className="doc-title">{itinerary.map((d) => d.city).join(" · ")}</h2>
                  </div>
                </div>
                {meta.agency && <div className="doc-agency">Prepared by<br /><strong>{meta.agency}</strong></div>}
              </div>

              <div className="doc-summary">
                <div><span className="lbl">Traveller(s)</span><span className="val">{meta.travelers.join(", ")}</span></div>
                <div><span className="lbl">Dates</span><span className="val">{fmtLong(meta.arrival)} – {fmtLong(meta.departure)}</span></div>
                <div><span className="lbl">Total duration</span><span className="val">{meta.total} days · {itinerary.length} {itinerary.length === 1 ? "destination" : "destinations"}</span></div>
              </div>

              <table className="sum-table">
                <thead><tr><th>#</th><th>Country</th><th>City</th><th>Dates</th><th>Days</th><th>Accommodation</th></tr></thead>
                <tbody>
                  {itinerary.map((d, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td><td>{d.country}</td><td>{d.city}</td>
                      <td className="nowrap">{fmtStamp(parseD(d.arrival))} – {fmtStamp(parseD(d.departure))}</td>
                      <td>{daysInc(d.arrival, d.departure)}</td><td>{d.hotelName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {itinerary.map((dest, di) => (
                <section className="dest-block" key={di}>
                  <div className="dest-block-head">
                    <span className="dest-pin">{di + 1}</span>
                    <div>
                      <h3>{dest.country} — {dest.city}</h3>
                      <div className="dest-meta">{fmtLong(dest.arrival)} – {fmtLong(dest.departure)} · {daysInc(dest.arrival, dest.departure)} days</div>
                    </div>
                  </div>
                  {(dest.hotelName || dest.hotelPhone || dest.arrivalTransfer || dest.departureTransfer) && (
                    <div className="logistics">
                      {dest.hotelName && <span><b>Stay:</b> {dest.hotelName}{dest.hotelPhone ? ` · ${dest.hotelPhone}` : ""}</span>}
                      {dest.arrivalTransfer && <span><b>Arrival:</b> {dest.arrivalTransfer}</span>}
                      {dest.departureTransfer && <span><b>Departure:</b> {dest.departureTransfer}</span>}
                    </div>
                  )}
                  <div className="days">
                    {dest.days.map((day) => (
                      <div className="day" key={day.globalDay}>
                        <div className="day-rail"><span className="stamp">{day.globalDay}</span></div>
                        <div className="day-body">
                          <div className="day-top"><h4>Day {day.globalDay} — {day.title}</h4><span className="day-date">{fmtStamp(day.date)}</span></div>
                          <ul>{day.bullets.map((b, bi) => <li key={bi}>{b}</li>)}</ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <div className="doc-foot">Travel Market · Generated for travel planning and documentation purposes.</div>
            </div>
          </article>
        </>
      )}

      {/* ---------------- FOOTER ---------------- */}
      <footer className="footer no-print">
        <img src="/logo.png" alt="Travel Market — سوق السفر للسياحة" />
        <p>© {new Date().getFullYear()} Travel Market · سوق السفر للسياحة</p>
      </footer>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}{hint && <em className="field-hint"> · {hint}</em>}</span>
      {children}
    </label>
  );
}

/* ============================================================ STYLES ============================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap');

.tg-root{
  --bg:#ffffff;
  --ink:#15131F;
  --ink-soft:#403D52;
  --muted:#827FA0;
  --line:#ECEAF4;
  --card:#ffffff;
  --violet:#7C3AED;
  --indigo:#6366F1;
  --blue:#3B82F6;
  --grad:linear-gradient(120deg,#8B5CF6 0%,#6366F1 52%,#3B82F6 100%);
  --grad-btn:linear-gradient(120deg,#7C3AED 0%,#6366F1 100%);
  --tint:#F3EFFE;
  --display:'Plus Jakarta Sans', system-ui, sans-serif;
  --sans:'Inter', system-ui, -apple-system, sans-serif;
  --shadow-sm:0 1px 2px rgba(20,18,40,.06);
  --shadow:0 14px 40px -18px rgba(80,60,180,.28);
  --radius:18px;
  font-family:var(--sans); color:var(--ink); background:var(--bg);
  -webkit-font-smoothing:antialiased; line-height:1.5;
}
.tg-root *{box-sizing:border-box;}
.tg-root a{color:inherit;text-decoration:none;}

/* nav */
.nav{position:sticky;top:0;z-index:40;background:rgba(255,255,255,.82);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);}
.nav-inner{max-width:1120px;margin:0 auto;display:flex;align-items:center;gap:18px;padding:12px 20px;}
.brand{display:flex;align-items:center;gap:11px;}
.brand-chip{width:40px;height:40px;border-radius:11px;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-sm);flex:0 0 auto;}
.brand-chip img{width:100%;height:100%;object-fit:contain;}
.brand-name{font-family:var(--display);font-weight:800;font-size:18px;letter-spacing:-.02em;}
.nav-links{display:none;margin-left:8px;gap:26px;}
.nav-links a{font-size:14px;font-weight:500;color:var(--ink-soft);}
.nav-links a:hover{color:var(--violet);}
.nav-cta{margin-left:auto;font-family:var(--display);font-weight:700;font-size:14px;color:#fff;background:var(--grad-btn);border:none;border-radius:11px;padding:10px 18px;cursor:pointer;box-shadow:0 10px 22px -10px rgba(99,102,241,.55);transition:.18s;}
.nav-cta:hover{transform:translateY(-1px);filter:brightness(1.05);}
@media(min-width:860px){.nav-links{display:flex;}}

/* hero */
.hero{position:relative;overflow:hidden;
  background:
    radial-gradient(60% 48% at 50% -4%, rgba(124,58,237,.12), transparent 70%),
    radial-gradient(40% 40% at 86% 16%, rgba(59,130,246,.10), transparent 70%),
    radial-gradient(36% 38% at 12% 24%, rgba(236,72,153,.07), transparent 70%),
    #fff;
}
.hero::before{content:"";position:absolute;inset:0;
  background-image:radial-gradient(circle, #E5E0F4 1px, transparent 1.5px);
  background-size:24px 24px;
  -webkit-mask:radial-gradient(72% 64% at 50% 32%, #000, transparent 82%);
  mask:radial-gradient(72% 64% at 50% 32%, #000, transparent 82%);
  opacity:.65;pointer-events:none;}
.hero-wrap{position:relative;max-width:1120px;margin:0 auto;padding:60px 20px 78px;text-align:center;}

.hero-emblem{display:inline-flex;width:74px;height:74px;border-radius:20px;background:#000;overflow:hidden;align-items:center;justify-content:center;box-shadow:0 18px 44px -16px rgba(40,20,90,.45);margin-bottom:26px;}
.hero-emblem img{width:100%;height:100%;object-fit:contain;}
.eyebrow{font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--violet);margin-bottom:16px;}
.h1{font-family:var(--display);font-weight:800;font-size:clamp(40px,7.4vw,78px);line-height:1.01;letter-spacing:-.035em;margin:0;}
.h1 .grad{background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;}
.lead{max-width:600px;margin:22px auto 0;font-size:clamp(16px,2.1vw,19px);color:var(--ink-soft);line-height:1.6;}

.proof{display:flex;align-items:center;justify-content:center;gap:12px;margin:28px 0 6px;flex-wrap:wrap;}
.avatars{display:flex;}
.av{width:32px;height:32px;border-radius:50%;border:2px solid #fff;margin-left:-9px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;font-family:var(--display);box-shadow:var(--shadow-sm);}
.av:first-child{margin-left:0;}
.proof span{font-size:13.5px;color:var(--muted);font-weight:500;}

.cta-row{margin-top:24px;display:flex;flex-direction:column;align-items:center;gap:10px;}
.btn-primary{font-family:var(--display);font-weight:700;font-size:16px;color:#fff;background:var(--grad-btn);border:none;border-radius:14px;padding:16px 30px;cursor:pointer;box-shadow:0 16px 34px -12px rgba(99,102,241,.6);transition:.18s;}
.btn-primary:hover{transform:translateY(-2px);filter:brightness(1.06);}
.cta-note{font-size:13px;color:var(--muted);}

/* floating cards */
.floats{position:absolute;inset:0;pointer-events:none;display:none;}
@media(min-width:1120px){.floats{display:block;}}
.fcard{position:absolute;background:#fff;border:1px solid var(--line);border-radius:13px;box-shadow:0 18px 40px -20px rgba(60,40,130,.35);padding:11px 14px;font-size:13px;font-weight:500;color:var(--ink);white-space:nowrap;}

/* how it works */
.hiw{max-width:1120px;margin:0 auto;padding:54px 20px 10px;}
.hiw-head{text-align:center;margin-bottom:30px;}
.hiw-head h2{font-family:var(--display);font-weight:800;font-size:clamp(26px,4vw,38px);letter-spacing:-.025em;margin:0 0 8px;}
.hiw-head p{color:var(--muted);margin:0;font-size:15px;}
.steps{display:grid;grid-template-columns:1fr;gap:16px;}
@media(min-width:760px){.steps{grid-template-columns:repeat(3,1fr);}}
.step{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:24px;box-shadow:var(--shadow-sm);}
.step .n{display:inline-flex;width:34px;height:34px;border-radius:10px;background:var(--grad-btn);color:#fff;font-family:var(--display);font-weight:700;align-items:center;justify-content:center;margin-bottom:14px;}
.step h3{font-family:var(--display);font-weight:700;font-size:17px;margin:0 0 6px;}
.step p{margin:0;font-size:14px;color:var(--ink-soft);line-height:1.55;}

/* builder */
.wrap{max-width:760px;margin:0 auto;padding:44px 18px 50px;}
.build-head{text-align:center;margin-bottom:24px;}
.build-head h2{font-family:var(--display);font-weight:800;font-size:clamp(24px,4vw,34px);letter-spacing:-.025em;margin:0 0 6px;}
.build-head p{color:var(--muted);margin:0;font-size:15px;}

.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-sm);padding:22px;margin-bottom:18px;}
.card-head{display:flex;align-items:center;gap:12px;margin-bottom:18px;}
.card-head h2{font-family:var(--display);font-weight:700;font-size:19px;margin:0;}
.num{font-family:var(--display);font-size:12px;font-weight:700;color:var(--violet);background:var(--tint);border-radius:8px;padding:5px 8px;}
.badge{margin-left:auto;font-size:11px;font-weight:600;background:var(--ink);color:#fff;padding:5px 11px;border-radius:20px;}
.badge.ghost{background:var(--tint);color:var(--violet);}

.field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;}
.field:last-child{margin-bottom:0;}
.field-label{font-size:12.5px;font-weight:600;color:var(--ink-soft);}
.field-hint{font-style:normal;color:var(--muted);font-weight:400;}
.field input{font-family:var(--sans);font-size:15px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:11px;padding:11px 13px;width:100%;transition:.15s;}
.field input::placeholder{color:#B4B1C9;}
.field input:focus{outline:none;border-color:var(--violet);box-shadow:0 0 0 3px rgba(124,58,237,.14);}
.grid2{display:grid;grid-template-columns:1fr;gap:0 14px;}
@media(min-width:560px){.grid2{grid-template-columns:1fr 1fr;}}

.stack{display:flex;flex-direction:column;}
.traveler-row{display:flex;align-items:flex-end;gap:10px;}
.traveler-row .field{flex:1;}
.icon-btn{flex:0 0 auto;width:42px;height:44px;margin-bottom:14px;border:1px solid var(--line);background:#fff;border-radius:11px;color:var(--muted);font-size:14px;cursor:pointer;transition:.15s;}
.icon-btn.sm{width:32px;height:32px;margin:0;border-radius:9px;}
.icon-btn:hover:not(:disabled){border-color:var(--violet);color:var(--violet);}
.icon-btn:disabled{opacity:.35;cursor:not-allowed;}
.add-btn{margin-top:14px;background:var(--tint);border:1px solid transparent;color:var(--violet);font-family:var(--display);font-weight:700;font-size:14px;padding:12px 16px;border-radius:11px;cursor:pointer;transition:.15s;width:100%;}
.add-btn:hover{filter:brightness(.98);box-shadow:inset 0 0 0 1px rgba(124,58,237,.3);}

.dest-rail{position:relative;display:flex;flex-direction:column;gap:18px;}
.dest-rail::before{content:"";position:absolute;left:17px;top:18px;bottom:18px;width:2px;background:repeating-linear-gradient(var(--indigo) 0 4px, transparent 4px 10px);opacity:.5;}
.dest-card{position:relative;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 18px 18px 20px;margin-left:8px;box-shadow:var(--shadow-sm);}
.pin{position:absolute;left:-21px;top:18px;width:26px;height:26px;border-radius:50%;background:var(--grad-btn);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-size:12px;font-weight:700;box-shadow:0 0 0 4px #fff;}
.dest-head{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.dest-head h3{font-family:var(--display);font-weight:700;font-size:16px;margin:0;}
.dest-head-right{margin-left:auto;display:flex;align-items:center;gap:8px;}
.dur-chip{font-size:11px;font-weight:600;color:var(--violet);background:var(--tint);padding:4px 10px;border-radius:20px;white-space:nowrap;}

.banner{border-radius:14px;padding:16px 18px;margin-bottom:16px;font-size:14px;}
.banner ul{margin:8px 0 0;padding-left:18px;}
.banner li{margin:3px 0;}
.banner.err{background:#FCEBEC;border:1px solid #F2C2C6;color:#9B2533;}
.banner.warn{background:#FBF4E4;border:1px solid #E8D9AE;color:#7A5E1E;}

.generate{width:100%;background:var(--grad-btn);color:#fff;border:none;border-radius:14px;font-family:var(--display);font-weight:700;font-size:16px;padding:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:.18s;box-shadow:0 16px 34px -12px rgba(99,102,241,.55);}
.generate:hover:not(:disabled){transform:translateY(-2px);filter:brightness(1.05);}
.generate:disabled{opacity:.75;cursor:wait;}
.spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.45);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;}
@keyframes sp{to{transform:rotate(360deg);}}
.soft-note{font-size:13px;color:var(--muted);text-align:center;margin:12px 4px 0;}

.action-bar{position:sticky;top:0;z-index:30;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:12px 16px;background:rgba(255,255,255,.86);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);}
.act{font-family:var(--display);font-weight:600;font-size:13.5px;padding:9px 16px;border-radius:10px;cursor:pointer;background:#fff;border:1px solid var(--line);color:var(--ink);transition:.15s;}
.act:hover:not(:disabled){border-color:var(--violet);color:var(--violet);}
.act.primary{background:var(--grad-btn);border-color:transparent;color:#fff;}
.act.primary:hover{filter:brightness(1.05);color:#fff;}
.act:disabled{opacity:.5;cursor:not-allowed;}

/* document */
.doc{max-width:780px;margin:26px auto 20px;background:#fff;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden;}
.doc-pad{padding:38px 34px;}
.doc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding-bottom:20px;border-bottom:2px solid var(--ink);}
.doc-brand{display:flex;align-items:center;gap:14px;}
.doc-chip{width:46px;height:46px;border-radius:12px;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center;flex:0 0 auto;}
.doc-chip img{width:100%;height:100%;object-fit:contain;}
.doc-kicker{font-family:var(--display);font-size:11px;font-weight:700;letter-spacing:.28em;color:var(--violet);margin-bottom:6px;}
.doc-title{font-family:var(--display);font-weight:800;font-size:clamp(22px,5vw,32px);line-height:1.05;letter-spacing:-.03em;margin:0;}
.doc-agency{text-align:right;font-size:12px;color:var(--muted);line-height:1.5;flex:0 0 auto;}
.doc-agency strong{color:var(--ink);font-size:13px;}

.doc-summary{display:flex;flex-wrap:wrap;gap:18px 32px;padding:20px 0;border-bottom:1px solid var(--line);}
.doc-summary > div{display:flex;flex-direction:column;gap:3px;}
.doc-summary .lbl{font-size:10.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);}
.doc-summary .val{font-size:14.5px;color:var(--ink);font-weight:500;}

.sum-table{width:100%;border-collapse:collapse;margin:22px 0 8px;font-size:13px;}
.sum-table th{text-align:left;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:8px 10px;border-bottom:1px solid var(--line);}
.sum-table td{padding:10px;border-bottom:1px solid var(--line);color:var(--ink);vertical-align:top;}
.sum-table tr:last-child td{border-bottom:none;}
.nowrap{white-space:nowrap;}

.dest-block{margin-top:34px;}
.dest-block-head{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
.dest-pin{width:30px;height:30px;flex:0 0 auto;border-radius:50%;background:var(--grad-btn);color:#fff;display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:700;font-size:13px;}
.dest-block-head h3{font-family:var(--display);font-weight:700;font-size:19px;margin:0;}
.dest-meta{font-size:11.5px;color:var(--muted);margin-top:2px;}
.logistics{display:flex;flex-wrap:wrap;gap:6px 22px;font-size:12.5px;color:var(--ink-soft);background:var(--tint);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:0 0 18px 44px;}
.logistics b{color:var(--violet);font-weight:700;}

.days{position:relative;margin-left:14px;}
.day{display:flex;}
.day-rail{position:relative;flex:0 0 30px;display:flex;justify-content:center;}
.day-rail::before{content:"";position:absolute;top:0;bottom:0;width:2px;background:repeating-linear-gradient(var(--indigo) 0 3px, transparent 3px 8px);opacity:.45;}
.day:first-child .day-rail::before{top:13px;}
.day:last-child .day-rail::before{bottom:auto;height:13px;}
.stamp{position:relative;z-index:1;margin-top:4px;width:26px;height:26px;border-radius:50%;background:#fff;border:1.5px solid var(--violet);color:var(--violet);display:flex;align-items:center;justify-content:center;font-family:var(--display);font-weight:700;font-size:11px;}
.day-body{flex:1;padding:0 0 22px 16px;}
.day-top{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}
.day-body h4{font-family:var(--display);font-weight:700;font-size:15px;margin:2px 0 8px;}
.day-date{font-size:10.5px;color:var(--muted);white-space:nowrap;}
.day-body ul{margin:0;padding-left:18px;}
.day-body li{font-size:13.5px;color:var(--ink-soft);margin:4px 0;}
.doc-foot{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);font-size:11px;color:var(--muted);text-align:center;}

/* footer */
.footer{background:#000;color:#9C97B8;margin-top:50px;text-align:center;padding:46px 20px 40px;}
.footer img{height:150px;width:auto;display:block;margin:0 auto 12px;}
.footer p{margin:0;font-size:12.5px;letter-spacing:.02em;}

/* anims */
.pop{animation:pop .28s ease;}
@keyframes pop{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
@media(prefers-reduced-motion:reduce){.pop,.generate,.btn-primary,.nav-cta,.spin{animation:none!important;transition:none!important;}}

/* print */
@media print{
  .tg-root{background:#fff;}
  .no-print{display:none!important;}
  .doc{margin:0;border:none;border-radius:0;box-shadow:none;max-width:none;}
  .doc-pad{padding:0;}
  @page{margin:16mm 14mm;}
  .dest-block,.day,.sum-table{break-inside:avoid;}
  .doc-chip{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .doc-title,.doc-kicker,.dest-block-head h3,.day-body h4{color:#15131F!important;}
}
`;
