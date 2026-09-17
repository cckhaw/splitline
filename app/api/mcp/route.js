import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { buildSvg } from "@/lib/svg";

// This is the "hosted plugin": once deployed, its URL
// (https://your-domain.vercel.app/api/mcp) can be added as a custom
// connector by anyone running an MCP client — claude.ai, Claude Desktop,
// Cursor, Windsurf, or your own agent. It renders from numbers you give
// it; it does not read your Strava account (that's what the website's
// "Connect Strava" flow is for, and what the render_from_strava tool
// below optionally adds once a caller supplies a token explicitly).

const handler = createMcpHandler((server) => {
  server.registerTool(
    "render_telemetry_overlay",
    {
      title: "Render telemetry overlay",
      description:
        "Renders a Strava-style post-workout telemetry overlay card from a workout's own summary numbers — distance, moving time, elevation, heart rate, power, and an optional elevation/HR/power trace. Returns the SVG as an image content block.",
      inputSchema: z.object({
        name: z.string().describe("Activity title, e.g. 'Riverside morning run'"),
        sport: z.string().default("Workout"),
        date: z.string().optional().describe("ISO date string; defaults to now"),
        distance_km: z.number(),
        moving_min: z.number().describe("Moving time in minutes"),
        elevation_gain_m: z.number().optional().default(0),
        avg_hr: z.number().optional(),
        avg_watts: z.number().optional(),
        avg_speed_kmh: z.number().optional(),
        calories: z.number().optional(),
        trace: z.array(z.number()).optional().describe("Elevation, HR, or power series to sparkline across the card"),
        trace_label: z.string().optional(),
        hero_metric: z.enum(["pace", "speed", "power", "hr"]).optional(),
        units: z.enum(["metric", "imperial"]).optional().default("metric"),
        theme: z.enum(["ink", "paper", "signal"]).optional().default("ink"),
      }),
    },
    async (input) => {
      const svg = buildSvg(input);
      return {
        content: [
          { type: "text", text: `Rendered "${input.name}" as a ${input.theme || "ink"}-theme overlay.` },
          { type: "image", data: Buffer.from(svg).toString("base64"), mimeType: "image/svg+xml" },
        ],
      };
    }
  );
});

export { handler as GET, handler as POST };
