// Server-side route. The API key stays here and is never sent to the browser.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const {
      city,
      country,
      hotelName,
      isFirstDest,
      isFinalDest,
      nextCity,
      days,
      variation,
    } = body;

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return Response.json({ ok: false, error: "missing_key" }, { status: 200 });
    }

    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const dayLines = (days || [])
      .map((d) => {
        let role = "exploration day";

        if (d.isFirst) {
          role = isFirstDest
            ? "arrival day (first stop of the whole trip, includes hotel check-in)"
            : "arrival day (just travelled here, includes hotel check-in)";
        }

        if (d.isLast) {
          role = isFinalDest
            ? "final departure day (depart for home)"
            : `departure day (travel onward to ${nextCity})`;
        }

        return `Day ${d.dayNumber} (${d.dateLong}): ${role}`;
      })
      .join("\n");

    const prompt = `You are a professional travel agency itinerary writer. Write a concise, formal, realistic day-by-day itinerary for one destination of a larger trip. This will be used by travellers and for visa documentation, so keep it precise and professional.

Destination: ${city}, ${country}
Accommodation: ${hotelName || "not specified"}
Days to cover:
${dayLines}

CRITICAL RULES:
- Each day must be meaningfully different from the other days.
- Do NOT repeat the same attraction, landmark, neighbourhood, museum, beach, park, market, shopping area, viewpoint, or experience across multiple days.
- Do NOT use generic repeated phrases like "explore historic sites", "city sightseeing", "local attractions", or "leisure time" unless paired with specific real places.
- For exploration days, use real and specific places in ${city}.
- Each exploration day must include 2 to 4 distinct real places or experiences.
- Spread the itinerary logically across the stay: landmarks, museums, neighbourhoods, food areas, nature, markets, shopping, viewpoints, waterfronts, cultural experiences, and possible short day trips.
- If the stay is longer than 5 days, include hidden gems, local districts, relaxed days, nature spots, cultural visits, and nearby excursions to avoid repetition.
- Arrival days should focus on arrival, hotel check-in, and light nearby orientation.
- Departure days should focus on check-out, transfer, and departure/onward travel.
- Do NOT include prices, costs, booking links, or long paragraphs.
- Formal travel-agency tone.
- Keep each bullet short: 3-10 words.
- Return 3 to 5 bullets per day.
${variation ? "- Offer a fresh selection of sights compared with a typical first draft." : ""}

Return ONLY valid JSON, no markdown, no commentary, in exactly this shape:
{"days":[{"dayNumber":<number>,"title":"<string>","bullets":["<string>","<string>","<string>"]}]}

Include one object per day above, using the same dayNumber values, in order.`;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      return Response.json(
        { ok: false, error: "api", status: resp.status, detail },
        { status: 200 }
      );
    }

    const data = await resp.json();

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ ok: false, error: "parse" }, { status: 200 });
    }

    if (!parsed || !Array.isArray(parsed.days)) {
      return Response.json({ ok: false, error: "shape" }, { status: 200 });
    }

    return Response.json({ ok: true, days: parsed.days }, { status: 200 });
  } catch (e) {
    return Response.json({ ok: false, error: "server" }, { status: 200 });
  }
}
